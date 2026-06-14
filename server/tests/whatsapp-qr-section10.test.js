import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import mongoose from 'mongoose';
import { hasPermission, hasUserPermission } from '../src/core/permissions/permissions.js';
import { ChannelConfig } from '../src/models/ChannelConfig.js';
import { Conversation, CONVERSATION_CHANNELS } from '../src/models/Conversation.js';
import { Message } from '../src/models/Message.js';
import {
  WhatsAppSession,
  WHATSAPP_SESSION_STATUSES
} from '../src/models/WhatsAppSession.js';
import { canonicalChannel, getChannelAdapter } from '../src/modules/conversations/adapters/index.js';
import { WhatsAppQrSessionManager } from '../src/modules/conversations/WhatsAppQrSessionManager.js';
import {
  normalizeQrInboundMessage,
  phoneFromJid
} from '../src/modules/conversations/whatsappQrMessage.js';
import { normalizeCommunicationChannel } from '../src/modules/communications/communicationPolicyRules.js';

const objectId = () => new mongoose.Types.ObjectId();
process.env.CREDENTIALS_ENCRYPTION_KEY ||= 'section-10-test-key-with-more-than-32-characters';

test('WhatsApp QR models are tenant scoped, encrypted and reject blank required IDs', async () => {
  const session = new WhatsAppSession({
    companyId: objectId(),
    distributorId: '',
    integrationId: objectId(),
    name: 'Atencion',
    createdBy: objectId()
  });
  session.setSerializedAuthState('{"creds":{"registered":false}}');
  session.setEncryptedConfig({ allowGroups: false });
  await session.validate();
  assert.equal(session.distributorId, null);
  assert.equal(session.authStateConfigured, true);
  assert.equal(session.getSerializedAuthState(), '{"creds":{"registered":false}}');
  assert.equal(session.getEncryptedConfig().allowGroups, false);
  const safe = session.toJSON();
  assert.equal('authState' in safe, false);
  assert.equal('encryptedConfig' in safe, false);
  assert.equal('internalId' in safe, false);

  const invalid = new WhatsAppSession({
    companyId: '',
    integrationId: '',
    name: 'Invalida',
    createdBy: ''
  });
  await assert.rejects(invalid.validate(), /Cast to ObjectId failed|required/);

  const indexes = WhatsAppSession.schema.indexes();
  assert.equal(
    indexes.some(([fields, options]) =>
      fields.companyId === 1 && fields.integrationId === 1 && options.unique
    ),
    true
  );
  assert.equal(
    indexes.some(([fields, options]) =>
      fields.companyId === 1 && fields.name === 1 && options.unique
    ),
    true
  );
});

test('Cloud and QR coexist as separate providers and external identifiers are integration scoped', () => {
  assert.equal(ChannelConfig.schema.path('channel').enumValues.includes('whatsapp_cloud'), true);
  assert.equal(ChannelConfig.schema.path('channel').enumValues.includes('whatsapp_qr'), true);
  assert.equal(CONVERSATION_CHANNELS.includes('whatsapp_cloud'), true);
  assert.equal(CONVERSATION_CHANNELS.includes('whatsapp_qr'), true);
  assert.equal(canonicalChannel('whatsapp_qr'), 'whatsapp_qr');
  assert.equal(normalizeCommunicationChannel('whatsapp_qr'), 'whatsapp');
  assert.equal(getChannelAdapter('whatsapp_qr').constructor.name, 'WhatsAppQrAdapter');
  assert.equal(
    Message.schema.indexes().some(([fields, options]) =>
      fields.companyId === 1 &&
      fields.provider === 1 &&
      fields.channelConfigId === 1 &&
      fields.externalMessageId === 1 &&
      options.unique
    ),
    true
  );
  assert.equal(
    Conversation.schema.indexes().some(([fields]) =>
      fields.companyId === 1 &&
      fields.provider === 1 &&
      fields.channelConfigId === 1
    ),
    true
  );
});

