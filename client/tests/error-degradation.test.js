import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { friendlyErrorMessage } from '../src/utils/errors.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('los 403 de permisos se convierten en un mensaje humano (sin claves tecnicas)', () => {
  const raw = 'No tienes ninguno de los permisos requeridos: opportunities:manage, opportunities:read_team, opportunities:read_assigned';
  const friendly = friendlyErrorMessage(raw);
  assert.notEqual(friendly, raw);
  assert.doesNotMatch(friendly, /opportunities:/);
  assert.match(friendly, /permisos/i);

  // Tambien por status, sin depender del texto.
  assert.match(friendlyErrorMessage({ status: 403, message: 'x' }), /acceso/i);
});

test('los errores de modulo tambien se humanizan', () => {
  const friendly = friendlyErrorMessage('El modulo calendar no esta autorizado para esta cuenta');
  assert.doesNotMatch(friendly, /modulo calendar/);
  assert.match(friendly, /plan|configuracion/i);
});

test('los errores normales (red, validacion) se conservan tal cual', () => {
  assert.equal(friendlyErrorMessage('El nombre es requerido'), 'El nombre es requerido');
  assert.equal(friendlyErrorMessage('Failed to fetch'), 'Failed to fetch');
  assert.equal(friendlyErrorMessage(''), '');
});

test('CrmLoadError sanea el mensaje antes de mostrarlo (beneficia a todas las paginas)', () => {
  const source = read('../src/components/CrmCommon.jsx');
  assert.match(source, /friendlyErrorMessage/);
  assert.match(source, /PermissionState/);
});

test('CalendarPage degrada las oportunidades en vez de romper el calendario', () => {
  const source = read('../src/pages/calendar/CalendarPage.jsx');
  // Nucleo (calendarios + citas) separado de las auxiliares tolerantes a fallo.
  assert.match(source, /const soft = \(promise, fallback\) => promise\.catch/);
  assert.match(source, /canReadOpportunities \? soft\(getOpportunities\(\), \[\]\) : Promise\.resolve\(\[\]\)/);
  // El selector de oportunidad se oculta si no hay acceso.
  assert.match(source, /\{canReadOpportunities \? <label[^>]*>Oportunidad/);
});
