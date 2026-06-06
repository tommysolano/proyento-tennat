import { teamMemberIds } from '../../utils/crmScope.js';

export async function conversationScope(user) {
  if (user.role === 'ADMIN') return { companyId: user.companyId };
  if (user.role === 'SUPERVISOR') {
    return {
      companyId: user.companyId,
      assignedTo: { $in: await teamMemberIds(user) }
    };
  }
  if (user.role === 'CALLCENTER') {
    return { companyId: user.companyId, assignedTo: user._id };
  }
  return { _id: null };
}

export function preserveAssignedScope(filter, requestedId) {
  if (!requestedId) return filter;
  const requested = String(requestedId);
  const current = filter.assignedTo;
  const allowed =
    !current ||
    current.toString?.() === requested ||
    current.$in?.some((id) => id.toString() === requested);
  filter.assignedTo = allowed ? requested : { $in: [] };
  return filter;
}
