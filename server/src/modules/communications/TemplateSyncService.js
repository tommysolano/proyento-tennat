import { MessageTemplate, metaCategoryFromMessageCategory } from '../../models/MessageTemplate.js';
import { User } from '../../models/User.js';
import { getChannelAdapter } from '../conversations/adapters/index.js';
import { getDefaultCloudAccount, cloudAccountMissingFields } from './accountGateway.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { ActivityLog } from '../../models/ActivityLog.js';
import { logger } from '../../utils/logger.js';

// ---- Helpers puros (sin base de datos, testeables directamente) ----

/** snake_case sin espacios: minusculas, [a-z0-9_], colapsa y recorta guiones. */
export function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Categoria de Meta a enviar al registrar: la explicita o la derivada. */
export function metaCategoryFor(template) {
  return template.metaCategory || metaCategoryFromMessageCategory(template.messageCategory);
}

/** Indices (1-based, ordenados y unicos) de los placeholders {{n}} de un texto. */
export function extractPlaceholders(text) {
  const found = new Set();
  const regex = /\{\{\s*(\d+)\s*\}\}/g;
  let match;
  while ((match = regex.exec(String(text || '')))) found.add(Number(match[1]));
  return [...found].sort((a, b) => a - b);
}

/** Nombres de variables del cuerpo en orden; si no hay, deriva de los {{n}}. */
export function orderedVariableNames(template) {
  if (Array.isArray(template.variables) && template.variables.length) {
    return template.variables.map((value) => String(value));
  }
  return extractPlaceholders(template.content).map((index) => String(index));
}

/** Ejemplo para la variable en posicion `index` (0-based) con nombre `name`. */
function exampleFor(template, name, index) {
  const samples = Array.isArray(template.variableSamples) ? template.variableSamples : [];
  const byName = samples.find((sample) => String(sample.key) === String(name));
  if (byName && byName.example) return byName.example;
  const byPosition = samples.find((sample) => String(sample.key) === String(index + 1));
  if (byPosition && byPosition.example) return byPosition.example;
  if (samples[index]?.example) return samples[index].example;
  return '';
}

/** Fila de ejemplos del cuerpo, en el orden de las variables. */
export function bodyExampleRow(template) {
  return orderedVariableNames(template).map((name, index) => exampleFor(template, name, index));
}

function metaButtonFormat(button) {
  if (button.type === 'url') return { type: 'URL', text: button.text, url: button.url };
  if (button.type === 'phone') {
    return { type: 'PHONE_NUMBER', text: button.text, phone_number: button.phone };
  }
  return { type: 'QUICK_REPLY', text: button.text };
}

/**
 * Construye el arreglo `components` de Graph API para REGISTRAR la plantilla
 * (con ejemplos). Puro: no toca red ni DB.
 */
export function buildComponents(template) {
  const components = [];

  if (template.headerType && template.headerType !== 'none') {
    if (template.headerType === 'text') {
      const header = { type: 'HEADER', format: 'TEXT', text: template.headerText || '' };
      const placeholders = extractPlaceholders(template.headerText);
      if (placeholders.length) {
        const sample = exampleFor(template, String(placeholders[0]), placeholders[0] - 1);
        header.example = { header_text: [sample] };
      }
      components.push(header);
    } else {
      // Cabecera de media: el registro real exige un header_handle subido a Meta;
      // aqui se pasa la URL publica como ejemplo (ver caveat en WHATSAPP.md).
      components.push({
        type: 'HEADER',
        format: template.headerType.toUpperCase(),
        example: { header_handle: [template.headerMediaUrl || ''] }
      });
    }
  }

  const body = { type: 'BODY', text: template.content || '' };
  const exampleRow = bodyExampleRow(template);
  if (exampleRow.length) {
    body.example = { body_text: [exampleRow] };
  }
  components.push(body);

  if (template.footer) {
    components.push({ type: 'FOOTER', text: template.footer });
  }

  if (Array.isArray(template.buttons) && template.buttons.length) {
    components.push({ type: 'BUTTONS', buttons: template.buttons.map(metaButtonFormat) });
  }

  return components;
}

