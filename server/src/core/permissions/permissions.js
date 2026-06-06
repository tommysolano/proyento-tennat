export const ROLE_PERMISSIONS = {
  SUPERADMIN: [
    'platform:manage',
    'distributors:manage',
    'platform_plans:manage',
    'platform_subscriptions:manage',
    'platform_billing:manage',
    'modules:manage',
    'impersonation:manage',
    'audit:read_all'
  ],
  DISTRIBUTOR: [
    'companies:manage',
    'distributor_plans:manage',
    'company_subscriptions:manage',
    'distributor_billing:read',
    'distributor_billing:manage',
    'company_invoices:manage',
    'company_payments:manage',
    'distributor_settings:manage',
    'distributor_branding:manage',
    'companies:suspend',
    'modules:read',
    'impersonation:start_admin'
  ],
  ADMIN: [
    'users:manage',
    'contacts:manage',
    'contacts:assign',
    'activity:read',
    'company_billing:read',
    'company_settings:read',
    'company_onboarding:update'
  ],
  SUPERVISOR: [
    'contacts:read_team',
    'contacts:update_team',
    'contacts:assign_team',
    'activity:read_team'
  ],
  CALLCENTER: [
    'contacts:read_assigned',
    'contacts:update_assigned',
    'contacts:notes',
    'contacts:followup'
  ]
};

export function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) || false;
}
