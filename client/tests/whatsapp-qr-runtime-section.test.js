import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const panel = read('../src/pages/inbox/WhatsAppQrSessionsPanel.jsx');
const numbers = read('../src/pages/inbox/WhatsAppNumbersPage.jsx');

test('el panel QR hace polling del QR y cuenta atras en vivo', () => {
  assert.match(panel, /loadQr\(selected\), 4000/); // polling HTTP del QR
  assert.match(panel, /qrCountdown/);
  assert.match(panel, /Generar nuevo QR/);
});

test('el panel muestra los estados en vivo (authenticating/reconnecting)', () => {
  assert.match(panel, /sincronizando/i);
  assert.match(panel, /authenticating/);
  assert.match(panel, /Reconectando/);
});

test('el panel es reutilizable por numero (focusSessionId + compact)', () => {
  assert.match(panel, /focusSessionId/);
  assert.match(panel, /compact/);
});

test('la pagina de Numeros muestra estado real de la sesion y accion contextual', () => {
  assert.match(numbers, /getWhatsAppSessions/);
  assert.match(numbers, /sessionByConfig/);
  assert.match(numbers, /qrPrimaryAction/);
  // El panel embebido paralelo se movio a un Drawer "Gestionar conexion".
  assert.match(numbers, /Gestionar conexion/);
  assert.match(numbers, /focusSessionId=\{manageSessionId\} compact/);
});

test('qrPrimaryAction mapea estados a la accion principal', () => {
  // Verifica el contrato del helper via el texto (no exportado).
  assert.match(numbers, /'connected'.*'Gestionar'/s);
  assert.match(numbers, /'qr_pending'.*'Ver QR'/s);
  assert.match(numbers, /return 'Vincular'/);
});
