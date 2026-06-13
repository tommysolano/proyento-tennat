import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  appendPublicMarketingQuery,
  publicMarketingContext,
  publicMarketingQuery
} from '../src/utils/publicMarketing.js';
import { canAccessPath } from '../src/utils/access.js';

test('public marketing context forwards allowed attribution and drops arbitrary secrets', () => {
  const context = publicMarketingContext(
    '?utm_source=google&utm_campaign=lanzamiento&campaign_id=ext-1&producto_consultado=Plan+Pro&token=secret'
  );
  assert.equal(context.utm.utm_source, 'google');
  assert.equal(context.utm.utm_campaign, 'lanzamiento');
  assert.equal(context.attribution.campaign_id, 'ext-1');
  assert.equal(context.attribution.producto_consultado, 'Plan Pro');
  assert.equal('token' in context.attribution, false);
  assert.equal('token' in publicMarketingQuery('?token=secret'), false);
  assert.match(appendPublicMarketingQuery('/f/demo/paso', '?utm_source=meta'), /utm_source=meta/);
});

test('frontend access guards require campaign, integration and reporting entitlements', () => {
  assert.equal(canAccessPath('/marketing/campaigns', {
    permissions: ['campaigns:read_team'],
    modules: ['forms']
  }), true);
  assert.equal(canAccessPath('/marketing/integrations', {
    permissions: ['integrations:read'],
    modules: ['forms']
  }), false);
  assert.equal(canAccessPath('/marketing/reports', {
    permissions: ['marketing_reports:read'],
    modules: ['forms', 'reporting']
  }), true);
});

test('marketing pages expose controlled states, mappings and CRM attribution columns', () => {
  const operations = readFileSync(
    new URL('../src/pages/marketing/MarketingOperationsPage.jsx', import.meta.url),
    'utf8'
  );
  const contacts = readFileSync(
    new URL('../src/pages/crm/ContactsPage.jsx', import.meta.url),
    'utf8'
  );
  const opportunities = readFileSync(
    new URL('../src/pages/crm/OpportunitiesPage.jsx', import.meta.url),
    'utf8'
  );
  const publicForms = readFileSync(
    new URL('../src/pages/marketing/FormsPage.jsx', import.meta.url),
    'utf8'
  );
  assert.match(operations, /CrmLoadError/);
  assert.match(operations, /No hay campanas registradas/);
  assert.match(operations, /No hay integraciones configuradas/);
  assert.match(operations, /internalEntity/);
  assert.match(contacts, /consultedProduct/);
  assert.match(contacts, /purchasedProduct/);
  assert.match(opportunities, /consultedProduct/);
  assert.match(opportunities, /purchasedProduct/);
  assert.match(publicForms, /publicMarketingContext/);
});
