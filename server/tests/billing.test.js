import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { hasPermission } from '../src/core/permissions/permissions.js';
import { PlatformSubscription } from '../src/models/PlatformSubscription.js';
import { Subscription } from '../src/models/Subscription.js';
import {
  assertActivePlan,
  assertBillableSubscription,
  buildSubscriptionTerms,
  invoiceBalance,
  normalizeCurrency,
  validatePaymentInput
} from '../src/utils/billing.js';

const objectId = () => new mongoose.Types.ObjectId();
const activePlan = {
  _id: objectId(),
  status: 'active',
  currency: 'USD',
  billingCycle: 'monthly'
};

test('crea terminos consistentes para una suscripcion activa', () => {
  const terms = buildSubscriptionTerms(
    { status: 'active', startsAt: '2026-06-12T00:00:00.000Z' },
    activePlan
  );
  assert.equal(terms.status, 'active');
  assert.equal(terms.currentPeriodStart.toISOString(), '2026-06-12T00:00:00.000Z');
  assert.equal(terms.currentPeriodEnd.toISOString(), '2026-07-12T00:00:00.000Z');
});

test('rechaza suscripcion sin plan o con plan inactivo', () => {
  assert.throws(() => buildSubscriptionTerms({}, null), /Plan no encontrado/);
  assert.throws(
    () => assertActivePlan({ ...activePlan, status: 'inactive' }),
    /planes activos/
  );
});

test('trial exige inicio y fin, y no puede facturarse', async () => {
  const startsAt = new Date('2026-06-12T00:00:00.000Z');
  const terms = buildSubscriptionTerms(
    {
      status: 'trial',
      startsAt,
      trialEndsAt: '2026-06-26T00:00:00.000Z'
    },
    activePlan
  );
  assert.equal(terms.currentPeriodEnd.toISOString(), '2026-06-26T00:00:00.000Z');
  assert.throws(
    () => buildSubscriptionTerms({ status: 'trial', startsAt }, activePlan),
    /trialEndsAt/
  );
  assert.throws(() => assertBillableSubscription({ status: 'trial' }), /activa/);

  const subscription = new Subscription({
    companyId: objectId(),
    distributorId: objectId(),
    planId: activePlan._id,
    status: 'trial',
    startsAt,
    trialEndsAt: new Date('2026-06-26T00:00:00.000Z')
  });
  await subscription.validate();
});

test('conversion de trial a activo abre un nuevo periodo facturable', () => {
  const current = {
    status: 'trial',
    startsAt: new Date('2026-06-01T00:00:00.000Z'),
    trialEndsAt: new Date('2026-06-12T00:00:00.000Z'),
    currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-06-12T00:00:00.000Z')
  };
  const terms = buildSubscriptionTerms(
    { status: 'active' },
    activePlan,
    { current, now: new Date('2026-06-12T12:00:00.000Z') }
  );
  assert.equal(terms.currentPeriodStart.toISOString(), '2026-06-12T12:00:00.000Z');
  assert.equal(terms.currentPeriodEnd.toISOString(), '2026-07-12T12:00:00.000Z');
  assert.doesNotThrow(() => assertBillableSubscription(terms));
});

test('pagos respetan saldo, moneda y montos positivos', () => {
  const invoice = { status: 'open', total: 100, currency: 'USD' };
  assert.deepEqual(invoiceBalance(invoice, 40), { paidAmount: 40, balanceDue: 60 });
  assert.equal(validatePaymentInput({
    invoice,
    paidAmount: 40,
    amount: 60,
    currency: 'USD'
  }).amount, 60);
  assert.throws(
    () => validatePaymentInput({ invoice, amount: 0, currency: 'USD' }),
    /mayor a 0/
  );
  assert.throws(
    () => validatePaymentInput({ invoice, amount: -1, currency: 'USD' }),
    /mayor a 0/
  );
  assert.throws(
    () => validatePaymentInput({ invoice, paidAmount: 40, amount: 61, currency: 'USD' }),
    /saldo pendiente/
  );
  assert.throws(
    () => validatePaymentInput({ invoice, amount: 10, currency: 'EUR' }),
    /moneda/
  );
  assert.equal(normalizeCurrency('usd'), 'USD');
  assert.throws(() => normalizeCurrency('ZZZ'), /ISO 4217/);
});

test('modelos trial aplican validacion defensiva', async () => {
  const invalid = new PlatformSubscription({
    distributorId: objectId(),
    platformPlanId: objectId(),
    status: 'trial'
  });
  await assert.rejects(() => invalid.validate(), /trialEndsAt/);
});

test('rutas comerciales conservan scope multi-tenant y exigen suscripcion para facturar', () => {
  const subscriptions = readFileSync(
    new URL('../src/routes/subscriptionRoutes.js', import.meta.url),
    'utf8'
  );
  const distributor = readFileSync(
    new URL('../src/routes/distributorCommercialRoutes.js', import.meta.url),
    'utf8'
  );
  const platform = readFileSync(
    new URL('../src/routes/superAdminRoutes.js', import.meta.url),
    'utf8'
  );
  const plans = readFileSync(
    new URL('../src/routes/planRoutes.js', import.meta.url),
    'utf8'
  );
  assert.match(subscriptions, /Company\.findOne\(\{ _id: companyId, distributorId \}\)/);
  assert.match(subscriptions, /Plan\.findOne\(\{ _id: planId, distributorId \}\)/);
  assert.match(distributor, /subscriptionId valido es requerido/);
  assert.match(distributor, /companyId: company\._id,\s+distributorId/);
  assert.match(platform, /distributorId: distributor\._id/);
  assert.match(platform, /assertBillableSubscription\(subscription\)/);
  assert.match(plans, /checkModuleAccess\(moduleKey, user\)/);
});

test('permisos de billing respetan las fronteras de rol', () => {
  assert.equal(hasPermission('SUPERADMIN', 'platform_billing:manage'), true);
  assert.equal(hasPermission('DISTRIBUTOR', 'company_payments:manage'), true);
  assert.equal(hasPermission('ADMIN', 'company_billing:read'), true);
  assert.equal(hasPermission('ADMIN', 'company_payments:manage'), false);
  assert.equal(hasPermission('SUPERVISOR', 'company_billing:read'), false);
  assert.equal(hasPermission('CALLCENTER', 'company_billing:read'), false);
});
