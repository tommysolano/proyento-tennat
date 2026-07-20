import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const switcher = read('../src/components/ImpersonationSwitcher.jsx');
const adminDashboard = read('../src/pages/admin/AdminDashboard.jsx');
const companiesSection = read(
  '../src/pages/distributor/sections/DistributorCompaniesSection.jsx'
);
const companyDetail = read('../src/pages/distributor/CompanyDetailForDistributor.jsx');
const header = read('../src/layouts/Header.jsx');
const assigneeSelect = read('../src/components/AssigneeSelect.jsx');

test('el selector arranca acotado al contexto y solo se amplia a proposito', () => {
  // Por defecto nunca se lista toda la plataforma desde un contexto concreto.
  assert.match(switcher, /useState\(false\)/);
  assert.match(switcher, /const contextActive = hasContext && !scopeAll/);

  // El filtro solo viaja a la API mientras el contexto sigue activo.
  assert.match(switcher, /companyId: contextActive \? companyId : undefined/);
  assert.match(switcher, /distributorId: contextActive \? distributorId : undefined/);

  // Recargar al cambiar el alcance, o el toggle no tendria efecto visible.
  assert.match(switcher, /\[search, role, companyId, distributorId, contextActive\]/);

  // Al cerrar se vuelve al alcance acotado.
  assert.match(switcher, /setScopeAll\(false\)/);
});

test('ampliar el alcance se ofrece solo a quien alcanza mas alla del contexto', () => {
  assert.match(switcher, /rootActor\?\.role === 'SUPERADMIN'/);
  assert.match(switcher, /Buscar en toda la plataforma/);
  assert.match(switcher, /rootActor\?\.role === 'DISTRIBUTOR'/);
  assert.match(switcher, /Buscar en toda mi cartera/);
  // Un ADMIN raiz ya esta limitado a su empresa: no se le ofrece el toggle.
  assert.match(switcher, /const canWiden = hasContext && Boolean\(widenLabel\)/);
});

test('el titulo y el vacio nombran la empresa del contexto', () => {
  assert.match(switcher, /Entrar como usuario de \$\{contextLabel\}/);
  assert.match(switcher, /Solo se listan los usuarios de este contexto/);
  // El vacio explica el motivo en vez de dejar una lista en blanco.
  assert.match(switcher, /no tiene usuarios/);
  assert.match(switcher, /<EmptyState/);
});

test('cada punto de apertura pasa el contexto que le corresponde', () => {
  // Dashboard de ADMIN: se acota a la empresa del tenant actual.
  assert.match(adminDashboard, /const currentCompanyId = tenant\?\.company\?\._id/);
  assert.match(adminDashboard, /companyId=\{currentCompanyId\}/);
  assert.match(adminDashboard, /contextLabel=\{currentCompanyName\}/);

  // Distribuidor: fila de empresa y ficha de empresa.
  assert.match(companiesSection, /companyId=\{row\._id\}/);
  assert.match(companiesSection, /contextLabel=\{row\.name\}/);
  assert.match(companyDetail, /companyId=\{id\} contextLabel=\{company\.name\}/);

  // El header es la apertura global: no debe acotarse a ninguna empresa.
  const headerSwitcher = header.slice(header.indexOf('<ImpersonationSwitcher'));
  assert.equal(/companyId=/.test(headerSwitcher), false);
});

test('sin agentes asignables se explica el motivo y el payload no cambia', () => {
  assert.match(assigneeSelect, /No hay agentes en esta empresa/);
  // El campo sigue viajando vacio para no alterar la logica de asignacion.
  assert.match(assigneeSelect, /<input type="hidden" name=\{name\} defaultValue="" \/>/);

  for (const [name, source] of [
    ['ContactManager', read('../src/components/ContactManager.jsx')],
    ['ContactsPage', read('../src/pages/crm/ContactsPage.jsx')],
    ['ContactDetailPage', read('../src/pages/crm/ContactDetailPage.jsx')]
  ]) {
    assert.match(source, /<AssigneeSelect/, `${name} usa AssigneeSelect`);
    assert.match(
      source,
      /import \{ AssigneeSelect(, assignableUsers)? \} from/,
      `${name} importa AssigneeSelect`
    );
  }
});
