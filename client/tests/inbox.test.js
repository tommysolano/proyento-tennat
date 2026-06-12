import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildInboxAppointmentPayload,
  contactDndStatus,
  mergeById,
  templatesForConversation,
  validateMessageDraft
} from '../src/utils/inbox.js';

test('message refresh merges by id without duplicating optimistic or realtime entries', () => {
  const result = mergeById(
    [{ _id: 'm1', text: 'pendiente', createdAt: '2026-01-01T10:00:00.000Z' }],
    [
      { _id: 'm1', text: 'enviado', createdAt: '2026-01-01T10:00:00.000Z' },
      { _id: 'm2', text: 'respuesta', createdAt: '2026-01-01T10:01:00.000Z' }
    ]
  );
  assert.deepEqual(result.map((item) => item._id), ['m1', 'm2']);
  assert.equal(result[0].text, 'enviado');
});

test('quick replies remain separate from provider templates and respect channel/status', () => {
  const templates = [
    { _id: 'q1', name: 'Hola', type: 'quick_reply', channel: 'whatsapp_cloud', status: 'active' },
    { _id: 'q2', name: 'Interna', type: 'quick_reply', channel: 'internal', status: 'active' },
    { _id: 'q3', name: 'Borrador', type: 'quick_reply', channel: 'whatsapp_cloud', status: 'draft' },
    { _id: 'p1', name: 'Proveedor', type: 'whatsapp_template', channel: 'whatsapp_cloud', status: 'active' },
    { _id: 'p2', name: 'Email', type: 'email_template', channel: 'email', status: 'active' }
  ];
  const groups = templatesForConversation(templates, 'whatsapp_cloud');
  assert.deepEqual(groups.quickReplies.map((item) => item._id), ['q1', 'q2']);
  assert.deepEqual(groups.providerTemplates.map((item) => item._id), ['p1']);
});

test('composer rejects empty, closed, DND and incomplete media messages', () => {
  assert.match(validateMessageDraft({ type: 'text' }), /Escribe un mensaje/);
  assert.match(
    validateMessageDraft({ text: 'Hola', conversationStatus: 'closed' }),
    /Reabre/
  );
  assert.match(
    validateMessageDraft({ text: 'Hola', dndActive: true, channel: 'sms' }),
    /No molestar/
  );
  assert.match(
    validateMessageDraft({ type: 'image', conversationStatus: 'open' }),
    /archivo o indica una URL/
  );
  assert.equal(
    validateMessageDraft({
      type: 'text',
      templateId: 'template-1',
      conversationStatus: 'open'
    }),
    ''
  );
});

test('appointment payload preserves conversation context and contact relation', () => {
  const payload = buildInboxAppointmentPayload({
    conversation: {
      _id: 'conversation-1',
      contactId: { _id: 'contact-1' }
    },
    calendar: {
      _id: 'calendar-1',
      ownerUserId: { _id: 'user-1', name: 'Ana' },
      teamUserIds: [],
      settings: { appointmentDurationMinutes: 45 }
    },
    actorId: 'user-1',
    title: ' Seguimiento ',
    startAt: '2026-07-01T10:00:00.000Z'
  });
  assert.equal(payload.contactId, 'contact-1');
  assert.equal(payload.assignedTo, 'user-1');
  assert.equal(payload.title, 'Seguimiento');
  assert.equal(payload.source, 'inbox');
  assert.equal(payload.metadata.conversationId, 'conversation-1');
  assert.equal(
    new Date(payload.endAt).getTime() - new Date(payload.startAt).getTime(),
    45 * 60 * 1000
  );
});

test('DND reads existing metadata without inventing a required contact field', () => {
  assert.deepEqual(contactDndStatus({ metadata: {} }), {
    configured: false,
    active: false
  });
  assert.deepEqual(contactDndStatus({ metadata: { preferences: { doNotDisturb: true } } }), {
    configured: true,
    active: true
  });
});

