import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import mongoose from 'mongoose';
import { Campaign } from '../src/models/Campaign.js';
import { Contact } from '../src/models/Contact.js';
import { FormSubmission } from '../src/models/FormSubmission.js';
import { Integration } from '../src/models/Integration.js';
import { IntegrationEvent } from '../src/models/IntegrationEvent.js';
import { Opportunity } from '../src/models/Opportunity.js';
import { IntegrationService } from '../src/modules/integrations/IntegrationService.js';
import {
  mergeMarketingAttribution,
  normalizeMarketingAttribution
} from '../src/modules/marketing/marketingAttribution.js';
import { hasPermission } from '../src/core/permissions/permissions.js';

const ids = Array.from({ length: 12 }, () => new mongoose.Types.ObjectId());

test('marketing attribution keeps external IDs as strings and normalizes optional internal IDs', () => {
  const attribution = normalizeMarketingAttribution({
    campaign_id: 'meta-campaign-123',
    ad_id: 'ad-external-9',
    form_id: '',
    integration_id: ids[1],
    utm_source: ' Meta ',
    producto_consultado: 'Plan Pro'
  });
  assert.equal(attribution.externalCampaignId, 'meta-campaign-123');
  assert.equal(attribution.externalAdId, 'ad-external-9');
  assert.equal(attribution.formId, null);
  assert.equal(String(attribution.integrationId), String(ids[1]));
  assert.equal(attribution.utmSource, 'Meta');
  assert.equal(attribution.consultedProduct, 'Plan Pro');
  assert.equal(
    normalizeMarketingAttribution(
      { campaign_name: 'Campana externa' },
      { campaignName: '', formId: ids[4] }
    ).campaignName,
    'Campana externa'
  );
  assert.throws(
    () => normalizeMarketingAttribution({ funnelId: 'not-an-object-id' }),
    /ObjectId interno valido/
  );
});

test('first-touch attribution is preserved while last interaction advances', () => {
  const first = new Date('2026-06-01T10:00:00.000Z');
  const second = new Date('2026-06-02T10:00:00.000Z');
  const merged = mergeMarketingAttribution(
    { campaignName: 'Primera', firstInteractionAt: first },
    { campaignName: 'Ultima', purchasedProduct: 'Plan anual' },
    second
  );
  assert.equal(merged.campaignName, 'Ultima');
  assert.equal(merged.firstInteractionAt.toISOString(), first.toISOString());
  assert.equal(merged.lastInteractionAt.toISOString(), second.toISOString());
  assert.equal(merged.purchasedProduct, 'Plan anual');
});

test('campaign, CRM and marketing event models share tenant attribution', async () => {
  const campaign = new Campaign({
    companyId: ids[0],
    name: 'Lanzamiento',
    channel: 'social',
    createdBy: ids[1]
  });
  await campaign.validate();

  const contact = new Contact({
    companyId: ids[0],
    name: 'Lead',
    email: 'lead@example.com',
    attribution: {
      campaignId: campaign._id,
      consultedProduct: 'Producto A',
      purchasedProduct: 'Producto B'
    }
  });
  await contact.validate();
  assert.equal(contact.attribution.consultedProduct, 'Producto A');

  const opportunity = new Opportunity({
    companyId: ids[0],
    contactId: contact._id,
    pipelineId: ids[2],
    stageId: ids[3],
    title: 'Compra',
    createdBy: ids[1],
    attribution: contact.attribution
  });
  await opportunity.validate();
  assert.equal(opportunity.attribution.purchasedProduct, 'Producto B');

  const submission = new FormSubmission({
    companyId: ids[0],
    formId: ids[4],
    utm: { utm_source: 'google' },
    attribution: { utmSource: 'google', formId: ids[4] }
  });
  await submission.validate();
  assert.equal(submission.attribution.utmSource, 'google');
});

