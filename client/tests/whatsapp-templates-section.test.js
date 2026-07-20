import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('../src/pages/inbox/MessageTemplatesPage.jsx');
const api = read('../src/api.js');

test('la pagina usa las primitivas del proyecto (PageShell, Table, Drawer, EmptyState, ActionsMenu)', () => {
  for (const primitive of ['PageShell', 'Table', 'Drawer', 'EmptyState', 'ActionsMenu']) {
    assert.match(page, new RegExp(`import \\{[^}]*${primitive}`), `falta ${primitive}`);
  }
});

test('el editor cubre header, cuerpo con variables, footer y constructor de botones', () => {
  assert.match(page, /headerType/);
  assert.match(page, /Insertar variable/);
  assert.match(page, /Agregar boton/);
  assert.match(page, /footer/);
  // Ejemplos de variables (Meta los exige).
  assert.match(page, /Ejemplos de variables/);
});

test('la vista previa estilo burbuja de WhatsApp esta presente', () => {
  assert.match(page, /TemplatePreview/);
  assert.match(page, /Vista previa/);
});

test('las acciones cubren el ciclo de vida (registrar, sincronizar, duplicar, eliminar)', () => {
  assert.match(page, /registerMessageTemplate/);
  assert.match(page, /syncMessageTemplates/);
  assert.match(page, /duplicateMessageTemplate/);
  assert.match(page, /deleteMessageTemplate/);
  // "Registrar en Meta" solo para borradores.
  assert.match(page, /Registrar en Meta/);
  assert.match(page, /Duplicar como borrador/);
});

test('el EmptyState guia a configurar un numero cloud cuando falta', () => {
  assert.match(page, /hasCompleteCloudAccount/);
  assert.match(page, /Configura un numero con API de Meta/);
  assert.match(page, /\/inbox\/whatsapp-numbers/);
});

test('el badge de estado muestra el motivo de rechazo y mapea colores', () => {
  assert.match(page, /rejectionReason/);
  assert.match(page, /STATUS_TONE/);
  assert.match(page, /rejected: 'failed'/);
});

test('la API expone los endpoints del ciclo de vida de plantillas', () => {
  assert.match(api, /registerMessageTemplate = \(id\) =>/);
  assert.match(api, /syncMessageTemplates = \(id\) =>/);
  assert.match(api, /duplicateMessageTemplate = \(id\) =>/);
  assert.match(api, /deleteMessageTemplate = \(id\) =>/);
  assert.match(api, /getTemplateCloudStatus = \(\) =>/);
  assert.match(api, /\/register/);
  assert.match(api, /\/duplicate/);
  assert.match(api, /cloud-status/);
});
