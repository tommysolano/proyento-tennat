import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { ConversationService } from '../modules/conversations/ConversationService.js';
import { conversationScope } from '../modules/conversations/conversationScope.js';

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(
  requireAnyPermission(
    'conversations:send',
    'conversations:send_team',
    'conversations:send_assigned'
  )
);
router.use(requireModule('conversations'));
router.use(requireModule('inbox'));

router.post('/:id/retry', async (req, res, next) => {
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
    const retried = await ConversationService.createOutboundMessage({
      user: req.user,
      conversation,
      text: original.text,
      type: original.type,
      media: original.media
    });
    retried.metadata = { ...(retried.metadata || {}), retryOf: original._id };
    await retried.save();
    res.status(201).json(await retried.populate('sentBy', 'name email role'));
  } catch (error) {
    next(error);
  }
});

export default router;
