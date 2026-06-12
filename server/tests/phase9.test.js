import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { hasPermission } from '../src/core/permissions/permissions.js';
import { MODULE_REGISTRY } from '../src/core/modules/moduleRegistry.js';
import { ActivityLog } from '../src/models/ActivityLog.js';
import { ConversionEvent } from '../src/models/ConversionEvent.js';
import { Form } from '../src/models/Form.js';
import { FormSubmission } from '../src/models/FormSubmission.js';
import { Funnel } from '../src/models/Funnel.js';
import { FunnelStep } from '../src/models/FunnelStep.js';
import { LandingPage } from '../src/models/LandingPage.js';
import { Notification } from '../src/models/Notification.js';
import { PageView } from '../src/models/PageView.js';
import { Plan } from '../src/models/Plan.js';
import { PlatformPlan } from '../src/models/PlatformPlan.js';
import { FormsService } from '../src/modules/forms/FormsService.js';
import { FunnelService } from '../src/modules/funnels/FunnelService.js';
import {
  createSubmissionToken,
  hashPublicValue,
  isSafeMarketingKey,
  parseSubmissionToken,
  safePublicUrl,
  sanitizeLimitedHtml,
  sanitizeMarketingValue,
  slugifyPublic
} from '../src/modules/marketing/marketingSecurity.js';
import {
  PLANNED_ACTIONS,
  WORKFLOW_TRIGGERS
} from '../src/modules/workflows/workflowCatalog.js';
import {
  normalizeOptionalObjectId,
  normalizeOptionalObjectIdArray
} from '../src/utils/validation.js';

const objectId = () => new mongoose.Types.ObjectId();

function formDocument(overrides = {}) {
  return new Form({
    companyId: objectId(),
    name: 'Captura web',
    slug: 'captura-web',
    createdBy: objectId(),
    fields: [
      { key: 'email', label: 'Email', type: 'email', required: true, order: 0 },
      {
        key: 'interest',
        label: 'Interes',
        type: 'select',
        options: ['CRM', 'Inbox'],
        order: 1
      },
      { key: 'consent', label: 'Acepto', type: 'consent', required: true, order: 2 }
    ],
    settings: {
      createContact: true,
      requireConsent: true,
      spamProtection: true,
      minimumSubmitTimeMs: 1500
    },
    ...overrides
  });
}

test('phase 9 modules and permissions preserve role boundaries', () => {
  for (const key of ['forms', 'surveys', 'landing_pages', 'funnels']) {
    const module = MODULE_REGISTRY.find((item) => item.key === key);
    assert.equal(module?.status, 'active');
    assert.equal(module?.enabledByDefault, true);
  }
  assert.equal(hasPermission('ADMIN', 'forms:manage'), true);
  assert.equal(hasPermission('ADMIN', 'landing_pages:manage'), true);
  assert.equal(hasPermission('ADMIN', 'funnels:manage'), true);
  assert.equal(hasPermission('SUPERVISOR', 'forms:read_team'), true);
  assert.equal(hasPermission('SUPERVISOR', 'funnels:read_team'), true);
  assert.equal(hasPermission('SUPERVISOR', 'forms:manage'), false);
  assert.equal(hasPermission('CALLCENTER', 'forms:read_team'), false);
  assert.equal(hasPermission('DISTRIBUTOR', 'funnels:manage'), false);
});

test('public marketing security normalizes slugs, blocks dangerous keys and sanitizes content', () => {
  assert.equal(slugifyPublic('  Campaña Única 2026! '), 'campana-unica-2026');
  assert.equal(isSafeMarketingKey('lead_email'), true);
  assert.equal(isSafeMarketingKey('__proto__'), false);
  assert.equal(isSafeMarketingKey('constructor'), false);
  assert.equal(safePublicUrl('javascript:alert(1)'), '');
  assert.equal(safePublicUrl('/gracias'), '/gracias');
  assert.equal(
    sanitizeLimitedHtml('<p onclick="x()">Seguro</p><script>alert(1)</script>'),
    '<p>Seguro</p>'
  );
  assert.deepEqual(
    sanitizeMarketingValue({
      name: '<b>Ana</b>',
      __proto__: 'blocked',
      nested: { constructor: 'blocked', city: 'Quito' }
    }),
    { name: 'Ana', nested: { city: 'Quito' } }
  );
  const hash = hashPublicValue('203.0.113.9');
  assert.equal(hash.length, 64);
  assert.equal(hash.includes('203.0.113.9'), false);
});

