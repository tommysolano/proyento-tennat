export const dashboardByRole = {
  SUPERADMIN: '/superadmin',
  DISTRIBUTOR: '/distributor/dashboard',
  ADMIN: '/admin/dashboard',
  SUPERVISOR: '/supervisor/dashboard',
  CALLCENTER: '/callcenter/dashboard'
};

export function getDashboardPath(role) {
  return dashboardByRole[role] || '/login';
}
