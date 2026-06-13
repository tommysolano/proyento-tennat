import mongoose from 'mongoose';
import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { LandingPage } from '../models/LandingPage.js';
import { FunnelService } from '../modules/funnels/FunnelService.js';
import { hasUserPermission } from '../core/permissions/permissions.js';

const router = Router();

function scope(req) {
  if (req.user.role === 'SUPERADMIN') {
    return req.query.companyId && mongoose.isValidObjectId(req.query.companyId)
      ? { companyId: req.query.companyId }
      : {};
  }
  return { companyId: req.user.companyId };
}

function canReadAttribution(user) {
  return ['attribution:read', 'attribution:read_all'].some((permission) =>
    hasUserPermission(user, permission)
  );
}

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN', 'ADMIN'));
router.use(requireModule('landing_pages'));

router.get(
  '/',
  requireAnyPermission('landing_pages:manage', 'landing_pages:read_all'),
  async (req, res, next) => {
    try {
      const filter = scope(req);
      if (req.query.status) filter.status = req.query.status;
      let query = LandingPage.find(filter).sort({ createdAt: -1 }).limit(500);
      if (!canReadAttribution(req.user)) query = query.select('-attribution');
      res.json(await query);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/', requireAnyPermission('landing_pages:manage'), async (req, res, next) => {
  try {
    res.status(201).json(
      await FunnelService.createLandingPage({ actor: req.user, body: req.body })
    );
  } catch (error) {
    next(error);
  }
});

router.get(
  '/:id/analytics',
  requireAnyPermission('landing_pages:analytics', 'landing_pages:read_all'),
  async (req, res, next) => {
    try {
      const page = await LandingPage.findOne({ _id: req.params.id, ...scope(req) }).select('_id companyId');
      if (!page) return res.status(404).json({ message: 'Landing page no encontrada' });
      res.json(await FunnelService.landingAnalytics(page._id, page.companyId));
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id',
  requireAnyPermission('landing_pages:manage', 'landing_pages:read_all'),
  async (req, res, next) => {
    try {
      let query = LandingPage.findOne({ _id: req.params.id, ...scope(req) })
        .populate('settings.associatedFormId', 'name slug status')
        .populate('settings.associatedBookingLinkId', 'title slug status publicEnabled');
      if (!canReadAttribution(req.user)) query = query.select('-attribution');
      const page = await query;
      if (!page) return res.status(404).json({ message: 'Landing page no encontrada' });
      res.json(page);
    } catch (error) {
      next(error);
    }
  }
);

router.patch('/:id', requireAnyPermission('landing_pages:manage'), async (req, res, next) => {
  try {
    const page = await LandingPage.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!page) return res.status(404).json({ message: 'Landing page no encontrada' });
    res.json(await FunnelService.updateLandingPage({ actor: req.user, page, body: req.body }));
  } catch (error) {
    next(error);
  }
});

function statusAction(status) {
  return async (req, res, next) => {
    try {
      const page = await LandingPage.findOne({ _id: req.params.id, companyId: req.user.companyId });
      if (!page) return res.status(404).json({ message: 'Landing page no encontrada' });
      res.json(await FunnelService.setLandingStatus({ actor: req.user, page, status }));
    } catch (error) {
      next(error);
    }
  };
}

router.patch('/:id/publish', requireAnyPermission('landing_pages:manage'), statusAction('published'));
router.patch('/:id/pause', requireAnyPermission('landing_pages:manage'), statusAction('paused'));
router.patch('/:id/archive', requireAnyPermission('landing_pages:manage'), statusAction('archived'));

export default router;