test('submission tokens support minimum-time anti-spam without exposing a secret', () => {
  const formId = objectId();
  const issuedAt = Date.now() - 2000;
  const token = createSubmissionToken(formId, issuedAt);
  assert.deepEqual(parseSubmissionToken(token, formId), {
    formId: String(formId),
    issuedAt
  });
  assert.equal(parseSubmissionToken(`${token}x`, formId), null);
  assert.equal(parseSubmissionToken(token, objectId()), null);
  const form = formDocument({ _id: formId });
  assert.deepEqual(
    FormsService.spamCheck(form, { submissionToken: token }),
    { spam: false, score: 0, reason: '' }
  );
  assert.equal(
    FormsService.spamCheck(form, { submissionToken: token, website: 'bot' }).reason,
    'honeypot'
  );
});

test('forms validate dynamic fields and normalize safe public submissions', async () => {
  const form = formDocument();
  await form.validate();
  const values = FormsService.normalizeValues(form, {
    email: 'USER@EXAMPLE.COM',
    interest: 'CRM',
    consent: true,
    ignored: '<script>alert(1)</script>'
  });
  assert.deepEqual(values, {
    email: 'user@example.com',
    interest: 'CRM',
    consent: true
  });
  assert.throws(
    () => FormsService.normalizeValues(form, {
      email: 'invalid',
      interest: 'Otra',
      consent: false
    }),
    /email valido.*opcion invalida.*consentimiento/i
  );
  const duplicate = formDocument({
    slug: 'duplicado',
    fields: [
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'email', label: 'Email 2', type: 'text' }
    ]
  });
  await assert.rejects(duplicate.validate(), /Campo duplicado/);
});

test('optional marketing ObjectIds normalize blank strings before validation', async () => {
  assert.equal(normalizeOptionalObjectId(''), null);
  assert.equal(normalizeOptionalObjectId('   '), null);
  assert.deepEqual(
    normalizeOptionalObjectIdArray(['', '507f1f77bcf86cd799439011', null]),
    ['507f1f77bcf86cd799439011']
  );

  const form = formDocument({
    settings: {
      assignTo: '',
      pipelineId: '',
      stageId: '',
      bookingLinkId: ''
    }
  });
  await form.validate();
  assert.equal(form.settings.assignTo, null);
  assert.equal(form.settings.pipelineId, null);
  assert.equal(form.settings.stageId, null);
  assert.equal(form.settings.bookingLinkId, null);

  const companyId = objectId();
  const userId = objectId();
  const page = new LandingPage({
    companyId,
    name: 'Landing',
    slug: 'landing-vacia',
    title: 'Landing',
    createdBy: userId,
    settings: { associatedFormId: '', associatedBookingLinkId: '' }
  });
  await page.validate();
  assert.equal(page.settings.associatedFormId, null);
  assert.equal(page.settings.associatedBookingLinkId, null);

  const funnel = new Funnel({
    companyId,
    name: 'Ventas',
    slug: 'ventas-vacio',
    createdBy: userId,
    settings: { entryStepId: '' }
  });
  await funnel.validate();
  assert.equal(funnel.settings.entryStepId, null);

  const step = new FunnelStep({
    companyId,
    funnelId: funnel._id,
    name: 'Inicio',
    slug: 'inicio',
    createdBy: userId,
    landingPageId: '',
    formId: '',
    bookingLinkId: '',
    satisfactionSurveyId: '',
    settings: { nextStepId: '' }
  });
  await step.validate();
  assert.equal(step.landingPageId, null);
  assert.equal(step.formId, null);
  assert.equal(step.bookingLinkId, null);
  assert.equal(step.satisfactionSurveyId, null);
  assert.equal(step.settings.nextStepId, null);

  await assert.rejects(
    FunnelService.createFunnel({
      actor: { _id: userId, companyId, distributorId: null },
      body: {
        name: 'Invalido',
        slug: 'invalido',
        settings: { entryStepId: objectId() }
      }
    }),
    /despues de crear steps/
  );
});

