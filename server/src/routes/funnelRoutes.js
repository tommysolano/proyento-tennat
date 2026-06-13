import mongoose from 'mongoose';
import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Funnel } from '../models/Funnel.js';
import { FunnelStep } from '../models/FunnelStep.js';
import { FunnelService } from '../modules/funnels/FunnelService.js';
import { hasUserPermission } from '../core/permissions/permissions.js';

const router = Router();
const stepRouter = Router();

function scope(req) {
  if (req.user.role === 'SUPERADMIN') {
    return req.query.companyId && mongoose.isValidObjectId(req.query.companyId)
      ? { companyId: req.query.companyId }
      : {};
  }
  return { companyId: req.user.companyId };
}

function canReadAttribution(user) {
  return [
    'attribution:read',
    'attribution:read_team',
    'attribution:read_all'
  ].some((permission) => hasUserPermission(user, permission));
}

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN', 'ADMIN', 'SUPERVISOR'));
router.use(requireModule('funnels'));

router.get(
  '/',
  requireAnyPermission('funnels:manage', 'funnels:read_team', 'funnels:read_all'),
  async (req, res, next) => {
    try {
      const filter = scope(req);
      if (req.query.status) filter.status = req.query.status;
      let query = Funnel.find(filter).sort({ createdAt: -1 }).limit(500);
      if (!canReadAttribution(req.user)) query = query.select('-attribution');
      res.json(await query);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/', requireAnyPermission('funnels:manage'), async (req, res, next) => {
  try {
    res.status(201).json(await FunnelService.createFunnel({ actor: req.user, body: req.body }));
  } catch (error) {
    next(error);
  }
});

router.get(
  '/:id/steps',
  requireAnyPermission('funnels:manage', 'funnels:read_team', 'funnels:read_all'),
  async (req, res, next) => {
    try {
      const funnel = await Funnel.findOne({ _id: req.params.id, ...scope(req) }).select('_id companyId');
      if (!funnel) return res.status(404).json({ message: 'Funnel no encontrado' });
      let query = FunnelStep.find({ companyId: funnel.companyId, funnelId: funnel._id })
          .populate('landingPageId', 'name slug status')
          .populate('formId', 'name slug status')
          .populate('bookingLinkId', 'title slug status')
          .populate('satisfactionSurveyId', 'name slug status type')
          .sort({ order: 1 });
      if (!canReadAttribution(req.user)) query = query.select('-attribution');
      res.json(await query);
    } catch (error) {
      next(error);
    }
  }
);

router.post('/:id/steps', requireAnyPermission('funnels:manage'), async (req, res, next) => {
  try {
    const funnel = await Funnel.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!funnel) return res.status(404).json({ message: 'Funnel no encontrado' });
    res.status(201).json(
      await FunnelService.createFunnelStep({ actor: req.user, funnel, body: req.body })
    );
  } catch (error) {
    next(error);
  }
});

router.get(
  '/:id/analytics',
  requireAnyPermission('funnels:analytics', 'funnels:read_all'),
  async (req, res, next) => {
    try {
      const funnel = await Funnel.findOne({ _id: req.params.id, ...scope(req) }).select('_id companyId');
      if (!funnel) return res.status(404).json({ message: 'Funnel no encontrado' });
      res.json(await FunnelService.funnelAnalytics(funnel._id, funnel.companyId));
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id',
  requireAnyPermission('funnels:manage', 'funnels:read_team', 'funnels:read_all'),
  async (req, res, next) => {
    try {
      let query = Funnel.findOne({ _id: req.params.id, ...scope(req) });
      if (!canReadAttribution(req.user)) query = query.select('-attribution');
      const funnel = await query;
      if (!funnel) return res.status(404).json({ message: 'Funnel no encontrado' });
      res.json(funnel);
    } catch (error) {
      next(error);
    }
  }
);

router.patch('/:id', requireAnyPermission('funnels:manage'), async (req, res, next) => {
  try {
    const funnel = await Funnel.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!funnel) return res.status(404).json({ message: 'Funnel no encontrado' });
    res.json(await FunnelService.updateFunnel({ actor: req.user, funnel, body: req.body }));
  } catch (error) {
    next(error);
  }
});

function funnelStatus(status) {
  return async (req, res, next) => {
    try {
      const funnel = await Funnel.findOne({ _id: req.params.id, companyId: req.user.companyId });
      if (!funnel) return res.status(404).json({ message: 'Funnel no encontrado' });
      res.json(await FunnelService.setFunnelStatus({ actor: req.user, funnel, status }));
    } catch (error) {
      next(error);
    }
  };
}

router.patch('/:id/publish', requireAnyPermission('funnels:manage'), funnelStatus('published'));
router.patch('/:id/pause', requireAnyPermission('funnels:manage'), funnelStatus('paused'));
router.patch('/:id/archive', requireAnyPermission('funnels:manage'), funnelStatus('archived'));

stepRouter.use(authMiddleware);
stepRouter.use(roleMiddleware('SUPERADMIN', 'ADMIN', 'SUPERVISOR'));
stepRouter.use(requireModule('funnels'));

stepRouter.get(
  '/:id',
  requireAnyPermission('funnels:manage', 'funnels:read_team', 'funnels:read_all'),
  async (req, res, next) => {
    try {
      let query = FunnelStep.findOne({ _id: req.params.id, ...scope(req) });
      if (!canReadAttribution(req.user)) query = query.select('-attribution');
      const step = await query;
      if (!step) return res.status(404).json({ message: 'Step no encontrado' });
      res.json(step);
    } catch (error) {
      next(error);
    }
  }
);

stepRouter.patch('/:id', requireAnyPermission('funnels:manage'), async (req, res, next) => {
  try {
    const step = await FunnelStep.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!step) return res.status(404).json({ message: 'Step no encontrado' });
    res.json(await FunnelService.updateFunnelStep({ actor: req.user, step, body: req.body }));
  } catch (error) {
    next(error);
  }
});

function stepStatus(status) {
  return async (req, res, next) => {
    try {
      const step = await FunnelStep.findOne({ _id: req.params.id, companyId: req.user.companyId });
      if (!step) return res.status(404).json({ message: 'Step no encontrado' });
      res.json(await FunnelService.setStepStatus({ actor: req.user, step, status }));
    } catch (error) {
      next(error);
    }
  };
}

stepRouter.patch('/:id/publish', requireAnyPermission('funnels:manage'), stepStatus('published'));
stepRouter.patch('/:id/archive', requireAnyPermission('funnels:manage'), stepStatus('archived'));

export { stepRouter as funnelStepRoutes };
export default router;
