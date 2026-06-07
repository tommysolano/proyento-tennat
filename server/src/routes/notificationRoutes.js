import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Notification } from '../models/Notification.js';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requirePermission('notifications:read'));
router.use(requireModule('notifications'));

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const filter = { userId: req.user._id, companyId: req.user.companyId };
    if (req.query.unread === 'true') filter.readAt = null;
    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit),
      Notification.countDocuments({
        userId: req.user._id,
        companyId: req.user.companyId,
        readAt: null
      })
    ]);
    res.json({ notifications, unreadCount });
  } catch (error) {
    next(error);
  }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user._id, companyId: req.user.companyId, readAt: null },
      { $set: { readAt: new Date() } }
    );
    res.json({ updated: result.modifiedCount });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user._id,
        companyId: req.user.companyId
      },
      { $set: { readAt: new Date() } },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: 'Notificacion no encontrada' });
    }
    res.json(notification);
  } catch (error) {
    next(error);
  }
});

export default router;
