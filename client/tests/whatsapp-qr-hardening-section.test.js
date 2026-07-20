import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { whatsappQrErrorMessage } from '../src/utils/whatsappQrErrors.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('mapea WHATSAPP_QR_DISABLED con detalle solo para SUPERADMIN', () => {
  const error = { reasonCode: 'WHATSAPP_QR_DISABLED', message: 'Error interno del servidor' };
  const admin = whatsappQrErrorMessage(error, { isSuperAdmin: false });
  const superadmin = whatsappQrErrorMessage(error, { isSuperAdmin: true });
  assert.match(admin, /desactivada/);
  assert.doesNotMatch(admin, /WHATSAPP_QR_ENABLED/); // sin detalles de env para ADMIN
  assert.match(superadmin, /WHATSAPP_QR_ENABLED=true/);
  assert.match(superadmin, /CREDENTIALS_ENCRYPTION_KEY/);
});

test('cae al mensaje del backend si el reasonCode es desconocido', () => {
  const error = { message: 'Algo especifico paso' };
  assert.equal(whatsappQrErrorMessage(error), 'Algo especifico paso');
});

test('el panel QR usa el mapeo de reasonCodes', () => {
  const panel = read('../src/pages/inbox/WhatsAppQrSessionsPanel.jsx');
  assert.match(panel, /whatsappQrErrorMessage/);
  assert.match(panel, /isSuperAdmin/);
});

test('la pagina de Numeros crea el QR de forma atomica (via sesion)', () => {
  const page = read('../src/pages/inbox/WhatsAppNumbersPage.jsx');
  assert.match(page, /createWhatsAppSession/);
  // El QR ya no se crea como ChannelConfig suelto.
  assert.match(page, /channel === 'whatsapp_qr'/);
});

test('apiRequest propaga el reasonCode al error', () => {
  const api = read('../src/api.js');
  assert.match(api, /error\.reasonCode = data\.reasonCode/);
});
