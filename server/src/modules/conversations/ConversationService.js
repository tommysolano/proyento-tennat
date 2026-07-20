import { ActivityLog } from '../../models/ActivityLog.js';
import { ChannelConfig } from '../../models/ChannelConfig.js';
import { resolveAccountForConversation } from '../communications/accountGateway.js';
import { TemplateSyncService } from '../communications/TemplateSyncService.js';
import { Contact } from '../../models/Contact.js';
import { Conversation } from '../../models/Conversation.js';
import { Message } from '../../models/Message.js';
import { User } from '../../models/User.js';
import { validateCrmAssignee } from '../../utils/crmScope.js';
import { sanitize } from '../../utils/sanitize.js';
import { JobService } from '../jobs/JobService.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { RealtimeService } from '../realtime/RealtimeService.js';
import { RoutingService } from '../routing/RoutingService.js';
import { getChannelAdapter, canonicalChannel } from './adapters/index.js';
import { checkUsageLimit, trackUsage } from '../../utils/usage.js';
import { OperationalAlertService } from '../ops/OperationalAlertService.js';
import { assertOutboundAllowed } from './conversationValidation.js';
import { CommunicationPolicyService } from '../communications/CommunicationPolicyService.js';
import { MESSAGE_CATEGORIES } from '../communications/communicationPolicyRules.js';
import { hasUserPermission } from '../../core/permissions/permissions.js';

function safePreview(text, fallback = '') {
  return String(text || fallback).slice(0, 500);
}

function defaultMessageCategory(conversation, now = new Date()) {
  const inboundAt = conversation.lastInboundAt
    ? new Date(conversation.lastInboundAt)
    : null;
  const outboundAt = conversation.lastOutboundAt
    ? new Date(conversation.lastOutboundAt)
    : null;
  return inboundAt &&
    now.getTime() - inboundAt.getTime() <= 24 * 60 * 60 * 1000 &&
    (!outboundAt || inboundAt > outboundAt)
    ? 'reply'
    : 'commercial';
}

function outboundJobType(channel) {
  return ['whatsapp_cloud', 'whatsapp_qr'].includes(channel)
    ? 'message.whatsapp.send'
    : 'message.outbound.send';
}

function isWhatsAppChannel(channel) {
  return ['whatsapp_cloud', 'whatsapp_qr'].includes(canonicalChannel(channel));
}

async function activity({
  user = null,
  actorId = null,
  companyId,
  distributorId,
  type,
  summary,
  metadata
}) {
  const userId = user?._id || actorId;
  if (!userId) return null;
  const item = await ActivityLog.create({
    companyId,
    distributorId: distributorId || null,
    userId,
    type,
    summary,
    metadata: sanitize(metadata)
  });
  const { WorkflowEventEmitter } = await import(
    '../workflows/WorkflowEventEmitter.js'
  );
  await WorkflowEventEmitter.emitFromActivity(item).catch(() => {});
  return item;
}

function realtimeConversation(type, conversation, data = {}) {
  RealtimeService.publish(type, {
    companyId: conversation.companyId,
    assignedTo: conversation.assignedTo,
    data: {
      conversationId: conversation._id,
      assignedTo: conversation.assignedTo,
      status: conversation.status,
      ...data
    }
  });
}

export class ConversationService {
  static createActivityLog(payload) {
    return activity(payload);
  }

  static async linkToContact(conversation, contactId) {
    const contact = await Contact.findOne({
      _id: contactId,
      companyId: conversation.companyId,
      archivedAt: null
    }).select('_id assignedTo');
    if (!contact) {
      throw Object.assign(new Error('Contacto no pertenece a la empresa'), { status: 400 });
    }
    conversation.contactId = contact._id;
    if (!conversation.assignedTo && contact.assignedTo) {
      conversation.assignedTo = contact.assignedTo;
    }
    return contact;
  }

