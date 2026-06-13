import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import mongoose from 'mongoose';
import { hasPermission, hasUserPermission } from '../src/core/permissions/permissions.js';
import { BookingLink } from '../src/models/BookingLink.js';
import { Contact } from '../src/models/Contact.js';
import { ContactConsent } from '../src/models/ContactConsent.js';
import { CommunicationSettings } from '../src/models/CommunicationSettings.js';
import { Form } from '../src/models/Form.js';
import { Message, MESSAGE_STATUSES } from '../src/models/Message.js';
import { SuppressionEntry } from '../src/models/SuppressionEntry.js';
import { normalizeSuppressionValue } from '../src/modules/communications/CommunicationPolicyService.js';
import {
  detectOptOutKeyword,
  evaluateCommunicationRules,
  normalizeCommunicationChannel,
  quietHoursState
} from '../src/modules/communications/communicationPolicyRules.js';

const objectId = () => new mongoose.Types.ObjectId();

test('consent is unique per tenant, contact and channel with safe optional ObjectIds', async () => {
  const consent = new ContactConsent({
    companyId: objectId(),
    contactId: objectId(),
    channel: 'whatsapp',
    status: 'unknown',
    source: 'other',
    recordedBy: ''
  });
  await consent.validate();
  assert.equal(consent.recordedBy, null);
  const settings = new CommunicationSettings({
    companyId: objectId(),
    distributorId: '',
    updatedBy: ''
  });
  await settings.validate();
  assert.equal(settings.distributorId, null);
  assert.equal(settings.updatedBy, null);
  assert.equal(
    ContactConsent.schema.indexes().some(([fields, options]) =>
      fields.companyId === 1 &&
      fields.contactId === 1 &&
      fields.channel === 1 &&
      options.unique
    ),
    true
  );
  assert.equal(
    SuppressionEntry.schema.indexes().some(([, options]) => options.unique),
    true
  );
});

test('old contacts remain unknown and commercial messages require explicit opt-in', () => {
  const oldContact = new Contact({
    companyId: objectId(),
    name: 'Contacto antiguo',
    email: 'old@example.com'
  });
  assert.equal(oldContact.communicationPreferences.globalDnd, false);
  const commercial = evaluateCommunicationRules({
    channel: 'email',
    category: 'commercial'
  });
  assert.equal(commercial.allowed, false);
  assert.equal(commercial.reasonCode, 'COMMERCIAL_OPT_IN_REQUIRED');
  const transactional = evaluateCommunicationRules({
    channel: 'email',
    category: 'transactional'
  });
  assert.equal(transactional.allowed, true);
});

test('opt-out and global DND block commercial traffic without blocking other channels', () => {
  const whatsapp = evaluateCommunicationRules({
    channel: 'whatsapp',
    category: 'commercial',
    consentStatus: 'opted_out'
  });
  const email = evaluateCommunicationRules({
    channel: 'email',
    category: 'commercial',
    consentStatus: 'opted_in'
  });
  const dnd = evaluateCommunicationRules({
    channel: 'email',
    category: 'commercial',
    consentStatus: 'opted_in',
    globalDnd: true
  });
  assert.equal(whatsapp.reasonCode, 'CHANNEL_OPTED_OUT');
  assert.equal(email.allowed, true);
  assert.equal(dnd.reasonCode, 'GLOBAL_DND');
});

test('suppression and permanent blocks return controlled policy reasons', () => {
  assert.equal(evaluateCommunicationRules({
    channel: 'sms',
    category: 'transactional',
    consentStatus: 'opted_in',
    suppressed: true
  }).reasonCode, 'SUPPRESSED');
  assert.equal(evaluateCommunicationRules({
    channel: 'sms',
    category: 'transactional',
    consentStatus: 'blocked'
  }).reasonCode, 'CONSENT_BLOCKED');
  assert.equal(evaluateCommunicationRules({
    channel: 'email',
    category: 'transactional',
    consentStatus: 'opted_in',
    permanentDeliveryFailure: true
  }).reasonCode, 'PERMANENT_DELIVERY_FAILURE');
  assert.equal(normalizeSuppressionValue('email', ' User@Example.COM '), 'user@example.com');
  assert.equal(normalizeSuppressionValue('phone', '+593 99-123-4567'), '+593991234567');
});

test('opt-out keywords require a complete normalized message', () => {
  assert.deepEqual(
    detectOptOutKeyword('  no enviar ', ['SALIR', 'NO ENVIAR'], ['SALIR TODO']),
    { keyword: 'NO ENVIAR', global: false }
  );
  assert.deepEqual(
    detectOptOutKeyword('salir todo', ['SALIR'], ['SALIR TODO']),
    { keyword: 'SALIR TODO', global: true }
  );
  assert.equal(
    detectOptOutKeyword('No enviar el documento aun', ['NO ENVIAR'], []),
    null
  );
});

