import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { assignedResourceScope } from '../src/utils/crmScope.js';

const oid = () => new mongoose.Types.ObjectId();
const COMPANY = oid();
const SUPERVISOR = oid();
const AGENT = oid();
const TEAMMATE = oid();

/**
 * Emula el matching de Mongo para los campos que usa el scope de contacto:
 * igualdad de companyId y de assignedTo (directa o `$in`). Con esto se puede
 * afirmar, sin base de datos, si `Contact.findOne({ _id, ...scope })` habria
 * encontrado el contacto (200) o no (404).
 */
function matchesScope(contact, scope) {
  return Object.entries(scope).every(([field, condition]) => {
    const value = contact[field];
    if (condition && typeof condition === 'object' && '$in' in condition) {
      return condition.$in.some((id) => String(id) === String(value));
    }
    return String(condition) === String(value);
  });
}

const assigned = { _id: oid(), companyId: COMPANY, assignedTo: AGENT };
const teammateContact = { _id: oid(), companyId: COMPANY, assignedTo: TEAMMATE };
const foreignAgent = oid();
const notAssigned = { _id: oid(), companyId: COMPANY, assignedTo: foreignAgent };

test('(a) CALLCENTER solo alcanza los contactos donde es el responsable', async () => {
  const agent = { _id: AGENT, role: 'CALLCENTER', companyId: COMPANY };
  const scope = await assignedResourceScope(agent);

  assert.deepEqual(scope, { companyId: COMPANY, assignedTo: AGENT });
  // Contacto asignado -> lo encontraria -> 200 con datos.
  assert.equal(matchesScope(assigned, scope), true);
});

test('(b) CALLCENTER NO alcanza un contacto que no le esta asignado', async () => {
  const agent = { _id: AGENT, role: 'CALLCENTER', companyId: COMPANY };
  const scope = await assignedResourceScope(agent);

  // Fuera de su alcance -> findOne devuelve null -> la ruta responde 404.
  assert.equal(matchesScope(notAssigned, scope), false);
  assert.equal(matchesScope(teammateContact, scope), false);
});

test('(c) SUPERVISOR alcanza los contactos de su equipo', async (t) => {
  // teamMemberIds consulta los CALLCENTER que le reportan; se stubea esa query.
  const original = User.find;
  t.after(() => { User.find = original; });
  User.find = () => ({ distinct: async () => [TEAMMATE] });

  const supervisor = { _id: SUPERVISOR, role: 'SUPERVISOR', companyId: COMPANY };
  const scope = await assignedResourceScope(supervisor);

  assert.equal(String(scope.companyId), String(COMPANY));
  assert.deepEqual(
    scope.assignedTo.$in.map(String).sort(),
    [SUPERVISOR, TEAMMATE].map(String).sort()
  );
  // Contacto de un agente de su equipo -> lo encontraria -> 200.
  assert.equal(matchesScope(teammateContact, scope), true);
});

test('(d) SUPERVISOR NO alcanza un contacto fuera de su equipo', async (t) => {
  const original = User.find;
  t.after(() => { User.find = original; });
  User.find = () => ({ distinct: async () => [TEAMMATE] });

  const supervisor = { _id: SUPERVISOR, role: 'SUPERVISOR', companyId: COMPANY };
  const scope = await assignedResourceScope(supervisor);

  // Asignado a un agente que no le reporta -> fuera de alcance -> 404.
  assert.equal(matchesScope(notAssigned, scope), false);
});

test('ADMIN alcanza cualquier contacto de su empresa; roles sin CRM no alcanzan nada', async () => {
  const admin = { _id: oid(), role: 'ADMIN', companyId: COMPANY };
  assert.deepEqual(await assignedResourceScope(admin), { companyId: COMPANY });

  const outsider = { _id: oid(), role: 'DISTRIBUTOR', companyId: COMPANY };
  assert.deepEqual(await assignedResourceScope(outsider), { _id: null });
});

test('la ruta GET /contacts/:id filtra por alcance, no por rol plano', () => {
  const source = readFileSync(new URL('../src/routes/contactRoutes.js', import.meta.url), 'utf8');
  // El handler debe scopear con assignedResourceScope (no un roleMiddleware que
  // excluya CALLCENTER) y devolver 404 cuando el contacto queda fuera.
  assert.match(source, /router\.get\('\/:id'/);
  assert.match(source, /assignedResourceScope\(req\.user\)/);
  assert.match(source, /roleMiddleware\('ADMIN', 'SUPERVISOR', 'CALLCENTER'\)/);
});