/**
 * Construye el objeto `template` para ENVIAR (name/language/components con
 * valores sustituidos). `values` es un objeto por nombre de variable o por
 * indice (string). Sin valor, cae al ejemplo. Puro.
 */
export function buildOutboundTemplate(template, values = {}) {
  const resolve = (name, index) => {
    if (values[name] !== undefined && values[name] !== '') return String(values[name]);
    if (values[String(index + 1)] !== undefined && values[String(index + 1)] !== '') {
      return String(values[String(index + 1)]);
    }
    return exampleFor(template, name, index);
  };

  const components = [];

  if (template.headerType && template.headerType !== 'none') {
    if (template.headerType === 'text') {
      const placeholders = extractPlaceholders(template.headerText);
      if (placeholders.length) {
        components.push({
          type: 'header',
          parameters: [{ type: 'text', text: resolve(String(placeholders[0]), placeholders[0] - 1) }]
        });
      }
    } else if (template.headerMediaUrl) {
      const format = template.headerType;
      components.push({
        type: 'header',
        parameters: [{ type: format, [format]: { link: template.headerMediaUrl } }]
      });
    }
  }

  const names = orderedVariableNames(template);
  if (names.length) {
    components.push({
      type: 'body',
      parameters: names.map((name, index) => ({ type: 'text', text: resolve(name, index) }))
    });
  }

  // Meta identifica la plantilla por su NOMBRE (snake_case), no por el id
  // numerico que guardamos en providerTemplateId. Tras registrar, template.name
  // ya viene normalizado; para las importadas es el nombre real de Meta.
  const built = {
    name: normalizeName(template.name) || template.name,
    language: { code: template.language || 'es' }
  };
  if (components.length) built.components = components;
  return built;
}

/** Validacion local previa al registro. Devuelve { valid, errors[], normalizedName }. */
export function validateForRegister(template) {
  const errors = [];
  if (template.channel !== 'whatsapp_cloud') {
    errors.push('Solo las plantillas de WhatsApp (API de Meta) se registran en Meta.');
  }
  const normalizedName = normalizeName(template.name);
  if (!normalizedName) errors.push('El nombre no puede quedar vacio al normalizarlo a snake_case.');

  const names = orderedVariableNames(template);
  names.forEach((name, index) => {
    if (!exampleFor(template, name, index)) {
      errors.push(`Falta un ejemplo para la variable {{${index + 1}}}${name && name !== String(index + 1) ? ` (${name})` : ''}.`);
    }
  });

  if (['image', 'document', 'video'].includes(template.headerType) && !template.headerMediaUrl) {
    errors.push('La cabecera de media requiere una URL publica (headerMediaUrl).');
  }
  if (template.headerType === 'text' && !template.headerText) {
    errors.push('La cabecera de texto requiere headerText.');
  }

  if (Array.isArray(template.buttons)) {
    if (template.buttons.length > 3) errors.push('Maximo 3 botones.');
    template.buttons.forEach((button, index) => {
      if (!String(button.text || '').trim()) errors.push(`El boton ${index + 1} necesita texto.`);
      if (button.type === 'url' && !String(button.url || '').trim()) {
        errors.push(`El boton ${index + 1} (URL) necesita una URL.`);
      }
      if (button.type === 'phone' && !String(button.phone || '').trim()) {
        errors.push(`El boton ${index + 1} (telefono) necesita un numero.`);
      }
    });
  }

  return { valid: errors.length === 0, errors, normalizedName };
}

/**
 * Verifica que la cuenta resuelta para una plantilla sea Cloud (API de Meta). Un
 * numero QR no admite plantillas HSM: se rechaza con un error claro en vez de
 * simular un envio. Puro; lanza 400 con `.status`.
 */
export function assertCloudAccountForTemplate(account) {
  if (!account) {
    throw Object.assign(
      new Error('No hay un numero de WhatsApp disponible para enviar la plantilla'),
      { status: 400 }
    );
  }
  if (!['whatsapp_cloud', 'whatsapp_cloud_api'].includes(account.channel)) {
    throw Object.assign(
      new Error('El numero QR no admite plantillas. Usa un numero con API de Meta.'),
      { status: 400 }
    );
  }
  return account;
}

