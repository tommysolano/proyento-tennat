import { ChannelConfig } from '../../models/ChannelConfig.js';
import { Conversation } from '../../models/Conversation.js';
import { Message } from '../../models/Message.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { RealtimeService } from '../realtime/RealtimeService.js';
import { ConversationService } from '../conversations/ConversationService.js';
import { WhatsAppWebhookService } from '../conversations/WhatsAppWebhookService.js';
import { getChannelAdapter } from '../conversations/adapters/index.js';

async function processMedia(job) {
  const message = await Message.findById(job.payload.messageId);
  if (!message) {
    throw Object.assign(new Error('Mensaje de media no encontrado'), { retryable: false });
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
  const config = await ChannelConfig.findById(conversation.channelConfigId)
    .select('+credentials +verifyToken +webhookSecret');
  const providerMediaId =
    message.media?.providerMediaId || message.media?.externalMediaId;
  const adapter = getChannelAdapter('whatsapp_cloud', { channelConfig: config });
  const metadata = await adapter.getMediaMetadata(providerMediaId);
  message.media = {
    ...(message.media?.toObject?.() || message.media || {}),
    ...metadata,
    status: message.media?.url || message.media?.storageKey ? 'available' : 'pending',
    error: ''
  };
  await message.save();
  RealtimeService.publish('message.status_updated', {
    companyId: conversation.companyId,
    assignedTo: conversation.assignedTo,
    data: { conversationId: conversation._id, message: message.toJSON() }
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
      return ConversationService.processOutboundMessage({
        messageId: job.payload.messageId,
        template: job.payload.template || null,
        job
      });
    case 'media.whatsapp.download':
      return processMedia(job);
    case 'notification.dispatch':
      return NotificationService.create(job.payload);
    default:
      throw Object.assign(new Error(`No existe handler para ${job.type}`), {
        retryable: false
      });
  }
}

export async function handleTerminalJobFailure(job, error) {
  if (job.type === 'message.whatsapp.send') {
    const message = await Message.findById(job.payload.messageId);
    if (!message || message.status === 'failed') return;
    message.status = 'failed';
    message.failedAt = new Date();
    message.error = error.message;
    await message.save();
    if (message.sentBy) {
      await NotificationService.create({
        companyId: message.companyId,
        distributorId: message.distributorId,
        userId: message.sentBy,
        type: 'message_failed',
        title: 'Mensaje agotó sus reintentos',
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
    message.media.error = error.message;
    await message.save();
  }
}
