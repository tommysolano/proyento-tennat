import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Contact } from '../models/Contact.js';
import { ChannelConfig } from '../models/ChannelConfig.js';
import {
  CONVERSATION_CHANNELS,
  CONVERSATION_STATUSES,
  Conversation
} from '../models/Conversation.js';
import { CRM_PRIORITIES } from '../models/Contact.js';
import { Message } from '../models/Message.js';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { User } from '../models/User.js';
import { ConversationService } from '../modules/conversations/ConversationService.js';
import {
  conversationScope,
  preserveAssignedScope
} from '../modules/conversations/conversationScope.js';
import { canonicalChannel } from '../modules/conversations/adapters/index.js';
import { resolveAccountForConversation } from '../modules/communications/accountGateway.js';
import { TemplateSyncService } from '../modules/communications/TemplateSyncService.js';
import { assignedResourceScope, validateCrmAssignee } from '../utils/crmScope.js';
import { cleanString, isValidObjectId } from '../utils/validation.js';
import { mediaUpload } from '../middleware/mediaUploadMiddleware.js';
import { getStorageProvider } from '../modules/storage/index.js';
import { validateMedia } from '../modules/storage/mediaValidation.js';
import { checkUsageLimit, trackUsage } from '../utils/usage.js';
import { logger } from '../utils/logger.js';
import { hasUserPermission } from '../core/permissions/permissions.js';

