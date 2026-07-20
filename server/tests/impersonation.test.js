import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

process.env.JWT_SECRET ||= 'impersonation-test-secret';
process.env.MEDIA_STORAGE_PROVIDER = 'local';

const ID = {
  distributorOne: '100000000000000000000001',
  distributorTwo: '100000000000000000000002',
  companyOne: '200000000000000000000001',
  companyTwo: '200000000000000000000002',
  superadmin: '300000000000000000000001',
  distributorUserOne: '300000000000000000000002',
  distributorUserTwo: '300000000000000000000003',
  adminOne: '300000000000000000000004',
  adminTwo: '300000000000000000000005',
  supervisorOne: '300000000000000000000006',
  callcenterOne: '300000000000000000000007',
  callcenterTwo: '300000000000000000000008',
  callcenterInactive: '300000000000000000000009'
};

let server;
let baseUrl;
let store;
let activityLog;
const restorers = [];

/** Query encadenable y thenable que imita lo justo de mongoose. */
function fakeQuery(result) {
  const query = {
    select: () => query,
    sort: () => query,
    populate: () => query,
    limit: () => query,
    lean: () => query,
    exec: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject)
  };
  return query;
}

function matchesCondition(value, condition) {
  if (
    condition &&
    typeof condition === 'object' &&
    !Array.isArray(condition) &&
    !(condition instanceof Date)
  ) {
    if ('$in' in condition) {
      return condition.$in.some((item) => String(item) === String(value ?? ''));
    }
    if ('$ne' in condition) {
      return String(value ?? '') !== String(condition.$ne ?? '');
    }
    if ('$nin' in condition) {
      return !condition.$nin.some((item) => String(item) === String(value ?? ''));
    }
  }
  if (condition instanceof RegExp) return condition.test(String(value ?? ''));
  return String(value ?? '') === String(condition ?? '');
}

function matchesFilter(doc, filter = {}) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return condition.some((sub) => matchesFilter(doc, sub));
    return matchesCondition(doc[key], condition);
  });
}

/** Reemplaza las estaticas del modelo por una coleccion en memoria. */
function stubModel(model, collectionName) {
  const statics = {
    findById: (id) => fakeQuery(store[collectionName].find((doc) => String(doc._id) === String(id)) || null),
    findOne: (filter) => fakeQuery(store[collectionName].find((doc) => matchesFilter(doc, filter)) || null),
    find: (filter) => fakeQuery(store[collectionName].filter((doc) => matchesFilter(doc, filter))),
    exists: (filter) => fakeQuery(store[collectionName].find((doc) => matchesFilter(doc, filter)) || null),
    countDocuments: (filter) =>
      fakeQuery(store[collectionName].filter((doc) => matchesFilter(doc, filter)).length),
    updateOne: async (filter, update) => {
      const doc = store[collectionName].find((item) => matchesFilter(item, filter));
      if (doc && update.$set) Object.assign(doc, update.$set);
      return { acknowledged: true, modifiedCount: doc ? 1 : 0 };
    },
    create: async (doc) => {
      const created = { _id: `${collectionName}-${store[collectionName].length + 1}`, ...doc };
      store[collectionName].push(created);
      return created;
    }
  };

  for (const [name, implementation] of Object.entries(statics)) {
    const original = model[name];
    restorers.push(() => {
      model[name] = original;
    });
    model[name] = implementation;
  }
}

