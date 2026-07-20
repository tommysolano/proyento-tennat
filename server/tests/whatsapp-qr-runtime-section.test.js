import assert from 'node:assert/strict';
import test from 'node:test';

process.env.CREDENTIALS_ENCRYPTION_KEY =
  process.env.CREDENTIALS_ENCRYPTION_KEY || 'test-key-para-qr-runtime-0123456789ab';

const { WhatsAppQrSessionManager, isVoiceNote } = await import(
  '../src/modules/conversations/WhatsAppQrSessionManager.js'
);
const { ConversationService } = await import('../src/modules/conversations/ConversationService.js');
const { Message } = await import('../src/models/Message.js');
const { WhatsAppSession } = await import('../src/models/WhatsAppSession.js');
const { ChannelConfig } = await import('../src/models/ChannelConfig.js');

// --- Punto 6: nota de voz (ptt) ---

test('isVoiceNote detecta opus/ogg o ptt explicito', () => {
  assert.equal(isVoiceNote({ ptt: true }, 'audio/mp4'), true);
  assert.equal(isVoiceNote({}, 'audio/ogg; codecs=opus'), true);
  assert.equal(isVoiceNote({}, 'audio/opus'), true);
  assert.equal(isVoiceNote({}, 'audio/mpeg'), false);
  assert.equal(isVoiceNote(null, ''), false);
});

// --- Punto 3: salud, deteccion de socket muerto ---

test('socketLooksDead solo marca muerto un WS cerrado/cerrandose o ausente', () => {
  const manager = WhatsAppQrSessionManager;
  assert.equal(manager.socketLooksDead(null), true);
  assert.equal(manager.socketLooksDead({}), true); // sin ws
  assert.equal(manager.socketLooksDead({ ws: { readyState: 1 } }), false); // OPEN
  assert.equal(manager.socketLooksDead({ ws: { readyState: 2 } }), true); // CLOSING
  assert.equal(manager.socketLooksDead({ ws: { readyState: 3 } }), true); // CLOSED
});

// --- Punto 2: watchdog de sincronizacion colgada ---

test('handleSyncStuck reinicia el runtime conservando authState y agota reintentos', async (t) => {
  const manager = WhatsAppQrSessionManager;
  const SESSION_ID = 'ffffffffffffffffffff0001';
  const original = {
    findById: WhatsAppSession.findById,
    connect: manager.connect,
    updateSession: manager.updateSession,
    closeRuntime: manager.closeRuntime,
    channelUpdate: ChannelConfig.updateOne
  };
  const connectCalls = [];
  const updates = [];
  WhatsAppSession.findById = () => ({
    then: (resolve) => resolve({ _id: SESSION_ID, status: 'authenticating', companyId: 'c1', integrationId: 'i1' })
  });
  manager.connect = async (id, opts) => { connectCalls.push({ id, opts }); return {}; };
  manager.updateSession = async (id, values) => { updates.push(values); return { _id: id, ...values }; };
  manager.closeRuntime = async () => {};
  ChannelConfig.updateOne = async () => ({ modifiedCount: 1 });
  manager.syncRetries.delete(String(SESSION_ID));
  t.after(() => {
    WhatsAppSession.findById = original.findById;
    manager.connect = original.connect;
    manager.updateSession = original.updateSession;
    manager.closeRuntime = original.closeRuntime;
    ChannelConfig.updateOne = original.channelUpdate;
    manager.syncRetries.delete(String(SESSION_ID));
  });

  // Primer atasco: reinicia conservando authState (forceRestart).
  await manager.handleSyncStuck(SESSION_ID);
  assert.equal(connectCalls.length, 1);
  assert.equal(connectCalls[0].opts.forceRestart, true);
  assert.equal(manager.syncRetries.get(String(SESSION_ID)), 1);

  // Agotados los reintentos: estado error, sin nuevo connect.
  manager.syncRetries.set(String(SESSION_ID), 3);
  await manager.handleSyncStuck(SESSION_ID);
  assert.equal(connectCalls.length, 1, 'no debe reintentar tras agotar');
  const errorUpdate = updates.find((value) => value.status === 'error');
  assert.ok(errorUpdate, 'debe marcar estado error');
  assert.match(errorUpdate.lastError, /atasco|atasc/);
});

test('handleSyncStuck no hace nada si la sesion ya avanzo (no authenticating)', async (t) => {
  const manager = WhatsAppQrSessionManager;
  const original = { findById: WhatsAppSession.findById, connect: manager.connect };
  let connectCalled = false;
  WhatsAppSession.findById = () => ({ then: (resolve) => resolve({ _id: 'x', status: 'connected' }) });
  manager.connect = async () => { connectCalled = true; };
  t.after(() => {
    WhatsAppSession.findById = original.findById;
    manager.connect = original.connect;
  });
  await manager.handleSyncStuck('x');
  assert.equal(connectCalled, false);
});

// --- Punto 4: dedupe de fromMe (no re-registrar lo que envio la app) ---

test('recordOutboundEcho deduplica por externalMessageId (no crea duplicado)', async (t) => {
  const original = { findOne: Message.findOne, create: Message.create };
  Message.findOne = async () => ({ _id: 'existing', status: 'sent' });
  Message.create = async () => { throw new Error('no debe crear un duplicado'); };
  t.after(() => { Message.findOne = original.findOne; Message.create = original.create; });

  const result = await ConversationService.recordOutboundEcho({
    conversation: { companyId: 'c1', channelConfigId: 'cfg1', channel: 'whatsapp_qr', _id: 'conv1' },
    normalized: { externalMessageId: 'WAID123', provider: 'whatsapp_qr' }
  });
  assert.equal(result.duplicate, true);
  assert.equal(result.message._id, 'existing');
});
