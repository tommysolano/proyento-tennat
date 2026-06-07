import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Job } from '../models/Job.js';
import { sanitize } from '../utils/sanitize.js';
import { JobService } from '../modules/jobs/JobService.js';
import { OperationalAlert } from '../models/OperationalAlert.js';
import { recordActivity } from '../utils/activity.js';
import { logger } from '../utils/logger.js';

const router = Router();

function jobScope(user) {
  return user.role === 'SUPERADMIN' ? {} : { companyId: user.companyId };
}

const COMPANY_REPLAY_TYPES = new Set([
  'message.whatsapp.send',
  'media.whatsapp.download'
]);

function canReplayJob(user, job) {
  return user.role === 'SUPERADMIN' || COMPANY_REPLAY_TYPES.has(job.type);
}

function safeJob(job, user) {
  const value = job.toObject();
  delete value.payload;
  value.metadata = sanitize(value.metadata);
  value.error = sanitize(value.error);
  value.replayAllowed =
    ['failed', 'dead'].includes(value.status) && canReplayJob(user, value);
  return value;
}

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN', 'ADMIN'));

router.get(
  '/jobs',
  requireAnyPermission('ops:read_all', 'jobs:read_all', 'ops:read_company', 'jobs:read_company'),
  async (req, res, next) => {
  try {
    const filter = jobScope(req.user);
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.createdFrom || req.query.createdTo) {
      filter.createdAt = {};
      if (req.query.createdFrom) filter.createdAt.$gte = new Date(req.query.createdFrom);
      if (req.query.createdTo) filter.createdAt.$lte = new Date(req.query.createdTo);
    }
    const jobs = await Job.find(filter)
      .populate('companyId', 'name status')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(jobs.map((job) => safeJob(job, req.user)));
  } catch (error) {
    next(error);
  }
  }
);

router.get(
  '/jobs/:id',
  requireAnyPermission('ops:read_all', 'jobs:read_all', 'ops:read_company', 'jobs:read_company'),
  async (req, res, next) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, ...jobScope(req.user) });
    if (!job) return res.status(404).json({ message: 'Job no encontrado' });
    res.json(safeJob(job, req.user));
  } catch (error) {
    next(error);
  }
  }
);

router.post(
  '/jobs/:id/replay',
  requireAnyPermission('jobs:replay_all', 'jobs:replay_company'),
  async (req, res, next) => {
    try {
      const original = await Job.findOne({
        _id: req.params.id,
        ...jobScope(req.user),
        status: { $in: ['failed', 'dead'] }
      }).select('+payload');
      if (!original) {
        return res.status(404).json({ message: 'Job fallido no encontrado' });
      }
      if (!canReplayJob(req.user, original)) {
        return res.status(403).json({
          message: 'ADMIN no puede replay jobs con payload de proveedor'
        });
      }
      const replay = await JobService.enqueue({
        type: original.type,
        payload: original.payload,
        priority: original.priority,
        runAt: new Date(),
        maxAttempts: original.maxAttempts,
        companyId: original.companyId,
        distributorId: original.distributorId,
        metadata: {
          ...(original.metadata || {}),
          replayedFrom: original._id,
          replayedAt: new Date(),
          replayedBy: req.user._id
        }
      });
      await recordActivity({
        user: req.user,
        companyId: original.companyId,
        distributorId: original.distributorId,
        type: 'job_replayed',
        summary: `Job ${original.type} reenviado`,
        metadata: { originalJobId: original._id, replayJobId: replay._id }
      });
      logger.info('job.replayed', {
        originalJobId: original._id,
        replayJobId: replay._id,
        type: original.type,
        companyId: original.companyId,
        userId: req.user._id
      });
      res.status(201).json(safeJob(replay, req.user));
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/alerts',
  requireAnyPermission('alerts:read_all', 'alerts:read_company'),
  async (req, res, next) => {
    try {
      const filter = req.user.role === 'SUPERADMIN' ? {} : { companyId: req.user.companyId };
      if (req.query.status) filter.status = req.query.status;
      if (req.query.severity) filter.severity = req.query.severity;
      if (req.query.type) filter.type = req.query.type;
      const alerts = await OperationalAlert.find(filter)
        .populate('companyId', 'name status')
        .populate('acknowledgedBy', 'name email role')
        .sort({ createdAt: -1 })
        .limit(200);
      res.json(alerts);
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/alerts/:id/acknowledge',
  requireAnyPermission('alerts:ack_all', 'alerts:ack_company'),
  async (req, res, next) => {
    try {
      const filter = {
        _id: req.params.id,
        ...(req.user.role === 'SUPERADMIN' ? {} : { companyId: req.user.companyId })
      };
      const alert = await OperationalAlert.findOneAndUpdate(
        filter,
        {
          $set: {
            status: 'acknowledged',
            acknowledgedBy: req.user._id,
            acknowledgedAt: new Date()
          }
        },
        { new: true }
      );
      if (!alert) return res.status(404).json({ message: 'Alerta no encontrada' });
      await recordActivity({
        user: req.user,
        companyId: alert.companyId,
        distributorId: alert.distributorId,
        type: 'operational_alert_acknowledged',
        summary: `Alerta reconocida: ${alert.title}`,
        metadata: { alertId: alert._id, alertType: alert.type }
      });
      res.json(alert);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