function seed() {
  store = {
    users: [
      { _id: ID.superadmin, name: 'Root', email: 'root@plataforma.com', role: 'SUPERADMIN', status: 'active', distributorId: null, companyId: null },
      { _id: ID.distributorUserOne, name: 'Dist Uno', email: 'dist1@x.com', role: 'DISTRIBUTOR', status: 'active', distributorId: ID.distributorOne, companyId: null },
      { _id: ID.distributorUserTwo, name: 'Dist Dos', email: 'dist2@x.com', role: 'DISTRIBUTOR', status: 'active', distributorId: ID.distributorTwo, companyId: null },
      { _id: ID.adminOne, name: 'Admin Uno', email: 'admin1@x.com', role: 'ADMIN', status: 'active', distributorId: ID.distributorOne, companyId: ID.companyOne },
      { _id: ID.adminTwo, name: 'Admin Dos', email: 'admin2@x.com', role: 'ADMIN', status: 'active', distributorId: ID.distributorTwo, companyId: ID.companyTwo },
      { _id: ID.supervisorOne, name: 'Super Uno', email: 'sup1@x.com', role: 'SUPERVISOR', status: 'active', distributorId: ID.distributorOne, companyId: ID.companyOne },
      { _id: ID.callcenterOne, name: 'Agente Uno', email: 'cc1@x.com', role: 'CALLCENTER', status: 'active', distributorId: ID.distributorOne, companyId: ID.companyOne },
      { _id: ID.callcenterTwo, name: 'Agente Dos', email: 'cc2@x.com', role: 'CALLCENTER', status: 'active', distributorId: ID.distributorTwo, companyId: ID.companyTwo },
      { _id: ID.callcenterInactive, name: 'Agente Baja', email: 'ccoff@x.com', role: 'CALLCENTER', status: 'inactive', distributorId: ID.distributorOne, companyId: ID.companyOne }
    ],
    companies: [
      { _id: ID.companyOne, name: 'Empresa Uno', status: 'active', distributorId: ID.distributorOne, adminId: ID.adminOne },
      { _id: ID.companyTwo, name: 'Empresa Dos', status: 'active', distributorId: ID.distributorTwo, adminId: ID.adminTwo }
    ],
    distributors: [
      { _id: ID.distributorOne, name: 'Distribuidor Uno', status: 'active', settings: {} },
      { _id: ID.distributorTwo, name: 'Distribuidor Dos', status: 'active', settings: {} }
    ],
    moduleEntitlements: [],
    platformSubscriptions: [],
    subscriptions: [],
    activityLogs: []
  };
  activityLog = store.activityLogs;
}

before(async () => {
  const [
    { app },
    { User },
    { Company },
    { Distributor },
    { ModuleEntitlement },
    { PlatformSubscription },
    { Subscription },
    { ActivityLog },
    { WorkflowEventEmitter }
  ] = await Promise.all([
    import('../src/app.js'),
    import('../src/models/User.js'),
    import('../src/models/Company.js'),
    import('../src/models/Distributor.js'),
    import('../src/models/ModuleEntitlement.js'),
    import('../src/models/PlatformSubscription.js'),
    import('../src/models/Subscription.js'),
    import('../src/models/ActivityLog.js'),
    import('../src/modules/workflows/WorkflowEventEmitter.js')
  ]);

  seed();
  stubModel(User, 'users');
  stubModel(Company, 'companies');
  stubModel(Distributor, 'distributors');
  stubModel(ModuleEntitlement, 'moduleEntitlements');
  stubModel(PlatformSubscription, 'platformSubscriptions');
  stubModel(Subscription, 'subscriptions');
  stubModel(ActivityLog, 'activityLogs');

  const originalEmit = WorkflowEventEmitter.emitFromActivity;
  restorers.push(() => {
    WorkflowEventEmitter.emitFromActivity = originalEmit;
  });
  WorkflowEventEmitter.emitFromActivity = async () => [];

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  restorers.reverse().forEach((restore) => restore());
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  seed();
});

async function signSessionToken(userId) {
  const jwt = (await import('jsonwebtoken')).default;
  const user = store.users.find((item) => item._id === userId);
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '30m'
  });
}

