import { ActivityLog } from '../../models/ActivityLog.js';
import { ChannelConfig } from '../../models/ChannelConfig.js';
import { OperationalAlertService } from '../ops/OperationalAlertService.js';
import { normalizeQualityRating } from '../conversations/adapters/WhatsAppCloudAdapter.js';
import { logger } from '../../utils/logger.js';

const RANK = { GREEN: 0, YELLOW: 1, RED: 2 };

/** `true` si el rating empeoro (GREEN->YELLOW/RED, YELLOW->RED). */
function worsened(previous, next) {
  const from = RANK[previous];
  const to = RANK[next];
  if (from === undefined || to === undefined) return false;
  return to > from;
}

export const WhatsAppQualityService = {
  worsened,

  /**
   * Aplica una actualizacion de salud a un ChannelConfig cloud: persiste
   * qualityRating/messagingLimit/qualityUpdatedAt, registra en ActivityLog si el
   * rating empeoro y crea una OperationalAlert si paso a RED. Idempotente en el
   * sentido de que no re-alerta si el rating no cambio.
   */
  async applyUpdate(config, { qualityRating, messagingLimit } = {}, { actorId = null } = {}) {
    if (!config) return null;
    const previous = config.qualityRating || 'UNKNOWN';
    const next = normalizeQualityRating(qualityRating);

    const changed = next !== previous || (messagingLimit && messagingLimit !== config.messagingLimit);
    config.qualityRating = next;
    if (messagingLimit) config.messagingLimit = messagingLimit;
    config.qualityUpdatedAt = new Date();
    await config.save();

    if (!changed) return { previous, current: next, worsened: false };

    const didWorsen = worsened(previous, next);
    if (didWorsen) {
      const userId = actorId || config.createdBy || null;
      if (userId) {
        await ActivityLog.create({
          companyId: config.companyId,
          distributorId: config.distributorId || null,
          userId,
          type: 'channel_quality_changed',
          summary: `Calidad del numero ${config.displayName} bajo de ${previous} a ${next}`,
          metadata: {
            channelConfigId: config._id,
            previousRating: previous,
            currentRating: next,
            messagingLimit: config.messagingLimit
          }
        }).catch((error) => logger.warn('whatsapp.quality_activity_failed', { error: error.message }));
      }
    }

    if (next === 'RED') {
      await OperationalAlertService.create({
        companyId: config.companyId,
        distributorId: config.distributorId || null,
        severity: 'critical',
        type: 'channel_quality_red',
        title: 'Numero de WhatsApp en calidad RED',
        message: `El numero ${config.displayName} paso a calidad RED. Meta puede limitar o bloquear el envio.`,
        relatedType: 'channel_config',
        relatedId: config._id,
        metadata: { previousRating: previous, messagingLimit: config.messagingLimit }
      }).catch((error) => logger.warn('whatsapp.quality_alert_failed', { error: error.message }));
    }

    return { previous, current: next, worsened: didWorsen };
  },

  /**
   * Extrae los cambios `phone_number_quality_update` de un payload de webhook de
   * Meta. Devuelve [{ phoneNumberId, displayPhoneNumber, qualityRating, messagingLimit }].
   */
  parseWebhookChanges(payload) {
    const updates = [];
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        if (change?.field !== 'phone_number_quality_update') continue;
        const value = change.value || {};
        updates.push({
          phoneNumberId: value.phone_number_id || value.id || '',
          displayPhoneNumber: value.display_phone_number || '',
          qualityRating: value.current_quality_rating || value.quality_rating || value.event || '',
          messagingLimit: value.current_limit || value.messaging_limit || ''
        });
      }
    }
    return updates;
  },

  /**
   * Procesa un webhook de calidad. Resuelve el ChannelConfig por phoneNumberId
   * dentro de la empresa del canal que recibio el webhook (una WABA puede
   * notificar varios numeros); si no encaja por phoneNumberId, cae al canal del
   * propio webhook. Devuelve la cantidad de canales actualizados.
   */
  async handleWebhook(webhookConfig, payload) {
    const changes = this.parseWebhookChanges(payload);
    if (!changes.length) return 0;

    let applied = 0;
    for (const change of changes) {
      let target = null;
      if (change.phoneNumberId) {
        target = await ChannelConfig.findOne({
          companyId: webhookConfig.companyId,
          phoneNumberId: change.phoneNumberId
        }).select('+credentials +verifyToken +webhookSecret');
      }
      if (!target) target = webhookConfig;
      await this.applyUpdate(target, {
        qualityRating: change.qualityRating,
        messagingLimit: change.messagingLimit
      });
      applied += 1;
    }
    return applied;
  }
};
