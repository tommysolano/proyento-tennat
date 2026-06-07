import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { WorkflowRun } from '../models/WorkflowRun.js';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN', 'ADMIN', 'SUPERVISOR'));
router.use(requireModule('automations'));
router.use(requireModule('workflows'));
router.use(
  requireAnyPermission(
    'workflow_runs:read',
    'workflow_runs:read_team',
    'workflow_runs:read_all'
  )
);

function scope(req) {
  if (req.user.role === 'SUPERADMIN') {
    return req.query.companyId ? { companyId: req.query.companyId } : {};
  }
  return { companyId: req.user.companyId };
}

router.get('/', async (req, res, next) => {
  try {
    const filter = scope(req);
    for (const field of ['workflowId', 'status', 'eventType', 'entityType']) {
      if (req.query[field]) filter[field] = req.query[field];
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    res.json(
      await WorkflowRun.find(filter)
        .populate('workflowId', 'name status trigger version')
        .populate('actorUserId', 'name email role')
        .sort({ createdAt: -1 })
        .limit(limit)
    );
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const run = await WorkflowRun.findOne({ _id: req.params.id, ...scope(req) })
      .populate('workflowId', 'name status trigger version')
      .populate('actorUserId', 'name email role');
    if (!run) return res.status(404).json({ message: 'Ejecucion no encontrada' });
    res.json(run);
  } catch (error) {
    next(error);
  }
});

export default router;
