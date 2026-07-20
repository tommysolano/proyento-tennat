import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

process.env.JWT_SECRET ||= 'availability-routing-test-secret';
process.env.MEDIA_STORAGE_PROVIDER = 'local';
// Sin base de datos, cualquier consulta que llegue a un handler queda en buffer
// hasta agotar el timeout. La bajamos para que el test que atraviesa el router
// hasta la verificacion de modulo falle rapido en vez de esperar 10s.
mongoose.set('bufferTimeoutMS', 600);

const availabilitySource = readFileSync(
  new URL('../src/routes/availabilityRoutes.js', import.meta.url),
  'utf8'
);
const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('availabilityRoutes no aplica guards en router.use (interceptaria a sus hermanas)', () => {
  // Montado en `/api` sin subruta, un `router.use(roleMiddleware(...))` cortaria
  // TODA peticion /api/* montada despues. Los guards deben ir por-ruta.
  assert.doesNotMatch(availabilitySource, /router\.use\(roleMiddleware/);
  assert.doesNotMatch(availabilitySource, /router\.use\(requirePermission/);
  assert.doesNotMatch(availabilitySource, /router\.use\(requireModule/);
  const guarded = availabilitySource.match(/\.\.\.guards/g) || [];
  assert.equal(guarded.length >= 4, true, 'las 4 rutas deben aplicar ...guards');
});

test('availabilityRoutes se monta en /api sin subruta (por eso el fix es necesario)', () => {
  // Documenta la condicion que hace peligroso cualquier router.use aqui: si esto
  // cambiara a un prefijo propio, el guard-por-ruta dejaria de ser obligatorio,
  // pero mientras siga en `/api` desnudo, este test protege el invariante.
  assert.match(appSource, /app\.use\('\/api', availabilityRoutes\)/);
});

// Integracion: un SUPERVISOR alcanzando una ruta montada DESPUES de
// availabilityRoutes ya no recibe su 403 de rol ADMIN. Se stubea Mongoose con
// una query encadenable para no depender de una base de datos.
let server;
let baseUrl;
const restore = [];

function fakeQuery(result) {
  const query = {
    select: () => query,
    sort: () => query,
    populate: () => query,
    limit: () => query,
    lean: () => query,
    distinct: () => Promise.resolve([]),
    exec: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject)
  };
  return query;
}

function stub(object, key, value) {
  const original = object[key];
  restore.push(() => { object[key] = original; });
  object[key] = value;
}

const SUP_ID = '300000000000000000000009';
const COMPANY_ID = '200000000000000000000001';
const DIST_ID = '100000000000000000000001';

before(async () => {
  const { User } = await import('../src/models/User.js');
  const { Company } = await import('../src/models/Company.js');
  const { Distributor } = await import('../src/models/Distributor.js');

  const supervisor = {
    _id: SUP_ID,
    role: 'SUPERVISOR',
    status: 'active',
    companyId: COMPANY_ID,
    distributorId: DIST_ID,
    permissions: undefined,
    permissionTemplate: ''
  };

  stub(User, 'findById', (id) => fakeQuery(String(id) === SUP_ID ? supervisor : null));
  stub(User, 'find', () => fakeQuery([]));
  stub(Company, 'findById', () =>
    fakeQuery({ _id: COMPANY_ID, status: 'active', distributorId: DIST_ID }));
  stub(Distributor, 'findById', () => fakeQuery({ _id: DIST_ID, status: 'active' }));

  const { app } = await import('../src/app.js');
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  restore.forEach((fn) => fn());
});

test('un SUPERVISOR llega a /api/appointments sin el gate ADMIN de availability', async () => {
  const token = jwt.sign({ id: SUP_ID, role: 'SUPERVISOR' }, process.env.JWT_SECRET);
  const response = await fetch(`${baseUrl}/api/appointments`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await response.json().catch(() => ({}));

  // La regresion concreta: availabilityRoutes ya no responde con su mensaje de
  // rol ADMIN por una ruta que no es suya. El request llega a appointmentRoutes,
  // que aplicara su propio criterio (permiso/modulo) — nunca el de availability.
  assert.notEqual(
    body.message,
    'No tienes permisos para esta accion',
    'availabilityRoutes esta interceptando /api/appointments'
  );
});
