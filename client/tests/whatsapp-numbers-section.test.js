import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('../src/pages/inbox/WhatsAppNumbersPage.jsx');
const api = read('../src/api.js');
const routes = read('../src/routes/AppRoutes.jsx');
const access = read('../src/utils/access.js');

test('la pagina usa las primitivas del proyecto (PageShell, Table, Drawer, EmptyState)', () => {
  for (const primitive of ['PageShell', 'Table', 'Drawer', 'EmptyState', 'ActionsMenu']) {
    assert.match(page, new RegExp(`import \\{[^}]*${primitive}`), `falta ${primitive}`);
  }
});

test('mezcla cloud y QR con badge de tipo, salud y numero por defecto', () => {
  assert.match(page, /API de Meta/);
  assert.match(page, /QR/);
  assert.match(page, /Por defecto/);
  // Semaforo de salud solo para cloud.
  assert.match(page, /qualityDot/);
  assert.match(page, /GREEN|YELLOW|RED/);
});

test('las acciones por numero cubren default, habilitar/deshabilitar, probar y refrescar salud', () => {
  assert.match(page, /setDefaultChannelConfig/);
  assert.match(page, /disableChannelConfig/);
  assert.match(page, /testChannelConfig/);
  assert.match(page, /refreshChannelQuality/);
});

test('el drawer de crear muestra solo los campos del tipo elegido', () => {
  assert.match(page, /createType === 'whatsapp_qr'/);
  assert.match(page, /externalBusinessId/); // campo cloud
});

test('la API expone los endpoints nuevos', () => {
  assert.match(api, /setDefaultChannelConfig = \(id\) =>/);
  assert.match(api, /refreshChannelQuality = \(id\) =>/);
  assert.match(api, /set-default/);
  assert.match(api, /refresh-quality/);
});

test('la ruta esta registrada y protegida por permiso/modulo', () => {
  assert.match(routes, /path: '\/inbox\/whatsapp-numbers', element: <WhatsAppNumbersPage \/>/);
  assert.match(access, /\/inbox\/whatsapp-numbers/);
  assert.match(access, /channel_configs:manage/);
});
