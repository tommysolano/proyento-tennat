import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('WhatsApp QR administration exposes controlled states, temporary QR and confirmations', () => {
  const panel = readFileSync(
    new URL('../src/pages/inbox/WhatsAppQrSessionsPanel.jsx', import.meta.url),
    'utf8'
  );
  assert.match(panel, /qr_pending/);
  assert.match(panel, /getWhatsAppSessionQr/);
  // El QR temporal ahora muestra cuenta atras / expiracion en vivo.
  assert.match(panel, /renueva en|expiro|Expira/);
  assert.match(panel, /window\.prompt/);
  assert.match(panel, /Cerrar y borrar autenticacion/);
  assert.match(panel, /authStateConfigured/);
  assert.doesNotMatch(panel, /accessToken|cookie|authState\}/);
});

test('Inbox distinguishes Cloud and QR and selects a concrete outbound integration', () => {
  const inbox = readFileSync(
    new URL('../src/pages/inbox/InboxPage.jsx', import.meta.url),
    'utf8'
  );
  const api = readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
  assert.match(inbox, /whatsapp_cloud: 'WhatsApp Cloud'/);
  assert.match(inbox, /whatsapp_qr: 'WhatsApp QR'/);
  assert.match(inbox, /channelConfigId: provider\._id/);
  assert.match(inbox, /Selecciona la conexion de salida/);
  assert.match(inbox, /channelConfigId\?\.displayName/);
  assert.match(api, /\/whatsapp-sessions/);
  assert.match(api, /\/conversations\/providers/);
});