  static updateLastMessage(conversation, message, timestamp = new Date()) {
    conversation.lastMessage = safePreview(message.text, `[${message.type}]`);
    conversation.lastMessageAt = timestamp;
    if (message.direction === 'inbound') conversation.lastInboundAt = timestamp;
    if (message.direction === 'outbound') conversation.lastOutboundAt = timestamp;
    return conversation;
  }

  static incrementUnread(conversation, amount = 1) {
    conversation.unreadCount = Math.max(0, conversation.unreadCount + amount);
    return conversation;
  }

  static async findOrCreateConversation({
    companyId,
    distributorId,
    contactId,
    channel,
    channelConfigId = null,
    externalConversationId = '',
    assignedTo = null,
    createdBy = null
  }) {
    const canonical = canonicalChannel(channel);
    const filter = {
      companyId,
      contactId,
      channel: { $in: [canonical, channel] },
      status: { $ne: 'archived' },
      archivedAt: null
    };
    if (channelConfigId) filter.channelConfigId = channelConfigId;
    if (externalConversationId) filter.externalConversationId = externalConversationId;

    let conversation = await Conversation.findOne(filter);
    if (conversation) return { conversation, created: false };

    const contact = await Contact.findOne({ _id: contactId, companyId }).select('assignedTo');
    if (!contact) throw Object.assign(new Error('Contacto no pertenece a la empresa'), { status: 400 });
    await checkUsageLimit({
      companyId,
      distributorId,
      metric: 'conversations',
      quantity: 1
    });
    const resolvedAssignee =
      assignedTo !== undefined && assignedTo !== null
        ? assignedTo
        : await RoutingService.resolve({
            companyId,
            channel: canonical,
            contact
          });
    conversation = await Conversation.create({
      companyId,
      distributorId: distributorId || null,
      contactId,
      channel: canonical,
      provider: canonical,
      channelConfigId,
      externalConversationId,
      assignedTo: resolvedAssignee || null,
      createdBy,
      updatedBy: createdBy,
      lastMessageAt: new Date()
    });
    await activity({
      actorId: createdBy,
      companyId,
      distributorId,
      type: 'conversation_created',
      summary: `Conversacion creada por ${canonical}`,
      metadata: { conversationId: conversation._id, contactId, channel: canonical }
    });
    realtimeConversation('conversation.created', conversation);
    if (conversation.assignedTo) {
      await NotificationService.create({
        companyId: conversation.companyId,
        distributorId: conversation.distributorId,
        userId: conversation.assignedTo,
        type: 'conversation_assigned',
        title: 'Conversacion asignada',
        body: 'Se te asigno una nueva conversacion.',
        relatedType: 'conversation',
        relatedId: conversation._id
      });
    }
    await trackUsage({
      companyId,
      distributorId,
      metric: 'conversations',
      quantity: 1,
      metadata: { conversationId: conversation._id, channel: canonical }
    });
    return { conversation, created: true };
  }

