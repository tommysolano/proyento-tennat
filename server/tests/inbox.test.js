import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { hasPermission } from '../src/core/permissions/permissions.js';
import {
  assertOutboundAllowed,
  contactDndStatus
} from '../src/modules/conversations/conversationValidation.js';
import { evaluateCommunicationRules } from '../src/modules/communications/communicationPolicyRules.js';
import {
  conversationScope,
  preserveAssignedScope
} from '../src/modules/conversations/conversationScope.js';

const objectId = () => new mongoose.Types.ObjectId();

test('inbox permissions preserve role boundaries', () => {
  assert.equal(hasPermission('ADMIN', 'conversations:send'), true);
  assert.equal(hasPermission('SUPERVISOR', 'conversations:send_team'), true);
  assert.equal(hasPermission('SUPERVISOR', 'conversations:assign_team'), true);
  assert.equal(hasPermission('CALLCENTER', 'conversations:send_assigned'), true);
  assert.equal(hasPermission('CALLCENTER', 'conversations:assign_team'), false);
  assert.equal(hasPermission('CALLCENTER', 'message_templates:use'), true);
});

test('conversation scopes always include company and assigned boundaries', async () => {
  const companyId = objectId();
  const adminId = objectId();
  const agentId = objectId();
  assert.deepEqual(
    await conversationScope({ role: 'ADMIN', companyId, _id: adminId }),
    { companyId }
  );
  assert.deepEqual(
    await conversationScope({ role: 'CALLCENTER', companyId, _id: agentId }),
    { companyId, assignedTo: agentId }
  );
  const allowed = objectId();
  const denied = objectId();
  assert.deepEqual(
    preserveAssignedScope({ companyId, assignedTo: { $in: [allowed] } }, allowed),
    { companyId, assignedTo: String(allowed) }
  );
  assert.deepEqual(
    preserveAssignedScope({ companyId, assignedTo: { $in: [allowed] } }, denied),
    { companyId, assignedTo: { $in: [] } }
  );
});

test('outbound validation rejects empty, closed and incomplete media messages', () => {
  const open = { status: 'open', channel: 'sms' };
  assert.throws(
    () => assertOutboundAllowed({ conversation: open, contact: {}, type: 'text' }),
    /no puede estar vacio/
  );
  assert.throws(
    () => assertOutboundAllowed({
      conversation: { status: 'closed', channel: 'sms' },
      contact: {},
      type: 'text',
      text: 'Hola'
    }),
    /Reabre/
  );
  assert.equal(evaluateCommunicationRules({
    channel: 'sms',
    category: 'commercial',
    consentStatus: 'opted_in',
    globalDnd: true
  }).reasonCode, 'GLOBAL_DND');
  assert.throws(
    () => assertOutboundAllowed({
      conversation: open,
      contact: {},
      type: 'image',
      text: ''
    }),
    /archivo o URL/
  );
  assert.doesNotThrow(() => assertOutboundAllowed({
    conversation: open,
    contact: {},
    type: 'image',
    media: { url: 'https://example.com/image.jpg' }
  }));
});

test('internal conversations are not blocked by contact DND metadata', () => {
  assert.doesNotThrow(() => assertOutboundAllowed({
    conversation: { status: 'open', channel: 'internal' },
    contact: { metadata: { optOut: true } },
    type: 'text',
    text: 'Nota operativa'
  }));
  assert.deepEqual(contactDndStatus({ metadata: { optOut: 'enabled' } }), {
    configured: true,
    active: true
  });
});
