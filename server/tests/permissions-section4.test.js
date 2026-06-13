import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  filterPermissionsByModules,
  getPermissionTemplate,
  permissionsAllowedForRole
} from '../src/core/permissions/permissionTemplates.js';
import { hasUserPermission } from '../src/core/permissions/permissions.js';

test('custom permissions only reduce the base role and never elevate it', () => {
  const callcenter = {
    role: 'CALLCENTER',
    permissions: ['conversations:read_assigned', 'company_billing:read']
  };
  assert.equal(hasUserPermission(callcenter, 'conversations:read_assigned'), true);
  assert.equal(hasUserPermission(callcenter, 'company_billing:read'), false);
  assert.equal(hasUserPermission(callcenter, 'conversations:send_assigned'), false);
  assert.equal(
    hasUserPermission({ role: 'SUPERVISOR' }, 'company_billing:read'),
    false
  );
});

test('permission templates are constrained by target role and contracted modules', () => {
  const template = getPermissionTemplate('supervisor_commercial');
  const rolePermissions = permissionsAllowedForRole(
    'SUPERVISOR',
    template.permissions
  );
  const permissions = filterPermissionsByModules(rolePermissions, [
    'core',
    'crm',
    'contacts',
    'opportunities',
    'tasks'
  ]);

  assert.equal(permissions.includes('contacts:read_team'), true);
  assert.equal(permissions.includes('opportunities:read_team'), true);
  assert.equal(permissions.includes('conversations:read_team'), false);
  assert.equal(permissions.includes('company_billing:read'), false);
});

test('permission and impersonation routes keep tenant and privilege boundaries', () => {
  const users = readFileSync(
    new URL('../src/routes/userRoutes.js', import.meta.url),
    'utf8'
  );
  const auth = readFileSync(
    new URL('../src/routes/authRoutes.js', import.meta.url),
    'utf8'
  );
  const authMiddleware = readFileSync(
    new URL('../src/middleware/authMiddleware.js', import.meta.url),
    'utf8'
  );
  const subscriptions = readFileSync(
    new URL('../src/routes/subscriptionRoutes.js', import.meta.url),
    'utf8'
  );

  assert.match(users, /companyId: req\.user\.companyId/);
  assert.match(users, /role: \{ \$in: INTERNAL_ROLES \}/);
  assert.match(users, /No puedes editar tus propios permisos/);
  assert.match(auth, /distributorId: req\.user\.distributorId/);
  assert.match(auth, /signToken\(targetUser, \{ impersonatedBy \}, '30m'\)/);
  assert.match(auth, /Company\.updateOne/);
  assert.match(authMiddleware, /La empresa no pertenece al distribuidor delegado/);
  assert.match(subscriptions, /assertDistributorModulesAuthorized/);
});
