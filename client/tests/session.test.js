import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { tokenExpiry, tokenIsExpired } from '../src/utils/session.js';

function makeToken(payload) {
  const b64 = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.firma`;
}

const NOW = 1_800_000_000_000; // instante fijo

test('tokenExpiry lee exp en ms o null cuando no se puede', () => {
  assert.equal(tokenExpiry(makeToken({ exp: 1000 })), 1_000_000);
  assert.equal(tokenExpiry('no-es-jwt'), null);
  assert.equal(tokenExpiry(''), null);
  assert.equal(tokenExpiry(null), null);
  assert.equal(tokenExpiry(makeToken({ role: 'ADMIN' })), null); // sin exp
});

test('un token vigente NO se considera expirado (un 401 suelto no desloguea)', () => {
  const future = makeToken({ exp: Math.floor((NOW + 60 * 60 * 1000) / 1000) });
  assert.equal(tokenIsExpired(future, NOW), false);
});

test('un token caducado si se considera expirado', () => {
  const past = makeToken({ exp: Math.floor((NOW - 60 * 60 * 1000) / 1000) });
  assert.equal(tokenIsExpired(past, NOW), true);
});

test('token ilegible no fuerza logout (se conserva la sesion)', () => {
  assert.equal(tokenIsExpired('token-corrupto', NOW), false);
  assert.equal(tokenIsExpired(makeToken({ role: 'ADMIN' }), NOW), false);
});

test('el margen de reloj evita cerrar sesion justo en el limite', () => {
  // exp dentro de los proximos 10s: con margen de 30s se trata como expirado.
  const almost = makeToken({ exp: Math.floor((NOW + 10 * 1000) / 1000) });
  assert.equal(tokenIsExpired(almost, NOW), true);
});

test('AuthContext solo desloguea cuando el token realmente expiro', () => {
  const source = readFileSync(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8');
  // El handler de 401 debe consultar la expiracion antes de cerrar sesion y
  // preferir volver al actor raiz si la sesion impersonada caduco.
  assert.match(source, /tokenIsExpired/);
  assert.match(source, /returnToOriginalSession\(\)/);
  assert.match(source, /if \(!current \|\| !tokenIsExpired\(current\)\) return;/);
});
