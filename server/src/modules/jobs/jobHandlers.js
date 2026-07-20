import { ChannelConfig } from '../../models/ChannelConfig.js';
import { Conversation } from '../../models/Conversation.js';
import { Message } from '../../models/Message.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { RealtimeService } from '../realtime/RealtimeService.js';
import { ConversationService } from '../conversations/ConversationService.js';
import { WhatsAppWebhookService } from '../conversations/WhatsAppWebhookService.js';
import { getChannelAdapter } from '../conversations/adapters/index.js';
import { getStorageProvider } from '../storage/index.js';
import { checkUsageLimit, trackUsage } from '../../utils/usage.js';
import { logger } from '../../utils/logger.js';
import { sanitize } from '../../utils/sanitize.js';
import { AppointmentReminderService } from '../calendar/AppointmentReminderService.js';
import { WorkflowService } from '../workflows/WorkflowService.js';
import { BroadcastService } from '../marketing/BroadcastService.js';

async function processMedia(job) {
  const message = await Message.findById(job.payload.messageId);
  if (!message) {
    throw Object.assign(new Error('Mensaje de media no encontrado'), { retryable: false });
  }
  if (message.media?.status === 'available' && message.media?.storageKey) {
    logger.info('media.download_skipped', {
      jobId: job._id,
      messageId: message._id,
      companyId: message.companyId,
      reason: 'already_available'
    });
    return;
  }
  const conversation = await Conversation.findOne({
    _id: message.conversationId,
    companyId: message.companyId
  });
  if (!conversation?.channelConfigId) {
    throw Object.assign(new Error('La conversacion no tiene ChannelConfig'), {
      retryable: false
    });
  }
  const config = await ChannelConfig.findOne({
    _id: conversation.channelConfigId,
    companyId: message.companyId
  })
    .select('+credentials +verifyToken +webhookSecret');
  if (!config) {
    throw Object.assign(new Error('La integracion del mensaje no esta disponible'), {
      retryable: false
    });
  }
  const providerMediaId =
    message.media?.providerMediaId || message.media?.externalMediaId;
  const adapter = getChannelAdapter(config.channel, { channelConfig: config });
  logger.info('media.download_started', {
    jobId: job._id,
    messageId: message._id,
    companyId: message.companyId
  });
  const downloaded = await adapter.downloadMedia(
    providerMediaId,
    message.media?.filename || message.media?.fileName
  );
  const storageMb = downloaded.size / (1024 * 1024);
  await Promise.all([
    checkUsageLimit({
      companyId: message.companyId,
      distributorId: message.distributorId,
      metric: 'media_storage_mb',
      quantity: storageMb
    }),
    checkUsageLimit({
      companyId: message.companyId,
      distributorId: message.distributorId,
      metric: 'media_files',
      quantity: 1
    })
  ]);
  const storage = getStorageProvider();
  let stored;
  try {
    stored = await storage.uploadBuffer({
      buffer: downloaded.buffer,
      filename: downloaded.filename,
      mimeType: downloaded.mimeType,
      scope: { companyId: message.companyId }
    });
    message.media = {
      ...(message.media?.toObject?.() || message.media || {}),
      filename: stored.filename,
      mimeType: stored.mimeType,
      size: stored.size,
      providerMediaId: downloaded.providerMediaId,
      storageKey: stored.storageKey,
      status: 'available',
      error: ''
    };
    await message.save();
  } catch (error) {
    if (stored?.storageKey) {
      await storage.deleteObject({ storageKey: stored.storageKey }).catch(() => {});
    }
    logger.error('media.storage_failed', error, {
      jobId: job._id,
      messageId: message._id,
      companyId: message.companyId,
      provider: storage.name
    });
    throw error;
  }
  await Promise.all([
    trackUsage({
      companyId: message.companyId,
      distributorId: message.distributorId,
      metric: 'media_storage_mb',
      quantity: storageMb,
      metadata: { messageId: message._id }
    }),
    trackUsage({
      companyId: message.companyId,
      distributorId: message.distributorId,
      metric: 'media_files',
      quantity: 1,
      metadata: { messageId: message._id }
    }),
    ConversationService.createActivityLog({
      actorId: await ConversationService.actorForChannelConfig(config),
      companyId: message.companyId,
      distributorId: message.distributorId,
      type: 'media_downloaded',
      summary: 'Media inbound de WhatsApp almacenada',
      metadata: {
        messageId: message._id,
        conversationId: conversation._id,
        mimeType: stored.mimeType,
        size: stored.size
      }
    })
  ]);
  RealtimeService.publish('message.status_updated', {
    companyId: conversation.companyId,
    assignedTo: conversation.assignedTo,
    data: { conversationId: conversation._id, message: message.toJSON() }
  });
  logger.info('media.download_succeeded', {
    jobId: job._id,
    messageId: message._id,
    companyId: message.companyId,
    mimeType: stored.mimeType,
    size: stored.size
  });
}

export async function handleJob(job) {
  switch (job.type) {
    case 'webhook.whatsapp.inbound':
    case 'webhook.whatsapp.status':
      return WhatsAppWebhookService.processPayload(
        job.payload.channelConfigId,
        job.payload.payload
      );
    case 'message.whatsapp.send':
    case 'message.outbound.send':
      return ConversationService.processOutboundMessage({
        messageId: job.payload.messageId,
        template: job.payload.template || null,
        job
      });
    case 'media.whatsapp.download':
      return processMedia(job);
    case 'notification.dispatch':
      return NotificationService.create(job.payload);
    case 'appointment.reminder':
      return AppointmentReminderService.process(job);
    case 'workflow.run':
      return WorkflowService.executeWorkflowRun(job.payload.runId);
    case 'broadcast.recipient':
      return BroadcastService.processRecipient(job);
    default:
      throw Object.assign(new Error(`No existe handler para ${job.type}`), {
        retryable: false
      });
  }
}

export async function handleTerminalJobFailure(job, error) {
  if (job.type === 'workflow.run') {
    await WorkflowService.markTerminalFailure(job.payload.runId, error);
  }
  if (['message.whatsapp.send', 'message.outbound.send'].includes(job.type)) {
    const message = await Message.findById(job.payload.messageId);
    if (!message || message.status === 'failed') return;
    message.status = 'failed';
    message.failedAt = new Date();
    message.error = sanitize(error.message);
    await message.save();
    if (message.sentBy) {
      await NotificationService.create({
        companyId: message.companyId,
        distributorId: message.distributorId,
        userId: message.sentBy,
        type: 'message_failed',
        title: 'Mensaje agoto sus reintentos',
        body: message.error,
        relatedType: 'conversation',
        relatedId: message.conversationId,
        metadata: { messageId: message._id }
      });
    }
  }
  if (job.type === 'media.whatsapp.download') {
    const message = await Message.findById(job.payload.messageId);
    if (!message) return;
    message.media.status = 'failed';
    message.media.error = sanitize(error.message);
    await message.save();
    logger.error('media.download_failed', error, {
      jobId: job._id,
      messageId: message._id,
      companyId: message.companyId
    });
    const conversation = await Conversation.findById(message.conversationId);
    if (conversation) {
      RealtimeService.publish('message.status_updated', {
        companyId: conversation.companyId,
        assignedTo: conversation.assignedTo,
        data: { conversationId: conversation._id, message: message.toJSON() }
      });
    }
  }
}