  static async createInboundMessage({
    conversation,
    normalized,
    actorId
  }) {
    if (normalized.externalMessageId) {
      const duplicate = await Message.findOne({
        companyId: conversation.companyId,
        provider: normalized.provider,
        channelConfigId: conversation.channelConfigId || null,
        externalMessageId: normalized.externalMessageId
      });
      if (duplicate) return { message: duplicate, duplicate: true };
    }
    if (isWhatsAppChannel(conversation.channel)) {
      await checkUsageLimit({
        companyId: conversation.companyId,
        distributorId: conversation.distributorId,
        metric: 'whatsapp_messages',
        quantity: 1
      });
    }
    const message = await Message.create({
      companyId: conversation.companyId,
      distributorId: conversation.distributorId,
      conversationId: conversation._id,
      contactId: conversation.contactId,
      channel: canonicalChannel(conversation.channel),
      direction: 'inbound',
      type: normalized.type || 'text',
      text: normalized.text || '',
      media: normalized.media || {},
      status: 'received',
      externalMessageId: normalized.externalMessageId || '',
      provider: normalized.provider || canonicalChannel(conversation.channel),
      channelConfigId: conversation.channelConfigId || null,
      providerPayload: normalized.providerPayload || {},
      metadata: normalized.metadata || {},
      createdAt: normalized.timestamp || new Date()
    });
    const timestamp = normalized.timestamp || message.createdAt;
    this.updateLastMessage(conversation, message, timestamp);
    this.incrementUnread(conversation);
    if (['resolved', 'closed'].includes(conversation.status)) {
      conversation.status = 'open';
      conversation.closedAt = null;
      conversation.closedBy = null;
    }
    await conversation.save();
    realtimeConversation('message.created', conversation, {
      message: message.toJSON()
    });
    if (message.media?.providerMediaId || message.media?.externalMediaId) {
      await JobService.enqueue({
        type: 'media.whatsapp.download',
        payload: { messageId: message._id },
        companyId: conversation.companyId,
        distributorId: conversation.distributorId,
        metadata: { conversationId: conversation._id, messageId: message._id }
      });
    }
    if (conversation.assignedTo) {
      await NotificationService.create({
        companyId: conversation.companyId,
        distributorId: conversation.distributorId,
        userId: conversation.assignedTo,
        type: 'new_message',
        title: 'Nuevo mensaje',
        body: safePreview(message.text, `[${message.type}]`),
        relatedType: 'conversation',
        relatedId: conversation._id,
        metadata: { messageId: message._id }
      });
    }
    await activity({
      actorId,
      companyId: conversation.companyId,
      distributorId: conversation.distributorId,
      type: 'message_inbound_received',
      summary: `Mensaje inbound recibido por ${conversation.channel}`,
      metadata: {
        conversationId: conversation._id,
        contactId: conversation.contactId,
        messageId: message._id,
        externalMessageId: message.externalMessageId
      }
    });
    await CommunicationPolicyService.processInboundOptOut({
      companyId: conversation.companyId,
      distributorId: conversation.distributorId,
      contactId: conversation.contactId,
      channel: conversation.channel,
      text: message.text,
      messageId: message._id,
      recordedBy: actorId
    }).catch(() => null);
    if (isWhatsAppChannel(conversation.channel)) {
      await trackUsage({
        companyId: conversation.companyId,
        distributorId: conversation.distributorId,
        metric: 'whatsapp_messages',
        quantity: 1,
        metadata: {
          messageId: message._id,
          direction: 'inbound',
          sandboxMode: Boolean(normalized.metadata?.sandboxMode)
        }
      });
    }
    return { message, duplicate: false };
  }

