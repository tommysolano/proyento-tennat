import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { teamMemberIds } from '../utils/crmScope.js';

const router = Router();

async function activityScope(user) {
  if (user.role === 'SUPERADMIN') {
    return {};
  }
  if (user.role === 'DISTRIBUTOR') {
    return { distributorId: user.distributorId };
  }
  if (user.role === 'CALLCENTER') {
    return { companyId: user.companyId, userId: user._id };
  }
  if (user.role === 'SUPERVISOR') {
    return { companyId: user.companyId, userId: { $in: await teamMemberIds(user) } };
  }
  return { companyId: user.companyId };
}

router.use(authMiddleware);

router.get(
  '/',
  requireAnyPermission(
    'audit:read_all',
    'activity:read_distributor',
    'activity:read',
    'activity:read_team',
    'activity:read_self'
  ),
  async (req, res, next) => {
    try {
      const activities = await ActivityLog.find(await activityScope(req.user))
        .populate('companyId', 'name')
        .populate('distributorId', 'name')
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .limit(100);
      res.json(activities);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
