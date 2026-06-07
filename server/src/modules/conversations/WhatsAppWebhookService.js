import { createHash } from 'node:crypto';
import { ActivityLog } from '../../models/ActivityLog.js';
import { ChannelConfig } from '../../models/ChannelConfig.js';
import { Contact } from '../../models/Contact.js';
import { Message } from '../../models/Message.js';
import { WebhookEvent } from '../../models/WebhookEvent.js';
import { sanitize } from '../../utils/sanitize.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { RealtimeService } from '../realtime/RealtimeService.js';
import { ConversationService } from './ConversationService.js';
import { getChannelAdapter } from './adapters/index.js';

function hashPayload(payload) {
  return createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
}

function phoneExpression(phone) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-12);
  return digits ? new RegExp(`${digits.split('').join('\\D*')}$`) : null;
}

async function reserveEvent({ config, eventId, type, payload }) {
  try {
    return await WebhookEvent.create({
      provider: 'whatsapp_cloud',
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

async function recordWebhookActivity(config, actorId, type, summary, metadata = {}) {
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

async function findOrCreateInboundContact(config, normalized, actorId) {
  const phoneRegex = phoneExpression(normalized.phone);
  const filter = {
    companyId: config.companyId,
    archivedAt: null,
    $or: [{ 'metadata.whatsappWaId': normalized.phone }]
  };
  if (phoneRegex) filter.$or.push({ phone: phoneRegex });
  let contact = await Contact.findOne(filter);
  if (contact) return { contact, created: false };

  contact = await Contact.create({
    companyId: config.companyId,
    distributorId: config.distributorId || null,
    name: normalized.contactName || normalized.phone || 'Contacto WhatsApp',
    fullName: normalized.contactName || normalized.phone || 'Contacto WhatsApp',
    phone: normalized.phone,
    source: 'whatsapp_cloud',
    status: 'nuevo',
    lifecycleStage: 'lead',
    priority: 'medium',
    createdBy: actorId,
    updatedBy: actorId,
    metadata: { whatsappWaId: normalized.phone }
  });
  await recordWebhookActivity(
    config,
    actorId,
    'contact_created_from_inbound',
    `Contacto creado desde WhatsApp: ${contact.name}`,
    { contactId: contact._id }
  );
  return { contact, created: true };
}

async function processInbound(config, normalized, actorId) {
  const event = await reserveEvent({
    config,
    eventId: normalized.eventId,
    type: 'message',
    payload: normalized.providerPayload
  });
  if (!event) return { duplicate: true };
  try {
    const { contact } = await findOrCreateInboundContact(config, normalized, actorId);
    const { conversation } = await ConversationService.findOrCreateConversation({
      companyId: config.companyId,
      distributorId: config.distributorId,
      contactId: contact._id,
      channel: 'whatsapp_cloud',
      channelConfigId: config._id,
      externalConversationId: normalized.externalConversationId,
      createdBy: actorId
    });
    const result = await ConversationService.createInboundMessage({
      conversation,
      normalized,
      actorId
    });
    event.status = result.duplicate ? 'duplicate' : 'processed';
    event.processedAt = new Date();
    await event.save();
    await recordWebhookActivity(config, actorId, 'webhook_processed', 'Webhook WhatsApp procesado', {
      webhookEventId: event._id,
      conversationId: conversation._id,
      contactId: contact._id,
      messageId: result.message._id
    });
    return result;
  } catch (error) {
    event.status = 'failed';
    event.error = sanitize(error.message);
    event.processedAt = new Date();
    await event.save();
    throw error;
  }
}

async function processStatus(config, normalized, actorId) {
  const event = await reserveEvent({
    config,
    eventId: normalized.eventId,
    type: 'status',
    payload: normalized.providerPayload
  });
  if (!event) return { duplicate: true };
  try {
    const message = await Message.findOne({
      companyId: config.companyId,
      provider: 'whatsapp_cloud',
      externalMessageId: normalized.externalMessageId
    });
    if (message) {
      const accepted = ['sent', 'delivered', 'read', 'failed'];
      if (accepted.includes(normalized.status)) message.status = normalized.status;
      if (normalized.status === 'delivered') message.deliveredAt = normalized.timestamp;
      if (normalized.status === 'read') message.readAt = normalized.timestamp;
      if (normalized.status === 'failed') {
        message.failedAt = normalized.timestamp;
        message.error =
          normalized.providerPayload?.errors?.[0]?.title ||
          normalized.providerPayload?.errors?.[0]?.message ||
          'WhatsApp reporto un fallo';
      }
      await message.save();
      const conversation = await import('../../models/Conversation.js').then(({ Conversation }) =>
        Conversation.findById(message.conversationId)
      );
      if (conversation) {
        RealtimeService.publish('message.status_updated', {
          companyId: conversation.companyId,
          assignedTo: conversation.assignedTo,
          data: { conversationId: conversation._id, message: message.toJSON() }
        });
      }
      if (normalized.status === 'failed' && message.sentBy) {
        await NotificationService.create({
          companyId: message.companyId,
          distributorId: message.distributorId,
          userId: message.sentBy,
          type: 'message_failed',
          title: 'WhatsApp reporto un fallo',
          body: message.error,
          relatedType: 'conversation',
          relatedId: message.conversationId,
          metadata: { messageId: message._id }
        });
      }
    }
    event.status = 'processed';
    event.processedAt = new Date();
    await event.save();
    return { message };
  } catch (error) {
    event.status = 'failed';
    event.error = sanitize(error.message);
    event.processedAt = new Date();
    await event.save();
    throw error;
  }
}

export class WhatsAppWebhookService {
  static payloadHash(payload) {
    return hashPayload(payload);
  }

  static async processPayload(channelConfigId, payload) {
    const config = await ChannelConfig.findById(channelConfigId)
      .select('+credentials +verifyToken +webhookSecret');
    if (!config || config.status === 'disabled') {
      throw Object.assign(new Error('Canal WhatsApp no disponible'), { retryable: false });
    }
    const adapter = getChannelAdapter('whatsapp_cloud', { channelConfig: config });
    const actorId = await ConversationService.actorForChannelConfig(config);
    await recordWebhookActivity(config, actorId, 'webhook_received', 'Webhook WhatsApp recibido', {
      payloadHash: hashPayload(payload)
    });
    const { inboundMessages, statusUpdates } = adapter.handleWebhook(payload);
    for (const normalized of inboundMessages) {
      await processInbound(config, normalized, actorId);
    }
    for (const normalized of statusUpdates) {
      await processStatus(config, normalized, actorId);
    }
    config.lastWebhookAt = new Date();
    config.error = '';
    await config.save();
    return {
      inbound: inboundMessages.length,
      statuses: statusUpdates.length
    };
  }
}