  static async createOutboundMessage({
    user,
    conversation,
    text = '',
    type = 'text',
    template = null,
    templateId = null,
    media = {},
    category = '',
    adminOverride = false,
    overrideReason = ''
  }) {
    if (
      isWhatsAppChannel(conversation.channel) &&
      !hasUserPermission(user, 'whatsapp_messages:send')
    ) {
      throw Object.assign(
        new Error('No tienes permiso para enviar mensajes por WhatsApp'),
        { status: 403 }
      );
    }
    const contact = await Contact.findOne({
      _id: conversation.contactId,
      companyId: conversation.companyId,
      archivedAt: null
    });
    if (!contact) {
      throw Object.assign(new Error('Contacto no disponible para envio'), { status: 404 });
    }
    assertOutboundAllowed({ conversation, contact, text, type, template, media });
    const canonical = canonicalChannel(conversation.channel);
    const resolvedCategory = MESSAGE_CATEGORIES.includes(category)
      ? category
      : defaultMessageCategory(conversation);
    const policy = canonical === 'internal'
      ? {
          allowed: true,
          reasonCode: 'INTERNAL',
          reasonMessage: 'La comunicacion interna no contacta al cliente.',
          evaluatedChannel: 'other',
          evaluatedAt: new Date(),
          appliedRules: ['internal_message']
        }
      : await CommunicationPolicyService.evaluate({
          companyId: conversation.companyId,
          contactId: contact._id,
          channel: canonical,
          category: resolvedCategory,
          conversation,
          channelConfigId: conversation.channelConfigId,
          user,
          adminOverride,
          overrideReason
        });
    if (!policy.allowed) {
      const blocked = await Message.create({
        companyId: conversation.companyId,
        distributorId: conversation.distributorId,
        conversationId: conversation._id,
        contactId: conversation.contactId,
        channel: canonical,
        direction: 'outbound',
        type,
        category: resolvedCategory,
        text: String(text || '').trim(),
        media,
        status: 'blocked',
        provider: canonical,
        channelConfigId: conversation.channelConfigId || null,
        sentBy: user._id,
        reasonCode: policy.reasonCode,
        blockedByRule: policy.reasonCode,
        errorMessage: policy.reasonMessage,
        error: policy.reasonMessage,
        metadata: {
          policyEvaluation: sanitize(policy),
          templateName: template?.name || ''
        }
      });
      await activity({
        user,
        companyId: conversation.companyId,
        distributorId: conversation.distributorId,
        type: 'message_outbound_blocked',
        summary: `Mensaje bloqueado: ${policy.reasonMessage}`,
        metadata: {
          conversationId: conversation._id,
          contactId: conversation.contactId,
          messageId: blocked._id,
          reasonCode: policy.reasonCode,
          category: resolvedCategory
        }
      });
      const error = Object.assign(new Error(policy.reasonMessage), {
        status: 409,
        code: policy.reasonCode,
        policy
      });
      throw error;
    }
    if (isWhatsAppChannel(canonical)) {
      await checkUsageLimit({
        companyId: conversation.companyId,
        distributorId: conversation.distributorId,
        metric: 'whatsapp_messages',
        quantity: 1
      });
    }
    const message = await Message.create({
      companyId: conversation.companyId,
      distributorId: conversation.distributorId,
      conversationId: conversation._id,
      contactId: conversation.contactId,
      channel: canonical,
      direction: 'outbound',
      type,
      category: resolvedCategory,
      text: String(text || '').trim(),
      media,
      status: policy.scheduled ? 'scheduled' : 'queued',
      scheduledAt: policy.scheduleAt || null,
      reasonCode: policy.reasonCode,
      provider: canonical,
      channelConfigId: conversation.channelConfigId || null,
      sentBy: user._id,
      metadata: {
        ...(template
          ? {
              templateName: template.name || template,
              providerTemplate: sanitize(template)
            }
          : {}),
        ...(templateId ? { templateId: String(templateId) } : {}),
        policyEvaluation: sanitize(policy),
        adminOverride: Boolean(adminOverride),
        overrideReason: adminOverride ? String(overrideReason || '').trim() : ''
      }
    });
    await activity({
      user,
      companyId: conversation.companyId,
      distributorId: conversation.distributorId,
      type: 'message_outbound_created',
      summary: `Mensaje outbound creado por ${user.name}`,
      metadata: {
        conversationId: conversation._id,
        contactId: conversation.contactId,
        messageId: message._id
      }
    });

    const now = new Date();
    this.updateLastMessage(conversation, message, now);
    conversation.updatedBy = user._id;
    await conversation.save();
    realtimeConversation('message.created', conversation, { message: message.toJSON() });

    if (isWhatsAppChannel(canonical) || policy.scheduled) {
      await JobService.enqueue({
        type: outboundJobType(canonical),
        payload: {
          messageId: message._id,
          template
        },
        runAt: policy.scheduleAt || new Date(),
        companyId: conversation.companyId,
        distributorId: conversation.distributorId,
        metadata: {
          conversationId: conversation._id,
          messageId: message._id
        }
      });
      if (policy.scheduled) {
        await activity({
          user,
          companyId: conversation.companyId,
          distributorId: conversation.distributorId,
          type: 'message_outbound_scheduled',
          summary: 'Mensaje programado por horario silencioso',
          metadata: {
            conversationId: conversation._id,
            contactId: conversation.contactId,
            messageId: message._id,
            scheduledAt: policy.scheduleAt
          }
        });
      }
      return message;
    }

    return this.processOutboundMessage({ messageId: message._id, template });
  }