/** Estado de Meta -> estado interno del ciclo. */
export function mapMetaStatus(metaStatus) {
  const status = String(metaStatus || '').toUpperCase();
  const map = {
    APPROVED: 'approved',
    PENDING: 'pending',
    IN_APPEAL: 'pending',
    PENDING_DELETION: 'disabled',
    REJECTED: 'rejected',
    DISABLED: 'disabled',
    PAUSED: 'disabled',
    DELETED: 'disabled'
  };
  return map[status] || 'pending';
}

/**
 * Reconciliacion pura entre plantillas locales y remotas (de Meta), emparejadas
 * por nombre normalizado + idioma. Devuelve { updates, imports } sin tocar DB.
 * - updates: [{ localId, changes }] para las que existen local y remotamente.
 * - imports: [{ ... }] para las que existen en Meta pero no localmente.
 */
export function reconcileTemplates(localTemplates, remoteTemplates, { now = new Date() } = {}) {
  const keyOf = (name, language) => `${normalizeName(name)}::${String(language || '').toLowerCase()}`;
  const localByKey = new Map(
    localTemplates.map((local) => [keyOf(local.providerTemplateId || local.name, local.language), local])
  );
  // Segundo indice por nombre de plantilla local por si providerTemplateId difiere.
  for (const local of localTemplates) {
    localByKey.set(keyOf(local.name, local.language), local);
  }

  const updates = [];
  const imports = [];
  for (const remote of remoteTemplates) {
    const key = keyOf(remote.name, remote.language);
    const local = localByKey.get(key);
    const status = mapMetaStatus(remote.status);
    if (local) {
      updates.push({
        localId: local._id,
        changes: {
          status,
          rejectionReason: status === 'rejected' ? remote.rejectedReason || 'Rechazada por Meta' : '',
          providerTemplateId: remote.providerTemplateId || local.providerTemplateId || '',
          providerStatus: remote.status || '',
          syncedAt: now
        }
      });
    } else {
      imports.push({
        name: remote.name,
        language: remote.language || 'es',
        status,
        rejectionReason: status === 'rejected' ? remote.rejectedReason || 'Rechazada por Meta' : '',
        providerTemplateId: remote.providerTemplateId || '',
        providerStatus: remote.status || '',
        category: remote.category || '',
        components: remote.components || []
      });
    }
  }
  return { updates, imports };
}

/** Convierte los `components` de Meta importados en campos del modelo local. */
export function templateFromRemoteComponents(components = []) {
  const fields = { headerType: 'none', headerText: '', footer: '', content: '', buttons: [] };
  for (const component of components) {
    const type = String(component.type || '').toUpperCase();
    if (type === 'HEADER') {
      const format = String(component.format || 'TEXT').toLowerCase();
      fields.headerType = format === 'text' ? 'text' : format;
      if (format === 'text') fields.headerText = component.text || '';
    } else if (type === 'BODY') {
      fields.content = component.text || '';
    } else if (type === 'FOOTER') {
      fields.footer = component.text || '';
    } else if (type === 'BUTTONS') {
      fields.buttons = (component.buttons || []).map((button) => {
        const buttonType = String(button.type || '').toUpperCase();
        if (buttonType === 'URL') return { type: 'url', text: button.text || '', url: button.url || '' };
        if (buttonType === 'PHONE_NUMBER') {
          return { type: 'phone', text: button.text || '', phone: button.phone_number || '' };
        }
        return { type: 'quick_reply', text: button.text || '' };
      });
    }
  }
  return fields;
}

// ---- Operaciones con DB / red ----

async function notifyCompanyAdmins(companyId, { title, body, metadata }) {
  const admins = await User.find({ companyId, role: 'ADMIN', status: { $ne: 'inactive' } })
    .select('_id distributorId')
    .lean();
  await Promise.all(
    admins.map((admin) =>
      NotificationService.create({
        companyId,
        distributorId: admin.distributorId || null,
        userId: admin._id,
        type: 'template_status_changed',
        title,
        body,
        relatedType: 'message_template',
        relatedId: metadata?.messageTemplateId || null,
        metadata
      }).catch(() => {})
    )
  );
}

