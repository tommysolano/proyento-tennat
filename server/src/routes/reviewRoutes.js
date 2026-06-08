import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Review } from '../models/Review.js';
import { ReputationService } from '../modules/reputation/ReputationService.js';
import { reputationScope } from '../modules/reputation/reputationScope.js';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requireModule('reputation'));
router.use(requireModule('reviews'));

router.get(
  '/',
  requireAnyPermission('reviews:manage', 'reviews:read_team', 'reviews:read_assigned', 'reputation:read_all'),
  async (req, res, next) => {
    try {
      const filter = await reputationScope(req.user, 'contactId', req.query.companyId);
      for (const field of ['status', 'source', 'sentiment']) {
        if (req.query[field]) filter[field] = req.query[field];
      }
      if (req.query.rating) filter.rating = Number(req.query.rating);
      res.json(
        await Review.find(filter)
          .populate('contactId', 'name email phone assignedTo')
          .populate('reviewRequestId', 'status publicUrl')
          .populate('respondedBy', 'name role')
          .sort({ createdAt: -1 })
          .limit(500)
      );
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id',
  requireAnyPermission('reviews:manage', 'reviews:read_team', 'reviews:read_assigned', 'reputation:read_all'),
  async (req, res, next) => {
    try {
      const review = await Review.findOne({
        _id: req.params.id,
        ...(await reputationScope(req.user, 'contactId', req.query.companyId))
      })
        .populate('contactId', 'name email phone assignedTo')
        .populate('reviewRequestId');
      if (!review) return res.status(404).json({ message: 'Resena no encontrada' });
      res.json(review);
    } catch (error) {
      next(error);
    }
  }
);

function transition(method) {
  return async (req, res, next) => {
    try {
      const review = await Review.findOne({ _id: req.params.id, companyId: req.user.companyId });
      if (!review) return res.status(404).json({ message: 'Resena no encontrada' });
      res.json(await ReputationService[method]({ actor: req.user, review }));
    } catch (error) {
      next(error);
    }
  };
}

router.patch('/:id/approve', roleMiddleware('ADMIN'), requireAnyPermission('reviews:manage'), transition('approveReview'));
router.patch('/:id/reject', roleMiddleware('ADMIN'), requireAnyPermission('reviews:manage'), transition('rejectReview'));
router.patch('/:id/publish', roleMiddleware('ADMIN'), requireAnyPermission('reviews:manage'), transition('publishReview'));
router.patch('/:id/archive', roleMiddleware('ADMIN'), requireAnyPermission('reviews:manage'), transition('archiveReview'));
router.post('/:id/respond', roleMiddleware('ADMIN'), requireAnyPermission('reviews:manage'), async (req, res, next) => {
  try {
    const review = await Review.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!review) return res.status(404).json({ message: 'Resena no encontrada' });
    res.json(
      await ReputationService.respondToReview({
        actor: req.user,
        review,
        responseText: req.body.responseText
      })
    );
  } catch (error) {
    next(error);
  }
});

export default router;
