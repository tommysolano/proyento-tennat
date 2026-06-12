import test from 'node:test';
import assert from 'node:assert/strict';
import {
  paymentDefaults,
  subscriptionPayload
} from '../src/utils/billing.js';

test('subscriptionPayload omite ObjectId y fechas opcionales vacias', () => {
  const payload = subscriptionPayload({
    companyId: 'company-1',
    planId: 'plan-1',
    status: 'active',
    startsAt: '2026-06-12T10:00'
  });
  assert.deepEqual(payload, {
    companyId: 'company-1',
    planId: 'plan-1',
    status: 'active',
    startsAt: new Date('2026-06-12T10:00').toISOString()
  });
});

test('subscriptionPayload exige fin de trial', () => {
  assert.throws(
    () => subscriptionPayload({ planId: 'plan-1', status: 'trial', startsAt: '2026-06-12' }),
    /fin de trial/
  );
});

test('paymentDefaults precarga saldo y moneda de la factura', () => {
  const defaults = paymentDefaults(
    { number: 'FAC-1', total: 100, balanceDue: 35.5, currency: 'EUR' },
    'Empresa Uno'
  );
  assert.equal(defaults.amount, '35.5');
  assert.equal(defaults.currency, 'EUR');
  assert.match(defaults.description, /FAC-1/);
  assert.match(defaults.description, /Empresa Uno/);
});
