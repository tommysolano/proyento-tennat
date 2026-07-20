import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ROLE_MINIMUM_PERMISSIONS,
  ROLE_PERMISSIONS,
  defaultPermissionsForRole,
  hasUserPermission
} from '../src/core/permissions/permissions.js';
import { planRepair } from '../scripts/repairInternalPermissions.js';

test('los defaults de SUPERVISOR/CALLCENTER incluyen la lectura de su dominio diario', () => {
  // El bug reportado: SUPERVISOR sin opportunities:read_team. El catalogo debe
  // traerlo por defecto (y el analogo _assigned para CALLCENTER).
  const supDaily = [
    'contacts:read_team',
    'opportunities:read_team',
    'conversations:read_team',
    'appointments:read_team',
    'calendars:read_team',
    'tasks:update_team'
  ];
  for (const permission of supDaily) {
    assert.equal(ROLE_PERMISSIONS.SUPERVISOR.includes(permission), true, `SUPERVISOR falta ${permission}`);
  }
  const ccDaily = [
    'contacts:read_assigned',
    'opportunities:read_assigned',
    'conversations:read_assigned',
    'appointments:read_assigned',
    'calendars:read_assigned'
  ];
  for (const permission of ccDaily) {
    assert.equal(ROLE_PERMISSIONS.CALLCENTER.includes(permission), true, `CALLCENTER falta ${permission}`);
  }
});

test('un usuario sin array de permisos usa los defaults completos del rol', () => {
  // Asi quedan los usuarios creados por el endpoint del ADMIN (permissions
  // ausente): heredan todos los permisos del rol, incluido opportunities:read_team.
  const supervisor = { role: 'SUPERVISOR' }; // sin campo permissions
  assert.equal(hasUserPermission(supervisor, 'opportunities:read_team'), true);
  assert.equal(hasUserPermission(supervisor, 'contacts:read_team'), true);

  const agent = { role: 'CALLCENTER' };
  assert.equal(hasUserPermission(agent, 'opportunities:read_assigned'), true);
});

test('un array persistido incompleto restringe (reproduce el bug reportado)', () => {
  const supervisor = { role: 'SUPERVISOR', permissions: ['contacts:read_team'] };
  assert.equal(hasUserPermission(supervisor, 'opportunities:read_team'), false);
});

test('el minimo del rol es la familia de lectura (no incluye escritura/gestion)', () => {
  assert.equal(ROLE_MINIMUM_PERMISSIONS.SUPERVISOR.includes('opportunities:read_team'), true);
  assert.equal(ROLE_MINIMUM_PERMISSIONS.SUPERVISOR.includes('opportunities:update_team'), false);
  assert.equal(ROLE_MINIMUM_PERMISSIONS.CALLCENTER.includes('opportunities:read_assigned'), true);
});

test('planRepair: array vacio -> defaults completos del rol', () => {
  const plan = planRepair({ role: 'SUPERVISOR', permissions: [] });
  assert.deepEqual(plan.permissions, defaultPermissionsForRole('SUPERVISOR'));
});

test('planRepair: array incompleto -> agrega solo el minimo faltante, sin quitar nada', () => {
  const custom = ['contacts:read_team', 'algo:personalizado'];
  const plan = planRepair({ role: 'SUPERVISOR', permissions: custom });
  assert.notEqual(plan, null);
  // Conserva lo que ya tenia (incluida una personalizacion) y suma el minimo.
  assert.equal(plan.permissions.includes('algo:personalizado'), true);
  assert.equal(plan.permissions.includes('contacts:read_team'), true);
  assert.equal(plan.permissions.includes('opportunities:read_team'), true);
});

test('planRepair: array ya completo o permissions ausente -> no toca nada (idempotente)', () => {
  const complete = { role: 'SUPERVISOR', permissions: [...ROLE_MINIMUM_PERMISSIONS.SUPERVISOR, 'extra'] };
  assert.equal(planRepair(complete), null);
  assert.equal(planRepair({ role: 'SUPERVISOR' }), null); // undefined = defaults dinamicos
  assert.equal(planRepair({ role: 'ADMIN', permissions: [] }), null); // rol sin minimo
});

test('PERMISSIONS.md documenta los defaults de lectura de SUPERVISOR y CALLCENTER', () => {
  const doc = readFileSync(new URL('../../PERMISSIONS.md', import.meta.url), 'utf8');
  assert.match(doc, /opportunities:read_team/);
  assert.match(doc, /opportunities:read_assigned/);
});