test('integration mappings allow commercial fields and reject sensitive writes', () => {
  const mappings = IntegrationService.validateMappings([
    {
      externalField: 'lead.email',
      internalEntity: 'contact',
      internalField: 'email',
      transform: 'lowercase',
      required: true
    },
    {
      externalField: 'tracking.product',
      internalEntity: 'marketingAttribution',
      internalField: 'consultedProduct'
    },
    {
      externalField: 'lead.tags',
      internalEntity: 'contact',
      internalField: 'tags'
    }
  ]);
  assert.equal(mappings.length, 3);
  assert.throws(
    () => IntegrationService.validateMappings([{
      externalField: 'lead.password',
      internalEntity: 'contact',
      internalField: 'metadata.credentials'
    }]),
    /invalido o sensible|no permitido/
  );
  assert.throws(
    () => IntegrationService.validateMappings([{
      externalField: 'lead.email',
      internalEntity: 'contact',
      internalField: 'email',
      transform: 'execute'
    }]),
    /Transformacion/
  );
});

test('integration credentials are encrypted and event IDs deduplicate per integration', async () => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = 'test-only-section-7-encryption-key';
  const integration = new Integration({
    companyId: ids[0],
    name: 'Webhook externo',
    provider: 'inbound_webhook',
    createdBy: ids[1]
  });
  integration.setSecrets({
    webhookSecret: 'temporary-test-secret',
    credentials: { apiKey: 'temporary-test-key' }
  });
  await integration.validate();
  assert.notEqual(integration.webhookSecret, 'temporary-test-secret');
  assert.equal(integration.getDecryptedWebhookSecret(), 'temporary-test-secret');
  assert.equal(integration.getDecryptedCredentials().apiKey, 'temporary-test-key');
  assert.equal(
    IntegrationEvent.schema.indexes().some(([, options]) => options.unique),
    true
  );
});

test('marketing and integration permissions remain role constrained', () => {
  assert.equal(hasPermission('ADMIN', 'campaigns:manage'), true);
  assert.equal(hasPermission('ADMIN', 'integrations:manage'), true);
  assert.equal(hasPermission('SUPERVISOR', 'campaigns:read_team'), true);
  assert.equal(hasPermission('CALLCENTER', 'attribution:read_assigned'), true);
  assert.equal(hasPermission('CALLCENTER', 'integrations:manage'), false);
});

test('routes enforce tenant scope, signatures, payload limits and controlled failures', () => {
  const campaignRoutes = readFileSync(
    new URL('../src/routes/campaignRoutes.js', import.meta.url),
    'utf8'
  );
  const integrationRoutes = readFileSync(
    new URL('../src/routes/integrationRoutes.js', import.meta.url),
    'utf8'
  );
  const webhookRoutes = readFileSync(
    new URL('../src/routes/integrationWebhookRoutes.js', import.meta.url),
    'utf8'
  );
  const service = readFileSync(
    new URL('../src/modules/integrations/IntegrationService.js', import.meta.url),
    'utf8'
  );
  assert.match(campaignRoutes, /companyId: campaign\.companyId/);
  assert.match(campaignRoutes, /contiene recursos de otra empresa/);
  assert.match(integrationRoutes, /companyId: company\._id/);
  assert.match(integrationRoutes, /assertCompanyModule/);
  assert.match(webhookRoutes, /MAX_PAYLOAD_BYTES = 256 \* 1024/);
  assert.match(webhookRoutes, /REQUIRE_WEBHOOK_SIGNATURE/);
  assert.match(webhookRoutes, /x-tennat-signature/);
  assert.match(service, /OperationalAlertService\.create/);
  assert.match(service, /NotificationService\.create/);
  assert.match(service, /repeatedRecently/);
});

test('public form, landing and funnel routes propagate attribution to shared events', () => {
  const publicForms = readFileSync(
    new URL('../src/routes/publicFormRoutes.js', import.meta.url),
    'utf8'
  );
  const formsService = readFileSync(
    new URL('../src/modules/forms/FormsService.js', import.meta.url),
    'utf8'
  );
  const funnelService = readFileSync(
    new URL('../src/modules/funnels/FunnelService.js', import.meta.url),
    'utf8'
  );
  assert.match(publicForms, /funnelLanding/);
  assert.match(formsService, /attributionFromTracking/);
  assert.match(formsService, /contact\.attribution = mergeMarketingAttribution/);
  assert.match(formsService, /attribution,\s+metadata:/);
  assert.match(funnelService, /PageView\.create\(payload\)/);
  assert.match(funnelService, /attributionFromTracking/);
});
