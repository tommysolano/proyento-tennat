import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Coupon } from '../models/Coupon.js';
import { CouponRedemption } from '../models/CouponRedemption.js';
import { LoyaltyService } from '../modules/loyalty/LoyaltyService.js';
import { reputationScope } from '../modules/reputation/reputationScope.js';

const router = Router();
const redemptionRouter = Router();

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requireModule('loyalty'));
router.use(requireModule('coupons'));

router.get(
  '/',
  requireAnyPermission('coupons:manage', 'coupons:issue_team', 'coupons:issue_assigned'),
  async (req, res, next) => {
    try {
      const filter = { companyId: req.user.companyId };
      if (req.query.status) filter.status = req.query.status;
      res.json(await Coupon.find(filter).sort({ createdAt: -1 }).limit(500));
    } catch (error) {
      next(error);
    }
  }
);

router.post('/', requireAnyPermission('coupons:manage'), async (req, res, next) => {
  try {
    res.status(201).json(await LoyaltyService.createCoupon({ actor: req.user, body: req.body }));
  } catch (error) {
    next(error);
  }
});

router.get(
  '/:id',
  requireAnyPermission('coupons:manage', 'coupons:issue_team', 'coupons:issue_assigned'),
  async (req, res, next) => {
    try {
      const coupon = await Coupon.findOne({ _id: req.params.id, companyId: req.user.companyId });
      if (!coupon) return res.status(404).json({ message: 'Cupon no encontrado' });
      res.json(coupon);
    } catch (error) {
      next(error);
    }
  }
);

router.patch('/:id', requireAnyPermission('coupons:manage'), async (req, res, next) => {
  try {
    const coupon = await Coupon.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!coupon) return res.status(404).json({ message: 'Cupon no encontrado' });
    for (const field of [
      'code', 'name', 'description', 'discountType', 'discountValue', 'currency',
      'startsAt', 'expiresAt', 'maxRedemptions', 'perContactLimit', 'applicableTo', 'metadata'
    ]) {
      if (field in req.body) coupon[field] = req.body[field];
    }
    await coupon.save();
    res.json(coupon);
  } catch (error) {
    next(error);
  }
});

function couponStatus(status) {
  return async (req, res, next) => {
    try {
      const coupon = await Coupon.findOne({ _id: req.params.id, companyId: req.user.companyId });
      if (!coupon) return res.status(404).json({ message: 'Cupon no encontrado' });
      coupon.status = status;
      await coupon.save();
      res.json(coupon);
    } catch (error) {
      next(error);
    }
  };
}

router.patch('/:id/activate', requireAnyPermission('coupons:manage'), couponStatus('active'));
router.patch('/:id/disable', requireAnyPermission('coupons:manage'), couponStatus('disabled'));
router.patch('/:id/archive', requireAnyPermission('coupons:manage'), couponStatus('archived'));

router.post(
  '/:id/issue',
  requireAnyPermission('coupons:manage', 'coupons:issue_team', 'coupons:issue_assigned'),
  async (req, res, next) => {
    try {
      const coupon = await Coupon.findOne({ _id: req.params.id, companyId: req.user.companyId });
      if (!coupon) return res.status(404).json({ message: 'Cupon no encontrado' });
      res.status(201).json(
        await LoyaltyService.issueCoupon({
          actor: req.user,
          coupon,
          contactId: req.body.contactId,
          source: req.body.source,
          metadata: req.body.metadata
        })
      );
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/:id/redeem',
  requireAnyPermission('coupons:manage', 'coupons:issue_team', 'coupons:issue_assigned'),
  async (req, res, next) => {
    try {
      const coupon = await Coupon.findOne({ _id: req.params.id, companyId: req.user.companyId });
      if (!coupon) return res.status(404).json({ message: 'Cupon no encontrado' });
      res.json(
        await LoyaltyService.redeemCoupon({
          actor: req.user,
          coupon,
          contactId: req.body.contactId,
          redemptionId: req.body.redemptionId,
          metadata: req.body.metadata
        })
      );
    } catch (error) {
      next(error);
    }
  }
);

redemptionRouter.use(authMiddleware);
redemptionRouter.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
redemptionRouter.use(requireModule('loyalty'));
redemptionRouter.use(requireModule('coupons'));
redemptionRouter.get(
  '/',
  requireAnyPermission('coupons:manage', 'coupons:issue_team', 'coupons:issue_assigned'),
  async (req, res, next) => {
    try {
      const filter = await reputationScope(req.user);
      if (req.query.status) filter.status = req.query.status;
      if (req.query.couponId) filter.couponId = req.query.couponId;
      res.json(
        await CouponRedemption.find(filter)
          .populate('couponId', 'name code status')
          .populate('contactId', 'name email phone assignedTo')
          .populate('redeemedBy', 'name role')
          .sort({ createdAt: -1 })
          .limit(1000)
      );
    } catch (error) {
      next(error);
    }
  }
);

export { redemptionRouter as couponRedemptionRoutes };
export default router;
