import { Calendar } from '../../models/Calendar.js';
import { teamMemberIds } from '../../utils/crmScope.js';

export async function calendarScope(user) {
  if (user.role === 'ADMIN') return { companyId: user.companyId };
  if (user.role === 'SUPERVISOR') {
    const ids = await teamMemberIds(user);
    return {
      companyId: user.companyId,
      $or: [{ ownerUserId: { $in: ids } }, { teamUserIds: { $in: ids } }]
    };
  }
  if (user.role === 'CALLCENTER') {
    return {
      companyId: user.companyId,
      $or: [{ ownerUserId: user._id }, { teamUserIds: user._id }]
    };
  }
  return { _id: null };
}

export function populateCalendar(query) {
  return query.populate(
    'ownerUserId teamUserIds createdBy updatedBy',
    'name email role supervisorId'
  );
}

export async function findScopedCalendar(user, calendarId, extra = {}) {
  return populateCalendar(
    Calendar.findOne({
      _id: calendarId,
      ...(await calendarScope(user)),
      ...extra
    })
  );
}
