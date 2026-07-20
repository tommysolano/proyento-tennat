import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  missingRequires,
  missingRecommends,
  enabledDependents,
  moduleLabel
} from '../src/utils/moduleDeps.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const catalog = [
  { key: 'conversations', name: 'Conversaciones', requires: [], recommends: [] },
  { key: 'whatsapp', name: 'WhatsApp', requires: ['conversations'], recommends: [] },
  { key: 'inbox', name: 'Inbox', requires: ['conversations'], recommends: ['media', 'realtime'] },
  { key: 'media', name: 'Media', requires: [], recommends: [] }
];

test('missingRequires devuelve las dependencias duras no habilitadas (transitivo)', () => {
  assert.deepEqual(missingRequires('whatsapp', catalog, new Set()), ['conversations']);
  assert.deepEqual(missingRequires('whatsapp', catalog, new Set(['conversations'])), []);
});

test('missingRecommends devuelve recomendados faltantes (aviso suave)', () => {
  assert.deepEqual(missingRecommends('inbox', catalog, new Set()), ['media', 'realtime']);
  assert.deepEqual(missingRecommends('inbox', catalog, new Set(['media'])), ['realtime']);
});

test('enabledDependents lista modulos habilitados que se romperian', () => {
  const enabled = new Set(['conversations', 'whatsapp', 'inbox']);
  const dependents = enabledDependents('conversations', catalog, enabled);
  assert.ok(dependents.includes('whatsapp'));
  assert.ok(dependents.includes('inbox'));
});

test('moduleLabel resuelve el nombre por key', () => {
  assert.equal(moduleLabel('whatsapp', catalog), 'WhatsApp');
  assert.equal(moduleLabel('desconocido', catalog), 'desconocido');
});

test('la matriz del SUPERADMIN usa toggles, optimistic UI, diagnostico y cascada', () => {
  const section = read('../src/pages/superadmin/sections/SuperAdminModulesSection.jsx');
  assert.match(section, /getModuleMatrix/);
  assert.match(section, /updateModuleEntitlement/);
  assert.match(section, /diagnoseModule/);
  assert.match(section, /missingRequires/);
  assert.match(section, /enabledDependents/);
  // Optimistic + revert.
  assert.match(section, /previous/);
  assert.match(section, /role="switch"/);
});

test('el editor de planes del distribuidor bloquea no autorizados con tooltip y edita modulos', () => {
  const section = read('../src/pages/distributor/sections/DistributorPlansSection.jsx');
  assert.match(section, /No autorizado por la plataforma/);
  assert.match(section, /diagnoseDistributorModule/);
  assert.match(section, /includedModules/);
  assert.match(section, /disabled=\{locked\}/);
});

test('Modulos autorizados muestra el aviso de herencia', () => {
  const section = read('../src/pages/distributor/sections/DistributorModulesSection.jsx');
  assert.match(section, /Estos modulos los concede la plataforma/);
});

test('el dashboard del ADMIN endurece la carga con soft() y timeout', () => {
  const dashboard = read('../src/pages/admin/AdminDashboard.jsx');
  assert.match(dashboard, /DASHBOARD_REQUEST_TIMEOUT_MS/);
  assert.match(dashboard, /const soft =/);
  assert.match(dashboard, /Promise\.race/);
});

test('la API expone matriz y diagnostico', () => {
  const api = read('../src/api.js');
  assert.match(api, /getModuleMatrix = \(scopeType, scopeId\)/);
  assert.match(api, /diagnoseModule = \(scopeType, scopeId, moduleKey\)/);
  assert.match(api, /diagnoseDistributorModule = \(moduleKey\)/);
  assert.match(api, /diagnoseCompanyModule = \(companyId, moduleKey\)/);
});
