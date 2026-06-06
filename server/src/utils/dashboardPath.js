export const dashboardByRole = {
  DISTRIBUTOR: '/distributor/dashboard',
  ADMIN: '/admin/dashboard',
  SUPERVISOR: '/supervisor/dashboard',
  CALLCENTER: '/callcenter/dashboard'
};

export function getDashboardPath(role) {
  return dashboardByRole[role] || '/login';
}
