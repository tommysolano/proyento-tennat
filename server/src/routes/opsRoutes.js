import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Job } from '../models/Job.js';
import { sanitize } from '../utils/sanitize.js';

const router = Router();

function jobScope(user) {
  return user.role === 'SUPERADMIN' ? {} : { companyId: user.companyId };
}

function safeJob(job) {
  const value = job.toObject();
  delete value.payload;
  value.metadata = sanitize(value.metadata);
  value.error = sanitize(value.error);
  return value;
}

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN', 'ADMIN'));
router.use(requireAnyPermission('ops:read_all', 'jobs:read_all', 'ops:read_company', 'jobs:read_company'));

router.get('/jobs', async (req, res, next) => {
  try {
    const filter = jobScope(req.user);
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.createdFrom || req.query.createdTo) {
      filter.createdAt = {};
      if (req.query.createdFrom) filter.createdAt.$gte = new Date(req.query.createdFrom);
      if (req.query.createdTo) filter.createdAt.$lte = new Date(req.query.createdTo);
    }
    const jobs = await Job.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json(jobs.map(safeJob));
  } catch (error) {
    next(error);
  }
});

router.get('/jobs/:id', async (req, res, next) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, ...jobScope(req.user) });
    if (!job) return res.status(404).json({ message: 'Job no encontrado' });
    res.json(safeJob(job));
  } catch (error) {
    next(error);
  }
});

export default router;
