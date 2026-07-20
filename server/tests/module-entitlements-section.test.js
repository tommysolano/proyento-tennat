import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import {
  moduleRequires,
  moduleRecommends,
  resolveRequiredModules,
  modulesDependingOn
} from '../src/core/modules/moduleRegistry.js';
import {
  traceDistributorModules,
  traceCompanyModules,
  tracePlatformPlanModules,
  explainModuleForScope,
  getCompanyAuthorizedModules
} from '../src/core/modules/moduleAccess.js';
import { Distributor } from '../src/models/Distributor.js';
import { Company } from '../src/models/Company.js';
import { PlatformPlan } from '../src/models/PlatformPlan.js';
import { PlatformSubscription } from '../src/models/PlatformSubscription.js';
import { Subscription } from '../src/models/Subscription.js';
import { ModuleEntitlement } from '../src/models/ModuleEntitlement.js';

const ID = {
  distributor: 'd0000000000000000000000d',
  platformPlan: 'p0000000000000000000000p',
  company: 'c0000000000000000000000c',
  commercialPlan: 'e000000000000000000000e0'
};

let store;
const restorers = [];

function matchesCondition(value, condition) {
  if (condition && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date)) {
    if ('$in' in condition) return condition.$in.some((item) => String(item) === String(value ?? ''));
    if ('$ne' in condition) return String(value ?? '') !== String(condition.$ne ?? '');
  }
  return String(value ?? '') === String(condition ?? '');
}
function matchesFilter(doc, filter = {}) {
  return Object.entries(filter).every(([key, condition]) => matchesCondition(doc[key], condition));
}
function fakeQuery(result) {
  const query = {
    select: () => query,
    sort: () => query,
    populate: () => query, // no-op: sembramos los planes ya "poblados"
    limit: () => query,
    lean: () => query,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject)
  };
  return query;
}
function stubModel(model, collectionName) {
  const statics = {
    findById: (id) => fakeQuery(store[collectionName].find((doc) => String(doc._id) === String(id)) || null),
    findOne: (filter) => fakeQuery(store[collectionName].find((doc) => matchesFilter(doc, filter)) || null),
    find: (filter) => fakeQuery(store[collectionName].filter((doc) => matchesFilter(doc, filter)))
  };
  for (const [name, implementation] of Object.entries(statics)) {
    const original = model[name];
    restorers.push(() => { model[name] = original; });
    model[name] = implementation;
  }
}

function seed() {
  store = {
    distributors: [
      { _id: ID.distributor, settings: { enabledModules: [] } }
    ],
    platformSubscriptions: [
      {
        _id: 'psub1',
        distributorId: ID.distributor,
        status: 'active',
        createdAt: 1,
        platformPlanId: { _id: ID.platformPlan, name: 'Plataforma', includedModules: ['conversations', 'whatsapp'] }
      }
    ],
    platformPlans: [
      { _id: ID.platformPlan, name: 'Plataforma', includedModules: ['crm'] }
    ],
    companies: [
      { _id: ID.company, distributorId: ID.distributor }
    ],
    subscriptions: [
      {
        _id: 'sub1',
        companyId: ID.company,
        status: 'active',
        createdAt: 1,
        planId: { _id: ID.commercialPlan, name: 'Comercial', includedModules: ['conversations', 'whatsapp', 'inbox'] }
      }
    ],
    moduleEntitlements: [
      // Override del distribuidor: agrega inbox, quita whatsapp.
      { _id: 'ent1', scopeType: 'distributor', scopeId: ID.distributor, moduleKey: 'inbox', enabled: true },
      { _id: 'ent2', scopeType: 'distributor', scopeId: ID.distributor, moduleKey: 'whatsapp', enabled: false }
    ]
  };
}

before(() => {
  seed();
  stubModel(Distributor, 'distributors');
  stubModel(Company, 'companies');
  stubModel(PlatformPlan, 'platformPlans');
  stubModel(PlatformSubscription, 'platformSubscriptions');
  stubModel(Subscription, 'subscriptions');
  stubModel(ModuleEntitlement, 'moduleEntitlements');
});
after(() => {
  restorers.forEach((restore) => restore());
});

test('registro: dependencias duras y recomendadas', () => {
  assert.deepEqual(moduleRequires('whatsapp'), ['conversations']);
  assert.deepEqual(moduleRequires('inbox'), ['conversations']);
  assert.ok(moduleRecommends('inbox').includes('media'));
  assert.ok(moduleRecommends('inbox').includes('realtime'));
  assert.deepEqual(resolveRequiredModules('whatsapp'), ['conversations']);
  const dependents = modulesDependingOn('conversations');
  assert.ok(dependents.includes('whatsapp'));
  assert.ok(dependents.includes('inbox'));
});

test('traceDistributor: la matriz refleja el estado efectivo (plan + override)', async () => {
  const { modules } = await traceDistributorModules(ID.distributor);
  const byKey = Object.fromEntries(modules.map((module) => [module.key, module]));

  // conversations viene del plan de plataforma.
  assert.equal(byKey.conversations.enabled, true);
  assert.equal(byKey.conversations.origin, 'platform_plan');
  // inbox lo agrega el override del distribuidor.
  assert.equal(byKey.inbox.enabled, true);
  assert.equal(byKey.inbox.origin, 'distributor_override');
  // whatsapp esta en el plan pero el override lo apaga.
  assert.equal(byKey.whatsapp.enabled, false);
  assert.equal(byKey.whatsapp.blockedBy, 'distributor_override');
  // core siempre activo.
  assert.equal(byKey.core.enabled, true);
});

test('traceCompany: interseccion con distribuidor bloquea whatsapp (no autorizado arriba)', async () => {
  const { modules } = await traceCompanyModules(ID.company);
  const byKey = Object.fromEntries(modules.map((module) => [module.key, module]));

  assert.equal(byKey.conversations.enabled, true);
  assert.equal(byKey.inbox.enabled, true);
  // whatsapp esta en el plan comercial pero el distribuidor no lo autoriza.
  assert.equal(byKey.whatsapp.enabled, false);
  assert.equal(byKey.whatsapp.blockedBy, 'distributor_gate');

  const authorized = await getCompanyAuthorizedModules(ID.company);
  assert.ok(authorized.includes('inbox'));
  assert.ok(!authorized.includes('whatsapp'));
});

test('explainModule: el diagnostico marca el eslabon que bloquea', async () => {
  const diag = await explainModuleForScope('company', ID.company, 'whatsapp');
  assert.equal(diag.found, true);
  assert.equal(diag.enabled, false);
  assert.equal(diag.blockedBy, 'distributor_gate');
  // La cadena incluye la resolucion del distribuidor y la de la empresa.
  const layers = diag.chain.map((link) => link.layer);
  assert.ok(layers.includes('platform_plan'));
  assert.ok(layers.includes('company_plan'));
  assert.ok(layers.includes('distributor_gate'));
});

test('tracePlatformPlan: incluidos por plan y por override', async () => {
  const { modules } = await tracePlatformPlanModules(ID.platformPlan);
  const byKey = Object.fromEntries(modules.map((module) => [module.key, module]));
  assert.equal(byKey.crm.enabled, true);
  assert.equal(byKey.crm.origin, 'platform_plan');
  // whatsapp no esta incluido ni tiene override en este plan.
  assert.equal(byKey.whatsapp.enabled, false);
});
