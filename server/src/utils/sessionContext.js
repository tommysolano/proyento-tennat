import { Company } from '../models/Company.js';
import { Distributor } from '../models/Distributor.js';
import { ROLE_PERMISSIONS } from '../core/permissions/permissions.js';
import {
  filterPermissionsByModules,
  permissionsAllowedForRole
} from '../core/permissions/permissionTemplates.js';
import { getUserAuthorizedModules } from '../core/modules/moduleAccess.js';

export async function buildSessionTenant(user) {
  const [distributor, company] = await Promise.all([
    user.distributorId
      ? Distributor.findById(user.distributorId)
          .select('name slug status branding customDomain settings billingSettings onboarding')
          .lean()
      : null,
    user.companyId
      ? Company.findById(user.companyId)
          .select('name status industry taxId settings onboarding distributorId')
          .lean()
      : null
  ]);

  return { distributor, company };
}

export async function buildSessionAccess(user) {
  const modules = await getUserAuthorizedModules(user);
  const rolePermissions = ROLE_PERMISSIONS[user.role] || [];
  const configuredPermissions = Array.isArray(user.permissions)
    ? permissionsAllowedForRole(user.role, user.permissions)
    : rolePermissions;
  const permissions =
    user.role === 'SUPERADMIN'
      ? rolePermissions
      : filterPermissionsByModules(configuredPermissions, modules);

  return { permissions, modules };
}
