import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canAccessPath } from '../src/utils/access.js';

test('frontend guards hide routes without effective permission or module', () => {
  const access = {
    permissions: ['contacts:read_assigned'],
    modules: ['core', 'crm', 'contacts']
  };
  assert.equal(canAccessPath('/crm/contacts', access), true);
  assert.equal(canAccessPath('/inbox', access), false);
  assert.equal(canAccessPath('/calendar', access), false);
});

test('frontend guards require every module used by a protected route', () => {
  const permissionOnly = {
    permissions: ['conversations:read_assigned'],
    modules: ['core', 'conversations']
  };
  assert.equal(canAccessPath('/inbox', permissionOnly), false);
  assert.equal(
    canAccessPath('/inbox', {
      ...permissionOnly,
      modules: [...permissionOnly.modules, 'inbox']
    }),
    true
  );
});