test('QR inbound messages normalize tenant-safe phone, text, media and provider metadata', () => {
  const normalized = normalizeQrInboundMessage({
    key: {
      id: 'message-1',
      remoteJid: '593991234567:4@s.whatsapp.net',
      fromMe: false
    },
    pushName: 'Cliente',
    messageTimestamp: 1770000000,
    message: {
      imageMessage: {
        caption: 'Comprobante',
        mimetype: 'image/jpeg',
        fileLength: 1200
      }
    }
  });
  assert.equal(phoneFromJid('593991234567:4@s.whatsapp.net'), '593991234567');
  assert.equal(normalized.provider, 'whatsapp_qr');
  assert.equal(normalized.channel, 'whatsapp_qr');
  assert.equal(normalized.type, 'image');
  assert.equal(normalized.text, 'Comprobante');
  assert.equal(normalized.mediaDescriptor.mimeType, 'image/jpeg');
  assert.equal(normalized.providerPayload.key.id, 'message-1');
});

test('QR permissions let agents send but never administer sessions', () => {
  assert.equal(hasPermission('ADMIN', 'whatsapp_sessions:create'), true);
  assert.equal(hasPermission('ADMIN', 'whatsapp_sessions:delete_auth'), true);
  assert.equal(hasPermission('SUPERVISOR', 'whatsapp_connections:read'), true);
  assert.equal(hasPermission('CALLCENTER', 'whatsapp_messages:send'), true);
  assert.equal(hasPermission('CALLCENTER', 'whatsapp_connections:read'), false);
  assert.equal(hasPermission('CALLCENTER', 'whatsapp_sessions:disconnect'), false);
  assert.equal(hasPermission('DISTRIBUTOR', 'whatsapp_sessions:manage_companies'), true);
  assert.equal(
    hasUserPermission({
      role: 'CALLCENTER',
      permissions: ['conversations:send_assigned']
    }, 'whatsapp_messages:send'),
    true
  );
});

test('QR runtime is safely disabled by default and expired QR values are discarded', async () => {
  const previous = process.env.WHATSAPP_QR_ENABLED;
  process.env.WHATSAPP_QR_ENABLED = 'false';
  await assert.rejects(
    WhatsAppQrSessionManager.connect(objectId()),
    (error) => error.code === 'WHATSAPP_QR_DISABLED' && error.status === 503
  );
  if (previous === undefined) delete process.env.WHATSAPP_QR_ENABLED;
  else process.env.WHATSAPP_QR_ENABLED = previous;

  const sessionId = String(objectId());
  WhatsAppQrSessionManager.qrCodes.set(sessionId, {
    dataUrl: 'data:image/png;base64,temporary',
    generatedAt: new Date(Date.now() - 120000),
    expiresAt: new Date(Date.now() - 60000)
  });
  assert.equal(WhatsAppQrSessionManager.getQr(sessionId), null);
  assert.equal(WhatsAppQrSessionManager.qrCodes.has(sessionId), false);
});

test('section 10 routes preserve tenant checks, confirmations, policy and Cloud webhook isolation', () => {
  const routes = readFileSync(
    new URL('../src/routes/whatsappSessionRoutes.js', import.meta.url),
    'utf8'
  );
  const manager = readFileSync(
    new URL(
      '../src/modules/conversations/WhatsAppQrSessionManager.js',
      import.meta.url
    ),
    'utf8'
  );
  const conversationService = readFileSync(
    new URL('../src/modules/conversations/ConversationService.js', import.meta.url),
    'utf8'
  );
  const webhookRoutes = readFileSync(
    new URL('../src/routes/webhookRoutes.js', import.meta.url),
    'utf8'
  );
  assert.match(routes, /companyId: company\._id/);
  assert.match(routes, /confirmation.*session\.name/);
  assert.match(routes, /whatsapp_sessions:view_qr/);
  assert.match(manager, /runtimeLease/);
  assert.match(manager, /WHATSAPP_QR_MAX_RECONNECT_ATTEMPTS/);
  assert.match(manager, /restoreSessions/);
  assert.match(manager, /mediaMaxBytes/);
  assert.match(conversationService, /CommunicationPolicyService\.evaluate/);
  assert.match(conversationService, /whatsapp_messages:send/);
  assert.match(webhookRoutes, /channel: 'whatsapp_cloud'/);
  for (const status of [
    'disconnected',
    'initializing',
    'qr_pending',
    'authenticating',
    'connected',
    'reconnecting',
    'degraded',
    'failed',
    'logged_out'
  ]) {
    assert.equal(WHATSAPP_SESSION_STATUSES.includes(status), true);
  }
});
