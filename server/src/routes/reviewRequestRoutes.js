import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { ReviewRequest } from '../models/ReviewRequest.js';
import { ReputationService } from '../modules/reputation/ReputationService.js';
import { reputationScope } from '../modules/reputation/reputationScope.js';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requireModule('reputation'));
router.use(requireModule('reviews'));

router.get(
  '/',
  requireAnyPermission(
    'review_requests:manage',
    'reputation:read_all',
    'reviews:read_team',
    'reviews:read_assigned'
  ),
  async (req, res, next) => {
    try {
      const filter = await reputationScope(req.user, 'contactId', req.query.companyId);
      if (req.query.status) filter.status = req.query.status;
      res.json(
        await ReviewRequest.find(filter)
          .populate('contactId', 'name email phone assignedTo')
          .populate('requestedBy', 'name role')
          .sort({ createdAt: -1 })
          .limit(500)
      );
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'),
  requireAnyPermission(
    'review_requests:manage',
    'review_requests:create_team',
    'review_requests:create_assigned'
  ),
  async (req, res, next) => {
    try {
      res.status(201).json(
        await ReputationService.createReviewRequest({ actor: req.user, body: req.body })
      );
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id/cancel',
  roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'),
  requireAnyPermission(
    'review_requests:manage',
    'review_requests:create_team',
    'review_requests:create_assigned'
  ),
  async (req, res, next) => {
    try {
      const request = await ReviewRequest.findOne({
        _id: req.params.id,
        ...(await reputationScope(req.user))
      });
      if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
      res.json(await ReputationService.cancelReviewRequest({ actor: req.user, request }));
    } catch (error) {
      next(error);
    }
  }
);

export default router;