  static async processOutboundMessage({ messageId, template = null, job = null }) {
    const message = await Message.findById(messageId).select('+providerPayload');
    if (!message) {
      throw Object.assign(new Error('Mensaje outbound no encontrado'), { retryable: false });
    }
    if (['sent', 'delivered', 'read', 'blocked', 'skipped'].includes(message.status)) {
      return message;
    }

    const [conversation, contact] = await Promise.all([
      Conversation.findOne({
        _id: message.conversationId,
        companyId: message.companyId,
        archivedAt: null
      }),
      Contact.findOne({ _id: message.contactId, companyId: message.companyId })
    ]);
    if (!conversation || !contact) {
      throw Object.assign(new Error('Conversacion o contacto no disponible para envio'), {
        retryable: false
      });
    }
    assertOutboundAllowed({
      conversation,
      contact,
      text: message.text,
      type: message.type,
      template,
      media: message.media || {}
    });
    const declaredCanonical = canonicalChannel(conversation.channel);
    // El gateway es el UNICO camino por el que el envio elige numero: usa el de
    // la conversacion si sigue habilitado, o cae al numero por defecto de la
    // empresa. Solo aplica a WhatsApp; los mensajes internos no llevan canal.
    const channelConfig = isWhatsAppChannel(declaredCanonical)
      ? await resolveAccountForConversation(conversation)
      : null;
    // Se envia (y se registra) por el canal REALMENTE resuelto, que puede diferir
    // del declarado si hubo fallback (ej. el canal fijado quedo deshabilitado).
    const canonical = channelConfig
      ? canonicalChannel(channelConfig.channel)
      : declaredCanonical;
    // Persistir SIEMPRE el channelConfigId con el que se envia, en el mensaje y
    // en la conversacion si aun no lo tenia (o cambio por el fallback).
    if (channelConfig) {
      message.channelConfigId = channelConfig._id;
      if (String(conversation.channelConfigId || '') !== String(channelConfig._id)) {
        conversation.channelConfigId = channelConfig._id;
        await Conversation.updateOne(
          { _id: conversation._id, companyId: conversation.companyId },
          { $set: { channelConfigId: channelConfig._id } }
        ).catch(() => {});
      }
    }
    const sender = message.sentBy
      ? await User.findOne({ _id: message.sentBy, companyId: message.companyId })
      : null;
    const policy = canonical === 'internal'
      ? { allowed: true, reasonCode: 'INTERNAL', appliedRules: ['internal_message'] }
      : await CommunicationPolicyService.evaluate({
          companyId: message.companyId,
          contactId: message.contactId,
          channel: canonical,
          category: message.category || 'commercial',
          conversation,
          channelConfigId: channelConfig?._id || conversation.channelConfigId,
          user: sender,
          adminOverride: Boolean(message.metadata?.adminOverride),
          overrideReason: message.metadata?.overrideReason || ''
        });
    if (!policy.allowed) {
      message.status = 'blocked';
      message.reasonCode = policy.reasonCode;
      message.blockedByRule = policy.reasonCode;
      message.errorMessage = policy.reasonMessage;
      message.error = policy.reasonMessage;
      message.failedAt = null;
      message.metadata = {
        ...(message.metadata || {}),
        policyEvaluation: sanitize(policy)
      };
      await message.save();
      realtimeConversation('message.status_updated', conversation, {
        message: message.toJSON()
      });
      await activity({
        actorId: message.sentBy,
        companyId: conversation.companyId,
        distributorId: conversation.distributorId,
        type: 'message_outbound_blocked',
        summary: `Mensaje bloqueado antes del envio: ${policy.reasonMessage}`,
        metadata: {
          conversationId: conversation._id,
          contactId: conversation.contactId,
          messageId: message._id,
          reasonCode: policy.reasonCode
        }
      });
      return message;
    }
    if (policy.scheduled && new Date(policy.scheduleAt) > new Date()) {
      message.status = 'scheduled';
      message.scheduledAt = policy.scheduleAt;
      message.reasonCode = policy.reasonCode;
      message.metadata = {
        ...(message.metadata || {}),
        policyEvaluation: sanitize(policy)
      };
      await message.save();
      await JobService.enqueue({
        type: outboundJobType(canonical),
        payload: { messageId: message._id, template },
        runAt: policy.scheduleAt,
        companyId: message.companyId,
        distributorId: message.distributorId,
        metadata: {
          conversationId: conversation._id,
          messageId: message._id,
          rescheduledByPolicy: true
        }
      });
      return message;
    }
    const adapter = getChannelAdapter(canonical, { channelConfig });
    message.status = 'queued';
    message.attempts += 1;
    message.lastAttemptAt = new Date();
    const result = await adapter.sendMessage({
      companyId: conversation.companyId,
      conversationId: conversation._id,
      contact,
      text: message.text,
      type: message.type,
      template,
      media: message.media || {},
      userId: message.sentBy
    });

    message.providerPayload = sanitize(result.providerPayload || {});
    message.externalMessageId = result.externalMessageId || message.externalMessageId || '';
    message.error = sanitize(result.error || '');
    message.errorMessage = message.error;
    message.providerCode = sanitize(result.providerCode || result.code || '');
    message.reasonCode = result.success ? 'PROVIDER_ACCEPTED' : 'PROVIDER_ERROR';
    message.blockedByRule = '';
    if (result.success) {
      message.status = result.status || 'sent';
      message.sentAt = message.sentAt || new Date();
      message.failedAt = null;
    } else if (result.retryable && (!job || job.attempts < job.maxAttempts)) {
      message.status = 'queued';
      message.failedAt = null;
    } else {
      message.status = 'failed';
      message.failedAt = new Date();
    }
    await message.save();
    if (result.success && isWhatsAppChannel(canonical)) {
      await trackUsage({
        companyId: conversation.companyId,
        distributorId: conversation.distributorId,
        metric: 'whatsapp_messages',
        quantity: 1,
        metadata: {
          messageId: message._id,
          direction: 'outbound',
          sandboxMode: Boolean(channelConfig?.settings?.sandboxMode)
        }
      });
    }
    // usageCount solo se incrementa tras un envio exitoso de la plantilla.
    if (result.success && message.metadata?.templateId) {
      await TemplateSyncService.recordSuccessfulUse(
        message.metadata.templateId,
        message.companyId
      ).catch(() => {});
    }
    realtimeConversation('message.status_updated', conversation, {
      message: message.toJSON()
    });

    await activity({
      actorId: message.sentBy,
      companyId: conversation.companyId,
      distributorId: conversation.distributorId,
      type: result.success ? 'message_outbound_sent' : 'message_outbound_failed',
      summary: result.success
        ? `Mensaje enviado por ${canonical}`
        : `Mensaje no enviado: ${message.error}`,
      metadata: {
        conversationId: conversation._id,
        contactId: conversation.contactId,
        messageId: message._id,
        status: message.status,
        retryable: Boolean(result.retryable)
      }
    });

    if (!result.success) {
      const credentialsFailure = /token|credential|permission|autoriz|access/i.test(
        message.error
      );
      if (channelConfig) {
        channelConfig.error = sanitize(result.error || 'Error enviando por WhatsApp');
        if (message.status === 'failed' && credentialsFailure) {
          channelConfig.status = 'error';
        }
        await channelConfig.save().catch(() => {});
      }
      if (message.status === 'failed') {
        await OperationalAlertService.create({
          companyId: conversation.companyId,
          distributorId: conversation.distributorId,
          severity: credentialsFailure ? 'critical' : 'warning',
          type: credentialsFailure ? 'credentials_error' : 'channel_error',
          title: credentialsFailure
            ? 'Credenciales WhatsApp rechazadas'
            : 'Error de canal WhatsApp',
          message: message.error,
          relatedType: 'channel_config',
          relatedId: channelConfig?._id || null,
          metadata: { messageId: message._id }
        }).catch(() => {});
      }
      if (message.status === 'failed' && message.sentBy) {
        await NotificationService.create({
          companyId: conversation.companyId,
          distributorId: conversation.distributorId,
          userId: message.sentBy,
          type: 'message_failed',
          title: 'Mensaje no enviado',
          body: message.error,
          relatedType: 'conversation',
          relatedId: conversation._id,
          metadata: { messageId: message._id }
        });
      }
      throw Object.assign(new Error(message.error || 'El proveedor rechazo el mensaje'), {
        retryable: Boolean(result.retryable)
      });
    }
    return message;
  }

