import { createHash } from 'node:crypto';
import { ActivityLog } from '../../models/ActivityLog.js';
import { Contact } from '../../models/Contact.js';
import { WebhookEvent } from '../../models/WebhookEvent.js';
import { sanitize } from '../../utils/sanitize.js';
import { checkUsageLimit, trackUsage } from '../../utils/usage.js';
import { ConversationService } from './ConversationService.js';

function hashPayload(payload) {
  return createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
}

function phoneExpression(phone) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-12);
  return digits ? new RegExp(`${digits.split('').join('\\D*')}$`) : null;
}

async function reserveEvent({ config, provider, eventId, type, payload }) {
  try {
    return await WebhookEvent.create({
      provider,
      eventId: eventId || hashPayload(payload),
      channelConfigId: config._id,
      companyId: config.companyId,
      type,
      payloadHash: hashPayload(payload),
      status: 'processing'
    });
  } catch (error) {
    if (error.code === 11000) return null;
    throw error;
  }
}

async function recordActivity(config, actorId, type, summary, metadata = {}) {
  if (!actorId) return;
  await ActivityLog.create({
    companyId: config.companyId,
    distributorId: config.distributorId || null,
    userId: actorId,
    type,
    summary,
    metadata: sanitize({ channelConfigId: config._id, ...metadata })
  });
}

async function findOrCreateContact(config, normalized, actorId) {
  const provider = normalized.provider || config.channel;
  const phoneRegex = phoneExpression(normalized.phone);
  const providerKey = `metadata.whatsappIds.${provider}`;
  const filter = {
    companyId: config.companyId,
    archivedAt: null,
    $or: [{ [providerKey]: normalized.phone }]
  };
  if (phoneRegex) filter.$or.push({ phone: phoneRegex });
  let contact = await Contact.findOne(filter);
  if (contact) {
    const currentIds = contact.metadata?.whatsappIds || {};
    if (normalized.phone && currentIds[provider] !== normalized.phone) {
      contact.metadata = {
        ...(contact.metadata || {}),
        whatsappIds: { ...currentIds, [provider]: normalized.phone }
      };
      contact.markModified('metadata');
      await contact.save();
    }
    return { contact, created: false };
  }

  await checkUsageLimit({
    companyId: config.companyId,
    distributorId: config.distributorId,
    metric: 'contacts',
    quantity: 1
  });
  const fallbackName = normalized.phone || 'Contacto WhatsApp';
  contact = await Contact.create({
    companyId: config.companyId,
    distributorId: config.distributorId || null,
    name: normalized.contactName || fallbackName,
    fullName: normalized.contactName || fallbackName,
    phone: normalized.phone,
    source: provider,
    status: 'nuevo',
    lifecycleStage: 'lead',
    priority: 'medium',
    createdBy: actorId,
    updatedBy: actorId,
    metadata: {
      whatsappIds: { [provider]: normalized.phone },
      ...(provider === 'whatsapp_cloud' ? { whatsappWaId: normalized.phone } : {})
    }
  });
  await trackUsage({
    companyId: config.companyId,
    distributorId: config.distributorId,
    metric: 'contacts',
    quantity: 1,
    metadata: { contactId: contact._id, source: provider }
  });
  await recordActivity(
    config,
    actorId,
    'contact_created_from_inbound',
    `Contacto creado desde ${provider}: ${contact.name}`,
    { contactId: contact._id, provider }
  );
  return { contact, created: true };
}

export class WhatsAppInboundService {
  static hashPayload(payload) {
    return hashPayload(payload);
  }

  static async processNormalized({ config, normalized, actorId }) {
    const provider = normalized.provider || config.channel;
    const event = await reserveEvent({
      config,
      provider,
      eventId: normalized.eventId,
      type: 'message',
      payload: normalized.providerPayload
    });
    if (!event) return { duplicate: true };
    try {
      const { contact } = await findOrCreateContact(config, normalized, actorId);
      const { conversation } = await ConversationService.findOrCreateConversation({
        companyId: config.companyId,
        distributorId: config.distributorId,
        contactId: contact._id,
        channel: provider,
        channelConfigId: config._id,
        externalConversationId: normalized.externalConversationId,
        createdBy: actorId
      });
      const result = await ConversationService.createInboundMessage({
        conversation,
        normalized: {
          ...normalized,
          metadata: {
            ...(normalized.metadata || {}),
            channelConfigId: config._id
          }
        },
        actorId
      });
      event.status = result.duplicate ? 'duplicate' : 'processed';
      event.processedAt = new Date();
      await event.save();
      await recordActivity(
        config,
        actorId,
        'webhook_processed',
        `Mensaje ${provider} procesado`,
        {
          webhookEventId: event._id,
          conversationId: conversation._id,
          contactId: contact._id,
          messageId: result.message._id,
          provider
        }
      );
      return { ...result, conversation, contact };
    } catch (error) {
      event.status = 'failed';
      event.error = sanitize(error.message);
      event.processedAt = new Date();
      await event.save();
      throw error;
    }
  }

  /**
   * Ingiere un mensaje `fromMe` (enviado desde el telefono vinculado) como
   * SALIENTE en la conversacion del destinatario, creandola si no existe. El
   * dedupe contra los envios de la app vive en recordOutboundEcho.
   */
  static async processOutboundEcho({ config, normalized, actorId }) {
    const provider = normalized.provider || config.channel;
    const { contact } = await findOrCreateContact(config, normalized, actorId);
    const { conversation } = await ConversationService.findOrCreateConversation({
      companyId: config.companyId,
      distributorId: config.distributorId,
      contactId: contact._id,
      channel: provider,
      channelConfigId: config._id,
      externalConversationId: normalized.externalConversationId,
      createdBy: actorId
    });
    const result = await ConversationService.recordOutboundEcho({
      conversation,
      normalized: {
        ...normalized,
        metadata: { ...(normalized.metadata || {}), channelConfigId: config._id }
      }
    });
    return { ...result, conversation, contact };
  }
}
