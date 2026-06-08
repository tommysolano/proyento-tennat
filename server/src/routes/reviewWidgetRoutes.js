import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { ReviewWidget } from '../models/ReviewWidget.js';
import { ReputationService } from '../modules/reputation/ReputationService.js';
import { publicSlug } from '../modules/reputation/reputationSecurity.js';
import { recordActivity } from '../utils/activity.js';

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware('ADMIN'));
router.use(requireModule('reputation'));
router.use(requireModule('reviews'));
router.use(requirePermission('review_widgets:manage'));

router.get('/', async (req, res, next) => {
  try {
    res.json(
      await ReviewWidget.find({ companyId: req.user.companyId })
        .sort({ createdAt: -1 })
        .limit(500)
    );
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await ReputationService.createWidget({ actor: req.user, body: req.body }));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const widget = await ReviewWidget.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!widget) return res.status(404).json({ message: 'Widget no encontrado' });
    for (const field of ['name', 'type', 'settings', 'styling', 'metadata']) {
      if (field in req.body) widget[field] = req.body[field];
    }
    if ('slug' in req.body) widget.slug = publicSlug(req.body.slug);
    await widget.save();
    res.json(widget);
  } catch (error) {
    next(error);
  }
});

function statusAction(status) {
  return async (req, res, next) => {
    try {
      const widget = await ReviewWidget.findOne({ _id: req.params.id, companyId: req.user.companyId });
      if (!widget) return res.status(404).json({ message: 'Widget no encontrado' });
      widget.status = status;
      if (status === 'published') widget.publishedAt = new Date();
      await widget.save();
      await recordActivity({
        user: req.user,
        type: status === 'published' ? 'review_widget_published' : 'review_widget_archived',
        summary: `Widget de resenas ${status}: ${widget.name}`,
        metadata: { reviewWidgetId: widget._id }
      });
      res.json(widget);
    } catch (error) {
      next(error);
    }
  };
}

router.patch('/:id/publish', statusAction('published'));
router.patch('/:id/archive', statusAction('archived'));

export default router;