async function impersonate(token, body) {
  const response = await fetch(`${baseUrl}/api/auth/impersonate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function endImpersonation(token) {
  const response = await fetch(`${baseUrl}/api/auth/impersonation/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  return { status: response.status, body: await response.json() };
}

// --- Reglas puras de alcance -------------------------------------------------

test('la jerarquia solo permite descender y nunca alcanzar el rol del actor', async () => {
  const { impersonableRoles, canRoleImpersonate } = await import(
    '../src/core/permissions/impersonationScope.js'
  );

  assert.deepEqual(impersonableRoles('SUPERADMIN'), [
    'DISTRIBUTOR',
    'ADMIN',
    'SUPERVISOR',
    'CALLCENTER'
  ]);
  assert.deepEqual(impersonableRoles('DISTRIBUTOR'), ['ADMIN', 'SUPERVISOR', 'CALLCENTER']);
  assert.deepEqual(impersonableRoles('ADMIN'), ['SUPERVISOR', 'CALLCENTER']);
  assert.deepEqual(impersonableRoles('SUPERVISOR'), []);
  assert.deepEqual(impersonableRoles('CALLCENTER'), []);
  assert.equal(canRoleImpersonate('SUPERVISOR'), false);
  assert.equal(canRoleImpersonate('CALLCENTER'), false);
});

test('el alcance por tenant se evalua contra el actor raiz', async () => {
  const { evaluateImpersonation } = await import(
    '../src/core/permissions/impersonationScope.js'
  );
  const distributorActor = {
    _id: ID.distributorUserOne,
    role: 'DISTRIBUTOR',
    status: 'active',
    distributorId: ID.distributorOne
  };
  const ownAgent = {
    _id: ID.callcenterOne,
    role: 'CALLCENTER',
    status: 'active',
    distributorId: ID.distributorOne,
    companyId: ID.companyOne
  };
  const ownCompany = {
    _id: ID.companyOne,
    status: 'active',
    distributorId: ID.distributorOne
  };

  assert.equal(evaluateImpersonation({ actor: distributorActor, target: ownAgent, company: ownCompany }).ok, true);
  assert.equal(
    evaluateImpersonation({
      actor: distributorActor,
      target: ownAgent,
      company: { ...ownCompany, status: 'suspended' }
    }).status,
    403
  );
  assert.equal(
    evaluateImpersonation({
      actor: distributorActor,
      target: ownAgent,
      company: { ...ownCompany, status: 'suspended' },
      allowInactiveCompany: true
    }).ok,
    true
  );
  assert.equal(
    evaluateImpersonation({ actor: distributorActor, target: distributorActor, company: null }).status,
    403
  );
});

// --- Endpoint ----------------------------------------------------------------

test('(a) SUPERADMIN impersona directamente a un CALLCENTER de cualquier tenant', async () => {
  const token = await signSessionToken(ID.superadmin);
  const { status, body } = await impersonate(token, { targetUserId: ID.callcenterTwo });

  assert.equal(status, 200);
  assert.equal(body.user._id, ID.callcenterTwo);
  assert.equal(body.user.role, 'CALLCENTER');
  assert.equal(body.impersonatedBy.id, ID.superadmin);
  assert.equal(body.expiresIn, '30m');
  assert.equal(body.redirectPath, '/callcenter/dashboard');

  const started = activityLog.find((entry) => entry.type === 'impersonation_started');
  assert.equal(started.metadata.targetRole, 'CALLCENTER');
  assert.equal(String(started.metadata.rootActorId), ID.superadmin);
  assert.equal(started.metadata.chained, false);
});

test('(b) la cadena SUPERADMIN -> ADMIN -> CALLCENTER conserva el actor raiz', async () => {
  const rootToken = await signSessionToken(ID.superadmin);
  const asAdmin = await impersonate(rootToken, { targetUserId: ID.adminOne });
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.body.user._id, ID.adminOne);
  assert.equal(asAdmin.body.chained, false);

  const asAgent = await impersonate(asAdmin.body.token, { targetUserId: ID.callcenterOne });
  assert.equal(asAgent.status, 200);
  assert.equal(asAgent.body.user._id, ID.callcenterOne);
  assert.equal(asAgent.body.chained, true);
  // El token nuevo mantiene al SUPERADMIN como actor raiz, no al ADMIN.
  assert.equal(asAgent.body.impersonatedBy.id, ID.superadmin);
  assert.equal(asAgent.body.impersonatedBy.role, 'SUPERADMIN');

  const chainEntry = activityLog.filter((entry) => entry.type === 'impersonation_started').at(-1);
  assert.equal(chainEntry.metadata.chained, true);
  assert.equal(String(chainEntry.metadata.previousUserId), ID.adminOne);
  assert.equal(String(chainEntry.metadata.rootActorId), ID.superadmin);
});

test('la cadena no permite escalar por encima del actor raiz', async () => {
  // Un DISTRIBUTOR que impersona a un ADMIN sigue limitado a su cartera.
  const distributorToken = await signSessionToken(ID.distributorUserOne);
  const asAdmin = await impersonate(distributorToken, { targetUserId: ID.adminOne });
  assert.equal(asAdmin.status, 200);

  const foreignAgent = await impersonate(asAdmin.body.token, {
    targetUserId: ID.callcenterTwo
  });
  assert.equal(foreignAgent.status, 403);

  const upwards = await impersonate(asAdmin.body.token, {
    targetUserId: ID.distributorUserTwo
  });
  assert.equal(upwards.status, 403);
});

test('(c) DISTRIBUTOR no puede impersonar usuarios de empresas ajenas', async () => {
  const token = await signSessionToken(ID.distributorUserOne);

  const foreignAgent = await impersonate(token, { targetUserId: ID.callcenterTwo });
  assert.equal(foreignAgent.status, 403);
  assert.equal(foreignAgent.body.message, 'La empresa no pertenece al distribuidor delegado');

  const foreignAdmin = await impersonate(token, { targetUserId: ID.adminTwo });
  assert.equal(foreignAdmin.status, 403);

  const foreignCompany = await impersonate(token, { companyId: ID.companyTwo });
  assert.equal(foreignCompany.status, 404);
});

