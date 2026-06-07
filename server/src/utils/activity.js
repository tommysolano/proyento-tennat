import { ActivityLog } from '../models/ActivityLog.js';
import { sanitize } from './sanitize.js';

export async function recordActivity({
  user,
  type,
  summary,
  companyId = null,
  distributorId = null,
  metadata = {}
}) {
  return ActivityLog.create({
    companyId: companyId || user.companyId || null,
    distributorId: distributorId || user.distributorId || null,
    userId: user._id,
    type,
    summary: sanitize(summary),
    metadata: sanitize(metadata)
  });
}
