import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Job } from '../models/Job.js';
import { JobService } from '../modules/jobs/JobService.js';
import { ConversationService } from '../modules/conversations/ConversationService.js';
import { conversationScope } from '../modules/conversations/conversationScope.js';
import { getStorageProvider } from '../modules/storage/index.js';

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requireModule('conversations'));
router.use(requireModule('inbox'));

router.post(
  '/:id/retry',
  requireAnyPermission(
    'conversations:send',
    'conversations:send_team',
    'conversations:send_assigned'
  ),
  async (req, res, next) => {
  try {
    const original = await Message.findOne({
      _id: req.params.id,
      companyId: req.user.companyId,
      status: 'failed',
      direction: 'outbound'
    });
    if (!original) return res.status(404).json({ message: 'Mensaje fallido no encontrado' });
    const conversation = await Conversation.findOne({
      _id: original.conversationId,
      ...(await conversationScope(req.user)),
      archivedAt: null
    });
    if (!conversation) return res.status(404).json({ message: 'Conversacion no encontrada' });
    const existingJob = await Job.findOne({
      type: 'message.whatsapp.send',
      status: { $in: ['pending', 'processing', 'failed'] },
      'metadata.messageId': original._id
    });
    original.status = 'pending';
    original.failedAt = null;
    original.error = '';
    original.metadata = { ...(original.metadata || {}), manualRetryAt: new Date() };
    await original.save();
    if (existingJob && existingJob.status !== 'processing') {
      existingJob.status = 'pending';
      existingJob.runAt = new Date();
      existingJob.lockedAt = null;
      existingJob.lockedBy = '';
      await existingJob.save();
    } else if (!existingJob) {
      const job = await JobService.enqueue({
        type: 'message.whatsapp.send',
        payload: {
          messageId: original._id,
          template: original.metadata?.providerTemplate || null
        },
        priority: 5,
        companyId: original.companyId,
        distributorId: original.distributorId,
        metadata: {
          conversationId: original.conversationId,
          messageId: original._id,
          manualRetry: true
        }
      });
      original.metadata = { ...(original.metadata || {}), retryJobId: job._id };
      await original.save();
    }
    res.status(202).json(await original.populate('sentBy', 'name email role'));
  } catch (error) {
    next(error);
  }
  }
);

router.get(
  '/:id/media',
  requireAnyPermission('media:read', 'media:read_team', 'media:read_assigned'),
  requireModule('media'),
  async (req, res, next) => {
  try {
    const message = await Message.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!message) return res.status(404).json({ message: 'Mensaje no encontrado' });
    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      ...(await conversationScope(req.user)),
      archivedAt: null
    });
    if (!conversation) return res.status(404).json({ message: 'Conversacion no encontrada' });
    const media = message.media?.toObject?.() || message.media || {};
    let publicUrl = '';
    try {
      const parsed = new URL(media.url || '');
      const host = parsed.hostname.toLowerCase();
      const privateHost =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host);
      if (['http:', 'https:'].includes(parsed.protocol) && !privateHost) {
        publicUrl = parsed.toString();
      }
    } catch {
      publicUrl = '';
    }
    res.json({
      status: media.status || (publicUrl ? 'available' : 'none'),
      media: {
        url: publicUrl,
        contentUrl: media.storageKey
          ? `/api/messages/${message._id}/media/content`
          : '',
        mimeType: media.mimeType || '',
        filename: media.filename || media.fileName || '',
        size: media.size || 0,
        providerMediaIdConfigured: Boolean(media.providerMediaId || media.externalMediaId),
        storageKeyConfigured: Boolean(media.storageKey),
        error: media.error || ''
      }
    });
  } catch (error) {
    next(error);
  }
  }
);

router.get(
  '/:id/media/content',
  requireAnyPermission('media:read', 'media:read_team', 'media:read_assigned'),
  requireModule('media'),
  async (req, res, next) => {
    try {
      const message = await Message.findOne({
        _id: req.params.id,
        companyId: req.user.companyId
      });
      if (!message) return res.status(404).json({ message: 'Mensaje no encontrado' });
      const conversation = await Conversation.findOne({
        _id: message.conversationId,
        ...(await conversationScope(req.user)),
        archivedAt: null
      });
      if (!conversation) {
        return res.status(404).json({ message: 'Conversacion no encontrada' });
      }
      if (message.media?.status === 'pending') {
        return res.status(202).json({ status: 'pending', message: 'Media pendiente' });
      }
      if (message.media?.status === 'failed') {
        return res.status(409).json({
          status: 'failed',
          message: message.media.error || 'La media no esta disponible'
        });
      }
      if (!message.media?.storageKey) {
        return res.status(404).json({ message: 'La media no tiene contenido almacenado' });
      }
      const storage = getStorageProvider();
      const { stream, metadata } = await storage.createReadStream({
        storageKey: message.media.storageKey
      });
      res.setHeader('Content-Type', metadata.mimeType);
      res.setHeader('Content-Length', metadata.size);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${metadata.filename.replace(/"/g, '')}"`
      );
      res.setHeader('Cache-Control', 'private, max-age=60');
      stream.on('error', next);
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/:id/media/retry-download',
  requireAnyPermission('media:read', 'media:read_team', 'media:read_assigned'),
  requireModule('media'),
  requireModule('whatsapp'),
  async (req, res, next) => {
  try {
    const message = await Message.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!message) return res.status(404).json({ message: 'Mensaje no encontrado' });
    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      ...(await conversationScope(req.user)),
      archivedAt: null
    });
    if (!conversation) return res.status(404).json({ message: 'Conversacion no encontrada' });
    if (!message.media?.providerMediaId && !message.media?.externalMediaId) {
      return res.status(400).json({ message: 'El mensaje no tiene providerMediaId' });
    }
    message.media.status = 'pending';
    message.media.error = '';
    await message.save();
    const job = await JobService.enqueue({
      type: 'media.whatsapp.download',
      payload: { messageId: message._id },
      priority: 5,
      companyId: message.companyId,
      distributorId: message.distributorId,
      metadata: { conversationId: conversation._id, messageId: message._id, manualRetry: true }
    });
    res.status(202).json({ status: 'pending', jobId: job._id });
  } catch (error) {
    next(error);
  }
  }
);

export default router;
