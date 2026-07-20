import { ChannelConfig } from '../../models/ChannelConfig.js';

// Estados que cuentan como "el canal sigue disponible para operar". Un canal
// deshabilitado deja de usarse y el envio cae al numero por defecto.
const USABLE_STATUSES = ['connected', 'pending', 'error'];
const CLOUD_CHANNELS = ['whatsapp_cloud', 'whatsapp_cloud_api'];

function withSecrets(query) {
  return query.select('+credentials +verifyToken +webhookSecret');
}

function isCloud(config) {
  return config && CLOUD_CHANNELS.includes(config.channel);
}

/**
 * Campos que le faltan a una cuenta Cloud para poder enviar plantillas. Vacio
 * si esta completa. Requiere que el config se haya cargado con `+credentials`.
 */
export function cloudAccountMissingFields(config) {
  if (!config) return ['channelConfig'];
  const credentials = config.getDecryptedCredentials?.() || {};
  const missing = [];
  if (!config.phoneNumberId) missing.push('phoneNumberId');
  if (!credentials.accessToken) missing.push('accessToken');
  if (!config.externalBusinessId) missing.push('externalBusinessId');
  return missing;
}

export function isCloudAccountComplete(config) {
  return isCloud(config) && cloudAccountMissingFields(config).length === 0;
}

/**
 * Numero por defecto de la empresa: el canal habilitado marcado `isDefault`; si
 * no hay ninguno, el mas antiguo en estado `connected`; `null` si no hay ninguno
 * utilizable. Siempre scoped por companyId.
 */
export async function getDefaultAccount(companyId) {
  if (!companyId) return null;

  const explicit = await withSecrets(
    ChannelConfig.findOne({
      companyId,
      isDefault: true,
      status: { $ne: 'disabled' }
    })
  );
  if (explicit) return explicit;

  return withSecrets(
    ChannelConfig.findOne({
      companyId,
      status: 'connected'
    }).sort({ createdAt: 1 })
  );
}

/** Un canal concreto de la empresa, con validacion de tenant. `null` si no existe. */
export async function getAccountById(companyId, id) {
  if (!companyId || !id) return null;
  return withSecrets(ChannelConfig.findOne({ _id: id, companyId }));
}

/**
 * Marca un canal como numero por defecto de la empresa y DESMARCA el resto en la
 * misma operacion (maximo uno por empresa). Solo puede marcarse un canal
 * habilitado. Devuelve el canal actualizado; lanza 400/404 con `.status`.
 */
export async function setDefaultAccount(companyId, id) {
  const config = await getAccountById(companyId, id);
  if (!config) {
    throw Object.assign(new Error('Canal no encontrado'), { status: 404 });
  }
  if (config.status === 'disabled') {
    throw Object.assign(
      new Error('Solo un canal habilitado puede marcarse como numero por defecto'),
      { status: 400 }
    );
  }
  // Desmarca cualquier otro default de la empresa y marca este, atomico por doc.
  await ChannelConfig.updateMany(
    { companyId, _id: { $ne: config._id }, isDefault: true },
    { $set: { isDefault: false } }
  );
  config.isDefault = true;
  await config.save();
  return config;
}

/**
 * UNICO camino por el que el envio de respuestas elige numero: si la
 * conversacion fija un channelConfigId y ese canal sigue habilitado, se usa ese;
 * en cualquier otro caso (sin canal, canal borrado o deshabilitado) cae al
 * numero por defecto de la empresa.
 */
export async function resolveAccountForConversation(conversation) {
  if (!conversation?.companyId) return null;

  if (conversation.channelConfigId) {
    const pinned = await getAccountById(conversation.companyId, conversation.channelConfigId);
    if (pinned && USABLE_STATUSES.includes(pinned.status)) {
      return pinned;
    }
  }
  return getDefaultAccount(conversation.companyId);
}

/**
 * Cuenta Cloud para operaciones que EXIGEN Cloud API (plantillas). Prefiere una
 * cuenta completa (phoneNumberId + accessToken + externalBusinessId): primero el
 * default si es cloud y completo, luego cualquier otra cloud completa. Si ninguna
 * esta completa, devuelve la primera cloud para que el caller informe que campo
 * falta (via `cloudAccountMissingFields`). `null` si la empresa no tiene cloud.
 */
export async function getDefaultCloudAccount(companyId) {
  if (!companyId) return null;

  const def = await getDefaultAccount(companyId);
  if (isCloudAccountComplete(def)) return def;

  const cloudAccounts = await withSecrets(
    ChannelConfig.find({
      companyId,
      channel: { $in: CLOUD_CHANNELS },
      status: { $ne: 'disabled' }
    }).sort({ isDefault: -1, createdAt: 1 })
  );

  const complete = cloudAccounts.find((account) => isCloudAccountComplete(account));
  if (complete) return complete;

  // Ninguna completa: si el default ya era cloud (aunque incompleto) se prefiere
  // para que el mensaje de error apunte al numero que el usuario espera usar.
  if (isCloud(def)) return def;
  return cloudAccounts[0] || null;
}