test('landing, funnel, tracking and conversion schemas sanitize and enforce public identifiers', async () => {
  const companyId = objectId();
  const userId = objectId();
  const page = new LandingPage({
    companyId,
    name: 'Demo',
    slug: 'demo-publica',
    title: 'Demo',
    createdBy: userId,
    content: {
      sections: [{
        type: 'custom_html_limited',
        content: { html: '<p onmouseover="x()">Hola</p><script>x()</script>' }
      }]
    }
  });
  await page.validate();
  assert.equal(page.content.sections[0].content.html, '<p>Hola</p>');

  await new Funnel({
    companyId,
    name: 'Ventas',
    slug: 'ventas',
    createdBy: userId
  }).validate();
  await new FunnelStep({
    companyId,
    funnelId: objectId(),
    name: 'Captura',
    slug: 'captura',
    type: 'form',
    createdBy: userId
  }).validate();
  await assert.rejects(
    new FunnelStep({
      companyId,
      funnelId: objectId(),
      name: 'Captura',
      slug: 'Slug Invalido',
      createdBy: userId
    }).validate(),
    /slug/i
  );

  const ipHash = hashPublicValue('198.51.100.10');
  await new PageView({ companyId, ipHash, path: '/p/demo-publica' }).validate();
  await new ConversionEvent({
    companyId,
    type: 'form_submission',
    metadata: { token: 'hidden', label: 'Demo' }
  }).validate();
  const submission = new FormSubmission({
    companyId,
    formId: objectId(),
    ipHash,
    values: { name: '<script>x()</script>Ana', password: 'not-stored' }
  });
  await submission.validate();
  assert.equal(submission.values.name, 'Ana');
  assert.equal('password' in submission.values, false);
});

test('phase 9 catalog, notifications, activity and limits expose the implemented surface', async () => {
  for (const eventType of [
    'form.created',
    'form.published',
    'form.submitted',
    'form.submission_processed',
    'form.spam_detected',
    'survey.submitted',
    'landing_page.published',
    'landing_page.viewed',
    'funnel.published',
    'funnel.step_viewed',
    'funnel.conversion'
  ]) {
    assert.equal(WORKFLOW_TRIGGERS.some((item) => item.eventType === eventType), true);
  }
  for (const actionType of [
    'form.send_confirmation_email',
    'funnel.redirect',
    'webhook.external_call'
  ]) {
    assert.equal(PLANNED_ACTIONS.some((item) => item.type === actionType), true);
  }

  const companyId = objectId();
  const userId = objectId();
  await new Notification({
    companyId,
    userId,
    type: 'form_submission_received',
    title: 'Nuevo envio'
  }).validate();
  await new ActivityLog({
    companyId,
    userId,
    type: 'conversion_recorded',
    summary: 'Conversion registrada'
  }).validate();
  const plan = new Plan({
    distributorId: objectId(),
    name: 'Growth',
    code: 'growth',
    price: 99,
    limits: {
      forms: 20,
      formSubmissionsPerMonth: 5000,
      landingPages: 10,
      funnels: 5,
      funnelSteps: 25,
      pageViewsPerMonth: 100000
    }
  });
  await plan.validate();
  assert.equal(plan.limits.formSubmissionsPerMonth, 5000);
  const platformPlan = new PlatformPlan({
    name: 'Platform Growth',
    code: 'platform-growth',
    price: 199,
    limits: { forms: 100, funnels: 25 }
  });
  await platformPlan.validate();
  assert.equal(platformPlan.limits.funnels, 25);
});