  static async createInternalNote({ user, conversation, text }) {
    if (!String(text).trim()) {
      throw Object.assign(new Error('text es requerido'), { status: 400 });
    }
    const message = await Message.create({
      companyId: conversation.companyId,
      distributorId: conversation.distributorId,
      conversationId: conversation._id,
      contactId: conversation.contactId,
      channel: canonicalChannel(conversation.channel),
      direction: 'internal',
      type: 'system',
      text: String(text).trim(),
      status: 'sent',
      provider: 'internal',
      sentBy: user._id
    });
    await activity({
      user,
      companyId: conversation.companyId,
      distributorId: conversation.distributorId,
      type: 'conversation_internal_note_created',
      summary: `Nota interna creada por ${user.name}`,
      metadata: {
        conversationId: conversation._id,
        contactId: conversation.contactId,
        messageId: message._id
      }
    });
    realtimeConversation('internal_note.created', conversation, {
      message: message.toJSON()
    });
    if (
      conversation.assignedTo &&
      String(conversation.assignedTo) !== String(user._id)
    ) {
      await NotificationService.create({
        companyId: conversation.companyId,
        distributorId: conversation.distributorId,
        userId: conversation.assignedTo,
        type: 'internal_note',
        title: 'Nueva nota interna',
        body: safePreview(message.text),
        relatedType: 'conversation',
        relatedId: conversation._id,
        metadata: { messageId: message._id }
      });
    }
    return message;
  }

