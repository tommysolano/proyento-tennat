import { createHash } from 'node:crypto';
import { Router } from 'express';
import { checkModuleAccess } from '../middleware/moduleMiddleware.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { ChannelConfig } from '../models/ChannelConfig.js';
import { Contact } from '../models/Contact.js';
import { Message } from '../models/Message.js';
import { WebhookEvent } from '../models/WebhookEvent.js';
import { ConversationService } from '../modules/conversations/ConversationService.js';
import { getChannelAdapter } from '../modules/conversations/adapters/index.js';

const router = Router();

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
    metadata: { channelConfigId: config._id, ...metadata }
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

async function processInbound(config, adapter, normalized, actorId) {
  const event = await reserveEvent({
    config,
    eventId: normalized.eventId,
    type: 'message',
    payload: normalized.providerPayload
  });
  if (!event) return;
  try {
    const { contact } = await findOrCreateInboundContact(config, normalized, actorId);
    const { conversation } = await ConversationService.findOrCreateConversation({
      companyId: config.companyId,
      distributorId: config.distributorId,
      contactId: contact._id,
      channel: 'whatsapp_cloud',
      channelConfigId: config._id,
      externalConversationId: normalized.externalConversationId,
      assignedTo: contact.assignedTo,
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
    await recordWebhookActivity(
      config,
      actorId,
      'webhook_processed',
      'Webhook WhatsApp procesado',
      {
        webhookEventId: event._id,
        conversationId: conversation._id,
        contactId: contact._id,
        messageId: result.message._id
      }
    );
  } catch (error) {
    event.status = 'failed';
    event.error = error.message;
    event.processedAt = new Date();
    await event.save();
    await recordWebhookActivity(config, actorId, 'webhook_failed', 'Webhook WhatsApp fallo', {
      webhookEventId: event._id,
      error: error.message
    });
  }
}

async function processStatus(config, normalized, actorId) {
  const event = await reserveEvent({
    config,
    eventId: normalized.eventId,
    type: 'status',
    payload: normalized.providerPayload
  });
  if (!event) return;
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
    }
    event.status = 'processed';
    event.processedAt = new Date();
    await event.save();
  } catch (error) {
    event.status = 'failed';
    event.error = error.message;
    event.processedAt = new Date();
    await event.save();
  }
}

async function processWhatsAppPayload(configId, payload) {
  const config = await ChannelConfig.findById(configId)
    .select('+credentials +verifyToken +webhookSecret');
  if (!config || config.status === 'disabled') return;
  const moduleAccess = await checkModuleAccess('whatsapp', {
    role: 'ADMIN',
    companyId: config.companyId,
    distributorId: config.distributorId
  });
  if (!moduleAccess.enabled) return;
  const adapter = getChannelAdapter('whatsapp_cloud', { channelConfig: config });
  const actorId = await ConversationService.actorForChannelConfig(config);
  await recordWebhookActivity(config, actorId, 'webhook_received', 'Webhook WhatsApp recibido', {
    payloadHash: hashPayload(payload)
  });
  const { inboundMessages: inbound, statusUpdates: statuses } =
    adapter.handleWebhook(payload);
  for (const normalized of inbound) {
    await processInbound(config, adapter, normalized, actorId);
  }
  for (const normalized of statuses) {
    await processStatus(config, normalized, actorId);
  }
  config.lastWebhookAt = new Date();
  config.error = '';
  await config.save();
}

router.get('/whatsapp/:channelConfigId', async (req, res, next) => {
  try {
    const config = await ChannelConfig.findById(req.params.channelConfigId)
      .select('+verifyToken');
    if (!config || config.status === 'disabled') {
      return res.status(404).json({ message: 'Canal no encontrado' });
    }
    const moduleAccess = await checkModuleAccess('whatsapp', {
      role: 'ADMIN',
      companyId: config.companyId,
      distributorId: config.distributorId
    });
    if (!moduleAccess.enabled) {
      return res.status(403).json({ message: moduleAccess.message });
    }
    const adapter = getChannelAdapter('whatsapp_cloud', { channelConfig: config });
    const result = adapter.verifyWebhook(req.query);
    if (!result.verified) return res.status(403).json({ message: 'Verificacion rechazada' });
    res.status(200).send(String(result.challenge || ''));
  } catch (error) {
    next(error);
  }
});

router.post('/whatsapp/:channelConfigId', async (req, res) => {
  res.status(200).json({ received: true });
  setImmediate(() => {
    processWhatsAppPayload(req.params.channelConfigId, req.body).catch(async (error) => {
      const config = await ChannelConfig.findById(req.params.channelConfigId).catch(() => null);
      if (config) {
        config.error = 'Error procesando el ultimo webhook';
        await config.save().catch(() => null);
      }
      console.error('Webhook WhatsApp no procesado:', error.message);
    });
  });
});

export default router;