const router = Router();
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${field} debe ser fecha valida`);
  return date;
}

function populateConversation(query) {
  return query
    .populate({
      path: 'contactId',
      select: 'name fullName phone email source status lifecycleStage assignedTo tags metadata communicationPreferences',
      populate: { path: 'tags', select: 'name color' }
    })
    .populate('assignedTo', 'name email role supervisorId')
    .populate('channelConfigId', 'displayName channel status phoneNumberId')
    .populate('closedBy createdBy updatedBy', 'name email role')
    .populate('tags', 'name color');
}

async function accessibleConversation(user, id) {
  return Conversation.findOne({
    _id: id,
    ...(await conversationScope(user)),
    archivedAt: null
  });
}

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(
  requireAnyPermission(
    'conversations:read',
    'conversations:read_team',
    'conversations:read_assigned'
  )
);
router.use(requireModule('conversations'));
router.use(requireModule('inbox'));
router.param('id', (req, res, next, id) => {
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'id de conversacion invalido' });
  }
  next();
});

router.get('/metrics', async (req, res, next) => {
  try {
    const scope = await conversationScope(req.user);
    const conversations = await Conversation.find({ ...scope, archivedAt: null })
      .select('channel status assignedTo unreadCount lastInboundAt lastOutboundAt lastMessageAt')
      .lean();
    const conversationIds = conversations.map((item) => item._id);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const messages = conversationIds.length
      ? await Message.find({
          companyId: req.user.companyId,
          conversationId: { $in: conversationIds }
        })
          .select('conversationId direction status sentBy createdAt')
          .sort({ createdAt: 1 })
          .limit(50000)
          .lean()
      : [];
    const connectedChannels = req.user.role === 'ADMIN'
      ? await import('../models/ChannelConfig.js').then(({ ChannelConfig }) =>
          ChannelConfig.countDocuments({
            companyId: req.user.companyId,
            status: 'connected'
          })
        )
      : 0;
    const unanswered = conversations.filter(
      (item) =>
        item.lastInboundAt &&
        (!item.lastOutboundAt || new Date(item.lastInboundAt) > new Date(item.lastOutboundAt))
    ).length;
    const latest = await populateConversation(
      Conversation.find({ ...scope, archivedAt: null })
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .limit(5)
    );
    const channelCounts = {};
    const responseState = new Map();
    const agentStats = new Map();
    for (const conversation of conversations) {
      channelCounts[conversation.channel] = (channelCounts[conversation.channel] || 0) + 1;
      if (conversation.assignedTo) {
        const key = String(conversation.assignedTo);
        agentStats.set(key, {
          userId: conversation.assignedTo,
          openAssigned: 0,
          messagesResponded: 0,
          pendingWithoutResponse: 0,
          failed: 0
        });
        if (conversation.status === 'open') agentStats.get(key).openAssigned += 1;
        if (
          conversation.lastInboundAt &&
          (!conversation.lastOutboundAt ||
            new Date(conversation.lastInboundAt) > new Date(conversation.lastOutboundAt))
        ) {
          agentStats.get(key).pendingWithoutResponse += 1;
        }
      }
    }
    for (const message of messages) {
      const conversationKey = String(message.conversationId);
      const state = responseState.get(conversationKey) || {
        firstInboundAt: null,
        firstResponseAt: null
      };
      if (message.direction === 'inbound' && !state.firstInboundAt) {
        state.firstInboundAt = message.createdAt;
      }
      if (
        message.direction === 'outbound' &&
        state.firstInboundAt &&
        !state.firstResponseAt &&
        new Date(message.createdAt) >= new Date(state.firstInboundAt)
      ) {
        state.firstResponseAt = message.createdAt;
      }
      responseState.set(conversationKey, state);
      if (message.sentBy) {
        const key = String(message.sentBy);
        const stats = agentStats.get(key) || {
          userId: message.sentBy,
          openAssigned: 0,
          messagesResponded: 0,
          pendingWithoutResponse: 0,
          failed: 0
        };
        if (
          message.direction === 'outbound' &&
          new Date(message.createdAt) >= startOfToday
        ) {
          stats.messagesResponded += 1;
        }
        if (message.status === 'failed') stats.failed += 1;
        agentStats.set(key, stats);
      }
    }
    const responseTimes = [...responseState.values()]
      .filter((item) => item.firstInboundAt && item.firstResponseAt)
      .map(
        (item) =>
          new Date(item.firstResponseAt).getTime() -
          new Date(item.firstInboundAt).getTime()
      )
      .filter((value) => value >= 0);
    const agentIds = [...agentStats.keys()];
    const agentUsers = await User.find({ _id: { $in: agentIds } })
      .select('name email role')
      .lean();
    const agentById = new Map(agentUsers.map((item) => [String(item._id), item]));
    res.json({
      open: conversations.filter((item) => item.status === 'open').length,
      pending: conversations.filter((item) => item.status === 'pending').length,
      unassigned: conversations.filter((item) => !item.assignedTo).length,
      unreadMessages: conversations.reduce((sum, item) => sum + item.unreadCount, 0),
      unanswered,
      connectedChannels,
      byChannel: channelCounts,
      averageFirstResponseMs: responseTimes.length
        ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
        : null,
      failedMessages: messages.filter((item) => item.status === 'failed').length,
      inboundToday: messages.filter(
        (item) =>
          item.direction === 'inbound' && new Date(item.createdAt) >= startOfToday
      ).length,
      outboundToday: messages.filter(
        (item) =>
          item.direction === 'outbound' && new Date(item.createdAt) >= startOfToday
      ).length,
      agents: [...agentStats.entries()].map(([id, stats]) => ({
        ...stats,
        user: agentById.get(id) || null
      })),
      oldestLastMessageAt: conversations
        .map((item) => item.lastMessageAt)
        .filter(Boolean)
        .sort((a, b) => new Date(a) - new Date(b))[0] || null,
      latestMessageAt: conversations
        .map((item) => item.lastMessageAt)
        .filter(Boolean)
        .sort((a, b) => new Date(b) - new Date(a))[0] || null,
      latest
    });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/providers',
  requireAnyPermission('whatsapp_provider:select', 'channel_configs:manage'),
  async (req, res, next) => {
    try {
      const configs = await ChannelConfig.find({
        companyId: req.user.companyId,
        channel: { $in: ['whatsapp_cloud', 'whatsapp_qr'] },
        status: { $ne: 'disabled' }
      })
        .select('displayName channel status phoneNumberId lastConnectedAt')
        .sort({ channel: 1, displayName: 1 });
      res.json(configs);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/', async (req, res, next) => {
  try {
    const filter = await conversationScope(req.user);
    if (req.query.assignedTo && !isValidObjectId(req.query.assignedTo)) {
      throw badRequest('assignedTo invalido');
    }
    if (req.query.contactId && !isValidObjectId(req.query.contactId)) {
      throw badRequest('contactId invalido');
    }
    preserveAssignedScope(filter, req.query.assignedTo);
    for (const field of ['status', 'channel', 'contactId', 'priority']) {
      if (req.query[field]) filter[field] = req.query[field];
    }
    if (req.query.unread === 'true') filter.unreadCount = { $gt: 0 };
    if (req.query.dateFrom || req.query.dateTo) {
      filter.lastMessageAt = {};
      if (req.query.dateFrom) filter.lastMessageAt.$gte = parseDate(req.query.dateFrom, 'dateFrom');
      if (req.query.dateTo) filter.lastMessageAt.$lte = parseDate(req.query.dateTo, 'dateTo');
    }
    if (req.query.search) {
      const expression = new RegExp(escapeRegExp(cleanString(req.query.search)), 'i');
      const contacts = await Contact.find({
        companyId: req.user.companyId,
        $or: [{ name: expression }, { phone: expression }, { email: expression }]
      }).distinct('_id');
      filter.$or = [{ lastMessage: expression }, { contactId: { $in: contacts } }];
    }
    filter.archivedAt = null;
    const conversations = await populateConversation(
      Conversation.find(filter).sort({ lastMessageAt: -1, updatedAt: -1 }).limit(300)
    );
    res.json(conversations);
  } catch (error) {
    next(error);
  }
});

router.post('/', roleMiddleware('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.body.contactId)) throw badRequest('contactId invalido');
    const contact = await Contact.findOne({
      _id: req.body.contactId,
      ...(await assignedResourceScope(req.user)),
      archivedAt: null
    });
    if (!contact) throw badRequest('Contacto fuera de alcance');
    const channel = canonicalChannel(req.body.channel || 'internal');
    if (!CONVERSATION_CHANNELS.includes(channel)) throw badRequest('channel invalido');
    if (
      ['whatsapp_cloud', 'whatsapp_qr'].includes(channel) &&
      !hasUserPermission(req.user, 'whatsapp_provider:select')
    ) {
      throw Object.assign(
        new Error('No tienes permiso para seleccionar una conexion WhatsApp'),
        { status: 403 }
      );
    }
    const assignedTo = req.body.assignedTo
      ? await validateCrmAssignee(req.user, req.body.assignedTo)
      : contact.assignedTo;
    let channelConfigId = null;
    if (req.body.channelConfigId) {
      if (!isValidObjectId(req.body.channelConfigId)) {
        throw badRequest('channelConfigId invalido');
      }
      const config = await ChannelConfig.findOne({
        _id: req.body.channelConfigId,
        companyId: req.user.companyId,
        status: ['whatsapp_cloud', 'whatsapp_qr'].includes(channel)
          ? 'connected'
          : { $ne: 'disabled' }
      });
      if (!config) {
        throw badRequest('channelConfigId fuera de la empresa o no conectado');
      }
      if (canonicalChannel(config.channel) !== channel) {
        throw badRequest('channelConfigId no corresponde al canal solicitado');
      }
      channelConfigId = config._id;
    } else if (['whatsapp_cloud', 'whatsapp_qr'].includes(channel)) {
      const configs = await ChannelConfig.find({
        companyId: req.user.companyId,
        channel,
        status: 'connected'
      }).select('_id');
      if (configs.length !== 1) {
        throw badRequest(
          configs.length
            ? 'Selecciona la conexion WhatsApp de salida'
            : 'No hay una conexion WhatsApp disponible'
        );
      }
      channelConfigId = configs[0]._id;
    }
    const { conversation } = await ConversationService.findOrCreateConversation({
      companyId: req.user.companyId,
      distributorId: req.user.distributorId,
      contactId: contact._id,
      channel,
      channelConfigId,
      assignedTo,
      createdBy: req.user._id
    });
    res.status(201).json(await populateConversation(Conversation.findById(conversation._id)));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const conversation = await accessibleConversation(req.user, req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversacion no encontrada' });
    const messages = await Message.find({
      companyId: req.user.companyId,
      conversationId: conversation._id
    })
      .populate('sentBy', 'name email role')
      .sort({ createdAt: 1 })
      .limit(1000);
    const canReadDiagnostics = [
      'message_diagnostics:read',
      'message_diagnostics:read_team',
      'message_diagnostics:read_assigned'
    ].some((permission) => hasUserPermission(req.user, permission));
    res.json(messages.map((message) => {
      const value = message.toJSON();
      if (!canReadDiagnostics) {
        for (const field of [
          'reasonCode',
          'providerCode',
          'blockedByRule',
          'integrationId',
          'errorMessage',
          'attempts',
          'lastAttemptAt',
          'error'
        ]) delete value[field];
      }
      return value;
    }));
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:id/messages',
  requireAnyPermission(
    'conversations:send',
    'conversations:send_team',
    'conversations:send_assigned'
  ),
  async (req, res, next) => {
  try {
    const conversation = await accessibleConversation(req.user, req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversacion no encontrada' });
    if (req.body.templateId && !isValidObjectId(req.body.templateId)) {
      throw badRequest('templateId invalido');
    }
    const template = req.body.templateId
      ? await MessageTemplate.findOne({
          _id: req.body.templateId,
          companyId: req.user.companyId,
          // Usable = quick reply local (active) o plantilla HSM aprobada por Meta.
          status: { $in: ['active', 'approved'] }
        })
      : null;
    if (req.body.templateId && !template) throw badRequest('Plantilla no disponible');
    const conversationChannel = canonicalChannel(conversation.channel);
    if (
      template &&
      template.channel !== 'internal' &&
      template.channel !== conversationChannel
    ) {
      throw badRequest('La plantilla no corresponde al canal de la conversacion');
    }
    const providerTemplate = template?.type === 'whatsapp_template';
    if (providerTemplate) {
      // Una plantilla HSM solo sale por un numero con API de Meta. Si la
      // conversacion resuelve a un numero QR, se rechaza con un error claro en
      // vez de simular un envio que Meta no soporta.
      const account = await resolveAccountForConversation(conversation);
      TemplateSyncService.assertCloudAccountForTemplate(account);
    }
    const message = await ConversationService.createOutboundMessage({
      user: req.user,
      conversation,
      text: req.body.text || template?.content || '',
      type: providerTemplate ? 'template' : req.body.type || 'text',
      category: template?.messageCategory || req.body.category || '',
      template: providerTemplate
        ? TemplateSyncService.buildOutboundTemplate(
            template,
            req.body.templateVariables && typeof req.body.templateVariables === 'object'
              ? req.body.templateVariables
              : {}
          )
        : null,
      templateId: providerTemplate ? template._id : null,
      media: req.body.media || {},
      adminOverride: req.body.adminOverride === true,
      overrideReason: cleanString(req.body.overrideReason)
    });
    res.status(201).json(await message.populate('sentBy', 'name email role'));
  } catch (error) {
    next(error);
  }
  }
);

router.post(
  '/:id/messages/media',
  requireAnyPermission('media:upload', 'media:upload_team', 'media:upload_assigned'),
  requireModule('media'),
  mediaUpload.single('file'),
  async (req, res, next) => {
    let stored = null;
    try {
      const conversation = await accessibleConversation(req.user, req.params.id);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversacion no encontrada' });
      }
      if (!req.file?.buffer) {
        throw badRequest('file es requerido');
      }
      const validation = validateMedia({
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      });
      const storageMb = validation.size / (1024 * 1024);
      await Promise.all([
        checkUsageLimit({
          companyId: req.user.companyId,
          distributorId: req.user.distributorId,
          metric: 'media_storage_mb',
          quantity: storageMb
        }),
        checkUsageLimit({
          companyId: req.user.companyId,
          distributorId: req.user.distributorId,
          metric: 'media_files',
          quantity: 1
        })
      ]);
      const storage = getStorageProvider();
      stored = await storage.uploadBuffer({
        buffer: req.file.buffer,
        filename: validation.filename,
        mimeType: validation.mimeType,
        scope: { companyId: req.user.companyId }
      });
      const type = validation.mimeType.startsWith('image/')
        ? 'image'
        : validation.mimeType.startsWith('audio/')
          ? 'audio'
          : validation.mimeType.startsWith('video/')
            ? 'video'
            : 'document';
      const message = await ConversationService.createOutboundMessage({
        user: req.user,
        conversation,
        text: cleanString(req.body.caption),
        type,
        category: req.body.category || '',
        media: {
          filename: stored.filename,
          mimeType: stored.mimeType,
          size: stored.size,
          storageKey: stored.storageKey,
          status: 'available',
          caption: cleanString(req.body.caption)
        }
      });
      await Promise.all([
        trackUsage({
          companyId: req.user.companyId,
          distributorId: req.user.distributorId,
          metric: 'media_storage_mb',
          quantity: storageMb,
          metadata: { messageId: message._id }
        }),
        trackUsage({
          companyId: req.user.companyId,
          distributorId: req.user.distributorId,
          metric: 'media_files',
          quantity: 1,
          metadata: { messageId: message._id }
        }),
        ConversationService.createActivityLog({
          user: req.user,
          companyId: req.user.companyId,
          distributorId: req.user.distributorId,
          type: 'media_upload_created',
          summary: 'Media outbound almacenada',
          metadata: {
            messageId: message._id,
            conversationId: conversation._id,
            mimeType: stored.mimeType,
            size: stored.size
          }
        })
      ]);
      logger.info('media.upload_succeeded', {
        messageId: message._id,
        conversationId: conversation._id,
        companyId: req.user.companyId,
        mimeType: stored.mimeType,
        size: stored.size
      });
      res.status(201).json(await message.populate('sentBy', 'name email role'));
    } catch (error) {
      if (stored?.storageKey) {
        await getStorageProvider()
          .deleteObject({ storageKey: stored.storageKey })
          .catch(() => {});
      }
      logger.error('media.upload_failed', error, {
        conversationId: req.params.id,
        companyId: req.user?.companyId
      });
      next(error);
    }
  }
);

router.post(
  '/:id/internal-note',
  requireAnyPermission(
    'conversations:send',
    'conversations:send_team',
    'conversations:internal_notes'
  ),
  async (req, res, next) => {
  try {
    const conversation = await accessibleConversation(req.user, req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversacion no encontrada' });
    const message = await ConversationService.createInternalNote({
      user: req.user,
      conversation,
      text: req.body.text
    });
    res.status(201).json(await message.populate('sentBy', 'name email role'));
  } catch (error) {
    next(error);
  }
  }
);

router.get('/:id', async (req, res, next) => {
  try {
    const conversation = await populateConversation(
      Conversation.findOne({
        _id: req.params.id,
        ...(await conversationScope(req.user)),
        archivedAt: null
      })
    );
    if (!conversation) return res.status(404).json({ message: 'Conversacion no encontrada' });
    res.json(conversation);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const conversation = await accessibleConversation(req.user, req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversacion no encontrada' });
    if ('priority' in req.body) {
      if (!CRM_PRIORITIES.includes(req.body.priority)) throw badRequest('priority invalida');
      conversation.priority = req.body.priority;
    }
    if ('status' in req.body) {
      if (req.user.role === 'CALLCENTER') {
        return res.status(403).json({
          message: 'CALLCENTER no puede cambiar el estado de la conversacion'
        });
      }
      if (!CONVERSATION_STATUSES.includes(req.body.status)) throw badRequest('status invalido');
      if (req.body.status === 'archived' && req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Solo ADMIN puede archivar conversaciones' });
      }
      await ConversationService.setStatus({
        user: req.user,
        conversation,
        status: req.body.status
      });
    } else {
      conversation.updatedBy = req.user._id;
      await conversation.save();
    }
    res.json(await populateConversation(Conversation.findById(conversation._id)));
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/:id/assign',
  roleMiddleware('ADMIN', 'SUPERVISOR'),
  requireAnyPermission('conversations:assign', 'conversations:assign_team'),
  async (req, res, next) => {
  try {
    const conversation = await accessibleConversation(req.user, req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversacion no encontrada' });
    await ConversationService.assignConversation({
      user: req.user,
      conversation,
      assignedTo: req.body.assignedTo
    });
    res.json(await populateConversation(Conversation.findById(conversation._id)));
  } catch (error) {
    next(error);
  }
  }
);

for (const [path, status] of [
  ['close', 'closed'],
  ['reopen', 'open'],
  ['archive', 'archived']
]) {
  router.patch(
    `/:id/${path}`,
    requireAnyPermission('conversations:close', 'conversations:close_team'),
    async (req, res, next) => {
    try {
      if (status === 'archived' && req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Solo ADMIN puede archivar conversaciones' });
      }
      const conversation = await accessibleConversation(req.user, req.params.id);
      if (!conversation) return res.status(404).json({ message: 'Conversacion no encontrada' });
      const action = {
        closed: 'closeConversation',
        open: 'reopenConversation',
        archived: 'archiveConversation'
      }[status];
      await ConversationService[action]({ user: req.user, conversation });
      res.json(await populateConversation(Conversation.findById(conversation._id)));
    } catch (error) {
      next(error);
    }
    }
  );
}

router.patch('/:id/read', async (req, res, next) => {
  try {
    const conversation = await accessibleConversation(req.user, req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversacion no encontrada' });
    await ConversationService.markAsRead({ user: req.user, conversation });
    res.json(await populateConversation(Conversation.findById(conversation._id)));
  } catch (error) {
    next(error);
  }
});

export default router;