test('quiet hours crossing midnight can schedule the next valid window', () => {
  const now = new Date('2026-06-15T21:00:00.000Z');
  const state = quietHoursState({
    enabled: true,
    timezone: 'UTC',
    startTime: '20:00',
    endTime: '08:00',
    days: [1],
    channels: ['whatsapp']
  }, now, 'whatsapp');
  assert.equal(state.quiet, true);
  assert.ok(state.nextAllowedAt > now);
  const policy = evaluateCommunicationRules({
    channel: 'whatsapp',
    category: 'commercial',
    consentStatus: 'opted_in',
    now,
    quietHours: {
      enabled: true,
      timezone: 'UTC',
      startTime: '20:00',
      endTime: '08:00',
      days: [1],
      channels: ['whatsapp'],
      action: 'schedule',
      allowTransactional: true
    }
  });
  assert.equal(policy.allowed, true);
  assert.equal(policy.scheduled, true);
  assert.equal(policy.reasonCode, 'QUIET_HOURS_SCHEDULED');
});

test('forms and booking store independent unchecked consent requests', async () => {
  const companyId = objectId();
  const userId = objectId();
  const form = new Form({
    companyId,
    name: 'Captura',
    slug: 'captura',
    createdBy: userId,
    fields: [{
      key: 'email_consent',
      label: 'Acepto email',
      type: 'consent',
      consentChannel: 'email',
      required: false
    }]
  });
  await form.validate();
  assert.equal(form.fields[0].consentChannel, 'email');
  assert.notEqual(form.fields[0].defaultValue, true);

  const booking = new BookingLink({
    companyId,
    calendarId: objectId(),
    slug: 'reserva-consent',
    title: 'Reserva',
    createdBy: userId,
    consentRequests: [{
      channel: 'whatsapp',
      label: 'Acepto WhatsApp',
      required: false
    }]
  });
  await booking.validate();
  assert.equal(booking.consentRequests[0].required, false);
});

test('message diagnostics preserve legacy states and add policy outcomes', async () => {
  for (const state of ['queued', 'scheduled', 'sent', 'delivered', 'read', 'failed', 'skipped', 'blocked']) {
    assert.equal(MESSAGE_STATUSES.includes(state), true);
  }
  const message = new Message({
    companyId: objectId(),
    conversationId: objectId(),
    contactId: objectId(),
    channel: 'email',
    direction: 'outbound',
    category: 'commercial',
    status: 'blocked',
    reasonCode: 'CHANNEL_OPTED_OUT',
    blockedByRule: 'CHANNEL_OPTED_OUT',
    integrationId: ''
  });
  await message.validate();
  assert.equal(message.integrationId, null);
});

test('communication permissions remain role scoped with legacy compatibility', () => {
  assert.equal(hasPermission('ADMIN', 'quiet_hours:manage'), true);
  assert.equal(hasPermission('SUPERVISOR', 'consent:manage_team'), true);
  assert.equal(hasPermission('CALLCENTER', 'consent:record_assigned'), true);
  assert.equal(hasPermission('CALLCENTER', 'quiet_hours:manage'), false);
  assert.equal(hasUserPermission({
    role: 'CALLCENTER',
    permissions: ['conversations:send_assigned']
  }, 'messages:send_transactional'), true);
});

test('all outbound entry points use the central policy and tenant routes', () => {
  const conversationService = readFileSync(
    new URL('../src/modules/conversations/ConversationService.js', import.meta.url),
    'utf8'
  );
  const forms = readFileSync(
    new URL('../src/modules/forms/FormsService.js', import.meta.url),
    'utf8'
  );
  const booking = readFileSync(
    new URL('../src/routes/publicBookingRoutes.js', import.meta.url),
    'utf8'
  );
  const integrations = readFileSync(
    new URL('../src/modules/integrations/IntegrationService.js', import.meta.url),
    'utf8'
  );
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const communicationRoutes = readFileSync(
    new URL('../src/routes/communicationRoutes.js', import.meta.url),
    'utf8'
  );
  const crmOrganizationRoutes = readFileSync(
    new URL('../src/routes/crmOrganizationRoutes.js', import.meta.url),
    'utf8'
  );
  assert.match(conversationService, /CommunicationPolicyService\.evaluate/);
  assert.match(conversationService, /processInboundOptOut/);
  assert.match(forms, /source: 'form'/);
  assert.match(booking, /source: 'booking'/);
  assert.match(integrations, /El consentimiento externo debe indicar source/);
  assert.match(app, /\/api\/communications/);
  assert.match(communicationRoutes, /assignedResourceScope\(req\.user\)/);
  assert.match(crmOrganizationRoutes, /CommunicationPolicyService\.setGlobalDnd/);
  assert.equal(normalizeCommunicationChannel('whatsapp_cloud'), 'whatsapp');
});