  static async assignConversation({ user, conversation, assignedTo }) {
    const previous = conversation.assignedTo?.toString() || null;
    conversation.assignedTo = await validateCrmAssignee(user, assignedTo);
    conversation.updatedBy = user._id;
    await conversation.save();
    await activity({
      user,
      companyId: conversation.companyId,
      distributorId: conversation.distributorId,
      type: 'conversation_assigned',
      summary: 'Conversacion reasignada',
      metadata: {
        conversationId: conversation._id,
        contactId: conversation.contactId,
        from: previous,
        to: conversation.assignedTo
      }
    });
    realtimeConversation('conversation.assigned', conversation, { previousAssignedTo: previous });
    if (previous && previous !== String(conversation.assignedTo || '')) {
      RealtimeService.publish('conversation.assigned', {
        userId: previous,
        companyId: conversation.companyId,
        data: {
          conversationId: conversation._id,
          assignedTo: conversation.assignedTo,
          previousAssignedTo: previous
        }
      });
    }
    if (conversation.assignedTo && String(conversation.assignedTo) !== previous) {
      await NotificationService.create({
        companyId: conversation.companyId,
        distributorId: conversation.distributorId,
        userId: conversation.assignedTo,
        type: 'conversation_assigned',
        title: 'Conversacion asignada',
        body: 'Se te asigno una conversacion.',
        relatedType: 'conversation',
        relatedId: conversation._id
      });
    }
    return conversation;
  }

