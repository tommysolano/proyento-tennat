import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { CouponRedemption } from '../models/CouponRedemption.js';
import { Referral } from '../models/Referral.js';
import { Review } from '../models/Review.js';
import { ReviewRequest } from '../models/ReviewRequest.js';
import { LoyaltyService } from '../modules/loyalty/LoyaltyService.js';
import { ReputationService } from '../modules/reputation/ReputationService.js';
import { reputationScope } from '../modules/reputation/reputationScope.js';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requireModule('reputation'));

router.get(
  '/overview',
  requireAnyPermission(
    'reputation:manage',
    'reputation:analytics',
    'reputation:read_all',
    'reviews:read_team',
    'reviews:read_assigned'
  ),
  async (req, res, next) => {
    try {
      const companyId = req.user.role === 'SUPERADMIN'
        ? req.query.companyId || null
        : req.user.companyId;
      const scope = await reputationScope(req.user, 'contactId', companyId);
      const [reputation, loyalty, recentReviews, pendingRequests] = await Promise.all([
        ReputationService.calculateReputationMetrics(companyId, scope, {
          includeSurveyMetrics: ['SUPERADMIN', 'ADMIN'].includes(req.user.role)
        }),
        LoyaltyService.calculateLoyaltyMetrics(companyId, scope),
        Review.find(scope)
          .populate('contactId', 'name')
          .sort({ createdAt: -1 })
          .limit(8),
        ReviewRequest.find(scope)
          .populate('contactId', 'name')
          .sort({ createdAt: -1 })
          .limit(8)
      ]);
      res.json({ ...reputation, ...loyalty, recentReviews, pendingRequests });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/contacts/:contactId',
  requireAnyPermission(
    'reputation:manage',
    'reputation:read_all',
    'reviews:read_team',
    'reviews:read_assigned',
    'review_requests:create_team',
    'review_requests:create_assigned'
  ),
  async (req, res, next) => {
    try {
      const scope = await reputationScope(req.user, 'contactId', req.query.companyId);
      const contactId = req.params.contactId;
      if (scope.contactId && !scope.contactId.$in.some((id) => String(id) === contactId)) {
        return res.status(404).json({ message: 'Contacto no encontrado' });
      }
      const filter = {
        ...(req.user.role === 'SUPERADMIN' ? {} : { companyId: req.user.companyId }),
        contactId
      };
      const [reviews, reviewRequests, couponRedemptions, referrals] = await Promise.all([
        Review.find(filter).sort({ createdAt: -1 }).limit(50),
        ReviewRequest.find(filter).sort({ createdAt: -1 }).limit(50),
        CouponRedemption.find(filter).populate('couponId', 'name code status').sort({ createdAt: -1 }).limit(50),
        Referral.find({
          ...(req.user.role === 'SUPERADMIN' ? {} : { companyId: req.user.companyId }),
          $or: [{ referrerContactId: contactId }, { referredContactId: contactId }]
        })
          .populate('referralProgramId', 'name slug status')
          .sort({ createdAt: -1 })
          .limit(50)
      ]);
      res.json({ reviews, reviewRequests, couponRedemptions, referrals });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