test('(d) SUPERVISOR y CALLCENTER reciben 403 al intentar impersonar', async () => {
  const supervisorToken = await signSessionToken(ID.supervisorOne);
  const supervisorAttempt = await impersonate(supervisorToken, {
    targetUserId: ID.callcenterOne
  });
  assert.equal(supervisorAttempt.status, 403);
  assert.equal(supervisorAttempt.body.message, 'Tu rol no puede iniciar una impersonacion');

  const agentToken = await signSessionToken(ID.callcenterOne);
  const agentAttempt = await impersonate(agentToken, { targetUserId: ID.supervisorOne });
  assert.equal(agentAttempt.status, 403);
});

test('(e) impersonar a un usuario inactivo o inexistente devuelve 404', async () => {
  const token = await signSessionToken(ID.superadmin);

  const inactive = await impersonate(token, { targetUserId: ID.callcenterInactive });
  assert.equal(inactive.status, 404);
  assert.equal(inactive.body.message, 'Usuario objetivo activo no encontrado');

  const missing = await impersonate(token, { targetUserId: '3000000000000000000000ff' });
  assert.equal(missing.status, 404);

  const invalid = await impersonate(token, { targetUserId: 'no-es-un-id' });
  assert.equal(invalid.status, 400);
});

test('(f) terminar la impersonacion restaura siempre al actor raiz', async () => {
  const rootToken = await signSessionToken(ID.superadmin);
  const asAdmin = await impersonate(rootToken, { targetUserId: ID.adminOne });
  const asAgent = await impersonate(asAdmin.body.token, { targetUserId: ID.callcenterOne });

  const ended = await endImpersonation(asAgent.body.token);
  assert.equal(ended.status, 200);
  assert.equal(ended.body.actor.id, ID.superadmin);
  assert.equal(ended.body.actor.role, 'SUPERADMIN');

  const closing = activityLog.find((entry) => entry.type === 'impersonation_ended');
  assert.equal(String(closing.metadata.targetUserId), ID.callcenterOne);
  assert.equal(String(closing.metadata.rootActorId), ID.superadmin);

  const withoutSession = await endImpersonation(rootToken);
  assert.equal(withoutSession.status, 400);
});

