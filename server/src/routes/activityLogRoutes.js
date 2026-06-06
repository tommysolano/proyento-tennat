import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { ActivityLog } from '../models/ActivityLog.js';

const router = Router();

function activityScope(user) {
  if (user.role === 'SUPERADMIN') {
    return {};
  }
  if (user.role === 'DISTRIBUTOR') {
    return { distributorId: user.distributorId };
  }
  if (user.role === 'CALLCENTER') {
    return { companyId: user.companyId, userId: user._id };
  }
  return { companyId: user.companyId };
}

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const activities = await ActivityLog.find(activityScope(req.user))
      .populate('companyId', 'name')
      .populate('distributorId', 'name')
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(activities);
  } catch (error) {
    next(error);
  }
});

export default router;