  static async setStatus({ user, conversation, status }) {
    const previous = conversation.status;
    conversation.status = status;
    conversation.updatedBy = user._id;
    if (['closed', 'resolved'].includes(status)) {
      conversation.closedAt = new Date();
      conversation.closedBy = user._id;
    } else {
      conversation.closedAt = null;
      conversation.closedBy = null;
    }
    if (status === 'archived') conversation.archivedAt = new Date();
    await conversation.save();
    const type = status === 'archived'
      ? 'conversation_archived'
      : ['closed', 'resolved'].includes(status)
        ? 'conversation_closed'
        : 'conversation_reopened';
    await activity({
      user,
      companyId: conversation.companyId,
      distributorId: conversation.distributorId,
      type,
      summary: `Conversacion ${status}`,
      metadata: { conversationId: conversation._id, contactId: conversation.contactId, from: previous, to: status }
    });
    realtimeConversation(
      ['closed', 'resolved'].includes(status)
        ? 'conversation.closed'
        : 'conversation.updated',
      conversation,
      { previousStatus: previous }
    );
    if (['closed', 'resolved'].includes(status) && conversation.assignedTo) {
      await NotificationService.create({
        companyId: conversation.companyId,
        distributorId: conversation.distributorId,
        userId: conversation.assignedTo,
        type: 'conversation_closed',
        title: 'Conversacion cerrada',
        body: `La conversacion cambio a ${status}.`,
        relatedType: 'conversation',
        relatedId: conversation._id
      });
    }
    return conversation;
  }

  static closeConversation({ user, conversation }) {
    return this.setStatus({ user, conversation, status: 'closed' });
  }

  static reopenConversation({ user, conversation }) {
    return this.setStatus({ user, conversation, status: 'open' });
  }

  static archiveConversation({ user, conversation }) {
    return this.setStatus({ user, conversation, status: 'archived' });
  }

  static async markAsRead({ user, conversation }) {
    conversation.unreadCount = 0;
    conversation.updatedBy = user._id;
    await conversation.save();
    await Message.updateMany(
      {
        companyId: conversation.companyId,
        conversationId: conversation._id,
        direction: 'inbound',
        status: { $in: ['received', 'delivered'] }
      },
      { status: 'read', readAt: new Date() }
    );
    if (
      canonicalChannel(conversation.channel) === 'whatsapp_qr' &&
      conversation.channelConfigId &&
      conversation.externalConversationId
    ) {
      const config = await ChannelConfig.findOne({
        _id: conversation.channelConfigId,
        companyId: conversation.companyId
      });
      if (config) {
        const inboundMessages = await Message.find({
          companyId: conversation.companyId,
          conversationId: conversation._id,
          direction: 'inbound',
          provider: 'whatsapp_qr',
          externalMessageId: { $ne: '' }
        })
          .sort({ createdAt: -1 })
          .limit(50)
          .select('externalMessageId')
          .lean();
        const inboundIds = [
          ...new Set(inboundMessages.map((item) => item.externalMessageId))
        ];
        await getChannelAdapter('whatsapp_qr', { channelConfig: config })
          .markAsRead({
            remoteJid: conversation.externalConversationId,
            externalMessageIds: inboundIds
          })
          .catch(() => false);
      }
    }
    await activity({
      user,
      companyId: conversation.companyId,
      distributorId: conversation.distributorId,
      type: 'conversation_read',
      summary: 'Conversacion marcada como leida',
      metadata: { conversationId: conversation._id, contactId: conversation.contactId }
    });
    realtimeConversation('conversation.updated', conversation, { unreadCount: 0 });
    return conversation;
  }

  static async actorForChannelConfig(channelConfig) {
    if (channelConfig.createdBy) return channelConfig.createdBy;
    const admin = await User.findOne({
      companyId: channelConfig.companyId,
      role: 'ADMIN',
      status: 'active'
    }).select('_id');
    return admin?._id || null;
  }
}