test('el cierre sigue disponible con la empresa suspendida', async () => {
  const rootToken = await signSessionToken(ID.superadmin);
  const asAgent = await impersonate(rootToken, { targetUserId: ID.callcenterOne });
  assert.equal(asAgent.status, 200);

  store.companies.find((company) => company._id === ID.companyOne).status = 'suspended';

  const blocked = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${asAgent.body.token}` }
  });
  assert.equal(blocked.status, 403);

  const ended = await endImpersonation(asAgent.body.token);
  assert.equal(ended.status, 200);
  assert.equal(ended.body.actor.id, ID.superadmin);
});

test('los flujos existentes con distributorId y companyId siguen funcionando', async () => {
  const rootToken = await signSessionToken(ID.superadmin);
  const asDistributor = await impersonate(rootToken, {
    distributorId: ID.distributorOne
  });
  assert.equal(asDistributor.status, 200);
  assert.equal(asDistributor.body.user._id, ID.distributorUserOne);
  assert.equal(asDistributor.body.redirectPath, '/distributor/dashboard');

  const distributorToken = await signSessionToken(ID.distributorUserOne);
  const asAdmin = await impersonate(distributorToken, { companyId: ID.companyOne });
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.body.user._id, ID.adminOne);
  assert.equal(asAdmin.body.impersonatedBy.id, ID.distributorUserOne);

  const missingPayload = await impersonate(rootToken, {});
  assert.equal(missingPayload.status, 400);
});

test('los candidatos listados respetan el alcance del actor raiz', async () => {
  const adminToken = await signSessionToken(ID.adminOne);
  const response = await fetch(`${baseUrl}/api/auth/impersonation/targets`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  const roles = new Set(body.users.map((user) => user.role));
  assert.deepEqual([...roles].sort(), ['CALLCENTER', 'SUPERVISOR']);
  assert.equal(
    body.users.every((user) => String(user.companyId) === ID.companyOne),
    true
  );
  assert.equal(
    body.users.some((user) => user._id === ID.callcenterInactive),
    false
  );

  const supervisorToken = await signSessionToken(ID.supervisorOne);
  const denied = await fetch(`${baseUrl}/api/auth/impersonation/targets`, {
    headers: { Authorization: `Bearer ${supervisorToken}` }
  });
  assert.equal(denied.status, 403);
});

// Regresion: en una sesion ya impersonada el listado debe seguir midiendose
// contra el actor raiz. Si se midiera contra el usuario impersonado, un
// SUPERADMIN que entra como CALLCENTER perderia el selector (403) y un
// DISTRIBUTOR impersonado veria candidatos fuera de su cartera.
test('los candidatos siguen el alcance del actor raiz en una sesion encadenada', async () => {
  const rootToken = await signSessionToken(ID.superadmin);

  // El objetivo tiene un rol que por si solo NO puede impersonar.
  const asAgent = await impersonate(rootToken, { targetUserId: ID.callcenterOne });
  assert.equal(asAgent.status, 200);
  assert.equal(asAgent.body.user.role, 'CALLCENTER');

  const response = await fetch(`${baseUrl}/api/auth/impersonation/targets`, {
    headers: { Authorization: `Bearer ${asAgent.body.token}` }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.actor.id, ID.superadmin, 'el actor reportado es la raiz');
  assert.equal(body.actor.role, 'SUPERADMIN');
  // El universo es el del SUPERADMIN, no el del CALLCENTER impersonado: si se
  // midiera contra req.user, un CALLCENTER no podria impersonar y esto seria 403.
  assert.equal(body.users.some((user) => user.role === 'DISTRIBUTOR'), true);
  assert.equal(body.users.some((user) => user.role === 'ADMIN'), true);
  // El filtro solo excluye al actor raiz; el usuario impersonado en curso sigue
  // en la lista y es el cliente quien deshabilita su propia fila.
  assert.equal(body.users.some((user) => user._id === ID.superadmin), false);

  // Un DISTRIBUTOR raiz que impersona a un ADMIN sigue limitado a su cartera.
  const distributorToken = await signSessionToken(ID.distributorUserOne);
  const asAdmin = await impersonate(distributorToken, { targetUserId: ID.adminOne });
  assert.equal(asAdmin.status, 200);

  const scoped = await fetch(`${baseUrl}/api/auth/impersonation/targets`, {
    headers: { Authorization: `Bearer ${asAdmin.body.token}` }
  });
  const scopedBody = await scoped.json();
  assert.equal(scoped.status, 200);
  assert.equal(scopedBody.actor.id, ID.distributorUserOne);
  assert.equal(
    scopedBody.users.every((user) => String(user.distributorId) === ID.distributorOne),
    true,
    'no se filtran usuarios de otro distribuidor'
  );
});

// Regresion: la re-impersonacion se acepta por las tres ramas de entrada, no
// solo por `targetUserId`. Antes las ramas legacy devolvian 409.
test('la cadena tambien funciona por companyId y por distributorId', async () => {
  const rootToken = await signSessionToken(ID.superadmin);
  const asDistributor = await impersonate(rootToken, { targetUserId: ID.distributorUserOne });
  assert.equal(asDistributor.status, 200);

  // Rama legacy companyId desde una sesion ya impersonada.
  const chainedByCompany = await impersonate(asDistributor.body.token, {
    companyId: ID.companyOne
  });
  assert.equal(chainedByCompany.status, 200, 'companyId no debe devolver 409');
  assert.equal(chainedByCompany.body.user._id, ID.adminOne);
  assert.equal(chainedByCompany.body.chained, true);
  assert.equal(chainedByCompany.body.impersonatedBy.id, ID.superadmin);

  // Rama legacy distributorId desde una sesion ya impersonada.
  const chainedByDistributor = await impersonate(chainedByCompany.body.token, {
    distributorId: ID.distributorOne
  });
  assert.equal(chainedByDistributor.status, 200, 'distributorId no debe devolver 409');
  assert.equal(chainedByDistributor.body.user._id, ID.distributorUserOne);
  assert.equal(chainedByDistributor.body.impersonatedBy.id, ID.superadmin);

  // La raiz nunca se desplaza: terminar vuelve al SUPERADMIN original.
  const ended = await endImpersonation(chainedByDistributor.body.token);
  assert.equal(ended.status, 200);
  assert.equal(ended.body.actor.id, ID.superadmin);

  // Y el alcance se sigue midiendo contra la raiz: un DISTRIBUTOR raiz no
  // alcanza una empresa ajena por la rama companyId. Devuelve 404 y no 403
  // porque la busqueda ya va filtrada por su distribuidor: para el, esa
  // empresa no existe, y asi no se revela que pertenece a otro.
  const distributorToken = await signSessionToken(ID.distributorUserOne);
  const foreign = await impersonate(distributorToken, { companyId: ID.companyTwo });
  assert.equal(foreign.status, 404);
});
