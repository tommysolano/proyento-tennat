import { ActivityLog } from '../../models/ActivityLog.js';
import { ChannelConfig } from '../../models/ChannelConfig.js';
import { Contact } from '../../models/Contact.js';
import { Conversation } from '../../models/Conversation.js';
import { Message } from '../../models/Message.js';
import { User } from '../../models/User.js';
import { validateCrmAssignee } from '../../utils/crmScope.js';
import { getChannelAdapter, canonicalChannel } from './adapters/index.js';

function safePreview(text, fallback = '') {
  return String(text || fallback).slice(0, 500);
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
  return ActivityLog.create({
    companyId,
    distributorId: distributorId || null,
    userId,
    type,
    summary,
    metadata
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
    conversation = await Conversation.create({
      companyId,
      distributorId: distributorId || null,
      contactId,
      channel: canonical,
      channelConfigId,
      externalConversationId,
      assignedTo: assignedTo || contact.assignedTo || null,
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
        externalMessageId: normalized.externalMessageId
      });
      if (duplicate) return { message: duplicate, duplicate: true };
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
    return { message, duplicate: false };
  }

  static async createOutboundMessage({
    user,
    conversation,
    text = '',
    type = 'text',
    template = null,
    media = {}
  }) {
    if (type === 'text' && !String(text).trim()) {
      throw Object.assign(new Error('text es requerido para mensajes de texto'), { status: 400 });
    }
    const canonical = canonicalChannel(conversation.channel);
    const message = await Message.create({
      companyId: conversation.companyId,
      distributorId: conversation.distributorId,
      conversationId: conversation._id,
      contactId: conversation.contactId,
      channel: canonical,
      direction: 'outbound',
      type,
      text: String(text || '').trim(),
      media,
      status: 'pending',
      provider: canonical,
      sentBy: user._id,
      metadata: template ? { templateName: template.name || template } : {}
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

    const [contact, channelConfig] = await Promise.all([
      Contact.findOne({ _id: conversation.contactId, companyId: conversation.companyId }),
      conversation.channelConfigId
        ? ChannelConfig.findOne({
            _id: conversation.channelConfigId,
            companyId: conversation.companyId
          }).select('+credentials +verifyToken +webhookSecret')
        : null
    ]);
    const adapter = getChannelAdapter(canonical, { channelConfig });
    const result = await adapter.sendMessage({
      companyId: conversation.companyId,
      conversationId: conversation._id,
      contact,
      text: message.text,
      template,
      media,
      userId: user._id
    });

    message.status = result.status || (result.success ? 'sent' : 'failed');
    message.externalMessageId = result.externalMessageId || '';
    message.providerPayload = result.providerPayload || {};
    message.error = result.error || '';
    if (!result.success) message.failedAt = new Date();
    await message.save();

    const now = new Date();
    this.updateLastMessage(conversation, message, now);
    conversation.updatedBy = user._id;
    await conversation.save();
    await activity({
      user,
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
        status: message.status
      }
    });
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
    await activity({
      user,
      companyId: conversation.companyId,
      distributorId: conversation.distributorId,
      type: 'conversation_read',
      summary: 'Conversacion marcada como leida',
      metadata: { conversationId: conversation._id, contactId: conversation.contactId }
    });
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
