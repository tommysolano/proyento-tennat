import { createHash } from 'node:crypto';
import { ActivityLog } from '../../models/ActivityLog.js';
import { ChannelConfig } from '../../models/ChannelConfig.js';
import { Message } from '../../models/Message.js';
import { WebhookEvent } from '../../models/WebhookEvent.js';
import { sanitize } from '../../utils/sanitize.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { RealtimeService } from '../realtime/RealtimeService.js';
import { ConversationService } from './ConversationService.js';
import { getChannelAdapter } from './adapters/index.js';
import { logger } from '../../utils/logger.js';
import { OperationalAlertService } from '../ops/OperationalAlertService.js';
import { WhatsAppInboundService } from './WhatsAppInboundService.js';

function hashPayload(payload) {
  return createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
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

async function processInbound(config, normalized, actorId) {
  return WhatsAppInboundService.processNormalized({ config, normalized, actorId });
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
      externalMessageId: normalized.externalMessageId,
      $or: [
        { channelConfigId: config._id },
        { channelConfigId: null }
      ]
    });
    if (message) {
      if (!message.channelConfigId) message.channelConfigId = config._id;
      const accepted = ['sent', 'delivered', 'read', 'failed'];
      const progression = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 99 };
      const statusAccepted = accepted.includes(normalized.status);
      const statusAdvances =
        statusAccepted &&
        (normalized.status === 'failed'
          ? !['failed', 'delivered', 'read'].includes(message.status)
          : (progression[normalized.status] ?? 0) >
            (progression[message.status] ?? 0));
      if (statusAdvances) message.status = normalized.status;
      if (normalized.status === 'sent' && !message.sentAt) {
        message.sentAt = normalized.timestamp;
      }
      if (normalized.status === 'delivered' && !message.deliveredAt) {
        message.deliveredAt = normalized.timestamp;
      }
      if (normalized.status === 'read' && !message.readAt) {
        message.readAt = normalized.timestamp;
      }
      if (normalized.status === 'failed' && statusAdvances) {
        message.failedAt = normalized.timestamp;
        message.error = sanitize(
          normalized.providerPayload?.errors?.[0]?.title ||
            normalized.providerPayload?.errors?.[0]?.message ||
            'WhatsApp reporto un fallo'
        );
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
      if (normalized.status === 'failed' && statusAdvances && message.sentBy) {
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
        await OperationalAlertService.create({
          companyId: message.companyId,
          distributorId: message.distributorId,
          severity: 'warning',
          type: 'message_failures',
          title: 'WhatsApp reporto mensaje fallido',
          message: message.error,
          relatedType: 'message',
          relatedId: message._id,
          metadata: { status: normalized.status }
        });
      }
      if (statusAccepted) {
        await recordWebhookActivity(
          config,
          actorId,
          'message_status_updated',
          statusAdvances
            ? `Estado WhatsApp actualizado a ${normalized.status}`
            : `Estado WhatsApp ${normalized.status} recibido sin regresion`,
          {
            messageId: message._id,
            conversationId: message.conversationId,
            status: normalized.status,
            applied: statusAdvances
          }
        );
      } else {
        event.error = `Status WhatsApp no soportado: ${sanitize(normalized.status)}`;
      }
      logger.info('whatsapp.message_status_updated', {
        channelConfigId: config._id,
        companyId: config.companyId,
        messageId: message._id,
        status: normalized.status,
        applied: statusAdvances
      });
    } else {
      event.error = 'Status recibido para mensaje desconocido';
      logger.warn('whatsapp.status_message_unknown', {
        channelConfigId: config._id,
        companyId: config.companyId,
        externalMessageId: normalized.externalMessageId,
        status: normalized.status
      });
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
    const config = await ChannelConfig.findOne({
      _id: channelConfigId,
      channel: 'whatsapp_cloud'
    })
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