export const TemplateSyncService = {
  normalizeName,
  metaCategoryFor,
  buildComponents,
  buildOutboundTemplate,
  validateForRegister,
  reconcileTemplates,
  mapMetaStatus,
  templateFromRemoteComponents,
  assertCloudAccountForTemplate,

  /**
   * Incrementa usageCount de una plantilla. Se invoca SOLO tras un envio
   * exitoso; el gate (result.success) vive en el caller.
   */
  async recordSuccessfulUse(templateId, companyId) {
    if (!templateId) return false;
    await MessageTemplate.updateOne({ _id: templateId, companyId }, { $inc: { usageCount: 1 } });
    return true;
  },

  /**
   * Registra una plantilla draft en Meta usando la cuenta cloud por defecto.
   * Reporta con precision el campo de credencial que falta si la cuenta esta
   * incompleta. `adapter` inyectable para tests.
   */
  async registerTemplate(companyId, templateId, { actorId = null, adapter = null } = {}) {
    const template = await MessageTemplate.findOne({ _id: templateId, companyId });
    if (!template) {
      throw Object.assign(new Error('Plantilla no encontrada'), { status: 404 });
    }
    if (template.providerTemplateId) {
      throw Object.assign(
        new Error('La plantilla ya esta registrada en Meta. Usa "Sincronizar" para actualizar su estado.'),
        { status: 409 }
      );
    }
    const validation = validateForRegister(template);
    if (!validation.valid) {
      throw Object.assign(new Error(validation.errors.join(' ')), {
        status: 400,
        errors: validation.errors
      });
    }

    const account = await getDefaultCloudAccount(companyId);
    const missing = cloudAccountMissingFields(account);
    if (!account || missing.length) {
      throw Object.assign(
        new Error(
          account
            ? `La cuenta de WhatsApp Cloud esta incompleta: falta ${missing.join(', ')}.`
            : 'No hay un numero de WhatsApp con API de Meta configurado.'
        ),
        { status: 400, missing }
      );
    }

    const cloudAdapter = adapter || getChannelAdapter('whatsapp_cloud', { channelConfig: account });
    const result = await cloudAdapter.createMessageTemplate({
      name: validation.normalizedName,
      language: template.language || 'es',
      category: metaCategoryFor(template),
      components: buildComponents(template)
    });
    if (!result.success) {
      throw Object.assign(new Error(result.error || 'Meta rechazo el registro de la plantilla'), {
        status: 502,
        code: result.code || null
      });
    }

    template.name = validation.normalizedName;
    template.providerTemplateId = result.providerTemplateId || validation.normalizedName;
    template.providerStatus = result.status || 'PENDING';
    template.status = mapMetaStatus(result.status || 'PENDING');
    template.rejectionReason = '';
    template.syncedAt = new Date();
    await template.save();

    await ActivityLog.create({
      companyId,
      distributorId: template.distributorId || null,
      userId: actorId || template.createdBy,
      type: 'message_template_registered',
      summary: `Plantilla registrada en Meta: ${template.name}`,
      metadata: { messageTemplateId: template._id, providerTemplateId: template.providerTemplateId }
    }).catch((error) => logger.warn('template.register_activity_failed', { error: error.message }));

    return template;
  },

  /**
   * Sincroniza el estado de las plantillas cloud de la empresa contra Meta:
   * actualiza estado/motivo de las locales e importa las que existen en Meta pero
   * no localmente. Devuelve { updated, imported }.
   */
  async syncTemplates(companyId, { actorId = null, adapter = null } = {}) {
    const account = await getDefaultCloudAccount(companyId);
    const missing = cloudAccountMissingFields(account);
    if (!account || missing.length) {
      throw Object.assign(
        new Error(
          account
            ? `La cuenta de WhatsApp Cloud esta incompleta: falta ${missing.join(', ')}.`
            : 'No hay un numero de WhatsApp con API de Meta configurado.'
        ),
        { status: 400, missing }
      );
    }

    const cloudAdapter = adapter || getChannelAdapter('whatsapp_cloud', { channelConfig: account });
    const result = await cloudAdapter.listMessageTemplates();
    if (!result.success) {
      throw Object.assign(new Error(result.error || 'Meta no devolvio las plantillas'), {
        status: 502,
        code: result.code || null
      });
    }

    const locals = await MessageTemplate.find({ companyId, channel: 'whatsapp_cloud' });
    const { updates, imports } = reconcileTemplates(locals, result.templates);

    for (const update of updates) {
      await MessageTemplate.updateOne({ _id: update.localId, companyId }, { $set: update.changes });
    }
    for (const item of imports) {
      const fields = templateFromRemoteComponents(item.components);
      await MessageTemplate.create({
        companyId,
        distributorId: account.distributorId || null,
        name: item.name,
        channel: 'whatsapp_cloud',
        type: 'whatsapp_template',
        language: item.language,
        category: item.category || 'utility',
        content: fields.content || `[Importada de Meta: ${item.name}]`,
        headerType: fields.headerType,
        headerText: fields.headerText,
        footer: fields.footer,
        buttons: fields.buttons,
        status: item.status,
        rejectionReason: item.rejectionReason,
        providerTemplateId: item.providerTemplateId,
        providerStatus: item.providerStatus,
        syncedAt: new Date(),
        createdBy: actorId || account.createdBy
      });
    }

    await ActivityLog.create({
      companyId,
      distributorId: account.distributorId || null,
      userId: actorId || account.createdBy,
      type: 'message_template_synced',
      summary: `Plantillas sincronizadas con Meta: ${updates.length} actualizadas, ${imports.length} importadas`,
      metadata: { updated: updates.length, imported: imports.length }
    }).catch((error) => logger.warn('template.sync_activity_failed', { error: error.message }));

    return { updated: updates.length, imported: imports.length };
  },

  /**
   * Extrae los cambios `message_template_status_update` de un webhook de Meta.
   * Devuelve [{ providerTemplateId, name, language, status, reason }].
   */
  parseStatusChanges(payload) {
    const changes = [];
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        if (change?.field !== 'message_template_status_update') continue;
        const value = change.value || {};
        changes.push({
          providerTemplateId: String(value.message_template_id || ''),
          name: value.message_template_name || '',
          language: value.message_template_language || '',
          status: mapMetaStatus(value.event),
          reason: value.reason || ''
        });
      }
    }
    return changes;
  },

  /**
   * Procesa un webhook de estado de plantilla: actualiza la plantilla local y
   * notifica a los ADMIN de la empresa. Nunca debe romper el 200 del webhook.
   */
  async handleStatusWebhook(config, payload) {
    const changes = this.parseStatusChanges(payload);
    if (!changes.length) return 0;

    let applied = 0;
    for (const change of changes) {
      const filter = { companyId: config.companyId };
      if (change.providerTemplateId) {
        filter.providerTemplateId = change.providerTemplateId;
      } else if (change.name) {
        filter.name = change.name;
        if (change.language) filter.language = change.language;
      } else {
        continue;
      }
      const template = await MessageTemplate.findOne(filter);
      if (!template) continue;
      if (template.status === change.status && template.rejectionReason === (change.reason || '')) {
        continue; // idempotente: sin cambios
      }
      template.status = change.status;
      template.rejectionReason = change.status === 'rejected' ? change.reason || 'Rechazada por Meta' : '';
      template.syncedAt = new Date();
      await template.save();
      applied += 1;

      await notifyCompanyAdmins(config.companyId, {
        title:
          change.status === 'approved'
            ? `Plantilla aprobada: ${template.name}`
            : change.status === 'rejected'
              ? `Plantilla rechazada: ${template.name}`
              : `Estado de plantilla actualizado: ${template.name}`,
        body:
          change.status === 'rejected'
            ? `Meta rechazo la plantilla. Motivo: ${template.rejectionReason}`
            : `Nuevo estado: ${change.status}.`,
        metadata: { messageTemplateId: template._id, status: change.status }
      });
    }
    return applied;
  }
};
