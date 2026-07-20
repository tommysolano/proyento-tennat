import assert from 'node:assert/strict';
import test from 'node:test';

process.env.CREDENTIALS_ENCRYPTION_KEY =
  process.env.CREDENTIALS_ENCRYPTION_KEY || 'test-key-para-qr-hardening-0123456789';

const { isOperationalReasonCode, OPERATIONAL_REASON_CODES } = await import(
  '../src/core/operationalErrors.js'
);
const { whatsappQrConfigStatus } = await import('../src/modules/conversations/whatsappQrConfig.js');
const { Message } = await import('../src/models/Message.js');
const { ChannelConfig } = await import('../src/models/ChannelConfig.js');
const { WhatsAppSession } = await import('../src/models/WhatsAppSession.js');
const { WhatsAppQrSessionManager } = await import(
  '../src/modules/conversations/WhatsAppQrSessionManager.js'
);

// --- Punto 1: reasonCodes operativos ---

test('isOperationalReasonCode reconoce codigos operativos y rechaza el resto', () => {
  assert.equal(isOperationalReasonCode('WHATSAPP_QR_DISABLED'), true);
  assert.equal(isOperationalReasonCode('MEDIA_TOO_LARGE'), true);
  assert.equal(isOperationalReasonCode('CREDENTIALS_ENCRYPTION_KEY_MISSING'), true);
  assert.equal(isOperationalReasonCode('ALGO_INTERNO'), false);
  assert.equal(isOperationalReasonCode(11000), false);
  assert.equal(isOperationalReasonCode(undefined), false);
  assert.ok(OPERATIONAL_REASON_CODES.has('WHATSAPP_QR_SESSION_BUSY'));
});

test('el error handler conserva el mensaje operativo aunque el status sea 5xx (logica)', () => {
  // Reproduce la decision del handler de app.js.
  const decide = (status, code, env) => {
    const operational = isOperationalReasonCode(code);
    return status >= 500 && env === 'production' && !operational;
  };
  // 503 WHATSAPP_QR_DISABLED en produccion: NO se enmascara.
  assert.equal(decide(503, 'WHATSAPP_QR_DISABLED', 'production'), false);
  // 500 generico en produccion: SI se enmascara.
  assert.equal(decide(500, undefined, 'production'), true);
  // 500 generico en desarrollo: no se enmascara.
  assert.equal(decide(500, undefined, 'development'), false);
});

// --- Punto 1: estado de configuracion QR para health ---

test('whatsappQrConfigStatus refleja enabled + clave de cifrado', () => {
  const prevEnabled = process.env.WHATSAPP_QR_ENABLED;
  const prevKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
  try {
    process.env.WHATSAPP_QR_ENABLED = 'false';
    let status = whatsappQrConfigStatus();
    assert.equal(status.enabled, false);
    assert.equal(status.ready, false);
    assert.match(status.warning, /desactivado/);

    process.env.WHATSAPP_QR_ENABLED = 'true';
    process.env.CREDENTIALS_ENCRYPTION_KEY = '';
    status = whatsappQrConfigStatus();
    assert.equal(status.enabled, true);
    assert.equal(status.ready, false);
    assert.match(status.warning, /CREDENTIALS_ENCRYPTION_KEY/);

    process.env.CREDENTIALS_ENCRYPTION_KEY = 'clave-larga-de-mas-de-32-caracteres-0123';
    status = whatsappQrConfigStatus();
    assert.equal(status.ready, true);
    assert.equal(status.warning, '');
  } finally {
    process.env.WHATSAPP_QR_ENABLED = prevEnabled;
    process.env.CREDENTIALS_ENCRYPTION_KEY = prevKey;
  }
});

// --- Punto 4: dedupe inbound por empresa+proveedor+integracion+id ---

test('Message deduplica por companyId+provider+channelConfigId+externalMessageId (indice unico)', () => {
  const indexes = Message.schema.indexes();
  const dedupe = indexes.find(([fields, options]) =>
    fields.companyId === 1 &&
    fields.provider === 1 &&
    fields.channelConfigId === 1 &&
    fields.externalMessageId === 1 &&
    options?.unique
  );
  assert.ok(dedupe, 'falta el indice unico de deduplicacion inbound');
});

// --- Punto 2: reconciliacion idempotente numero <-> sesion ---

function thenable(value) {
  return { select: () => thenable(value), then: (resolve) => Promise.resolve(value).then(resolve) };
}

test('reconcileCompanyQr crea sesion para un ChannelConfig QR huerfano y es idempotente', async (t) => {
  const COMPANY = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const CONFIG_ID = 'cccccccccccccccccccc0001';
  const USER_ID = 'dddddddddddddddddddd0001';
  const configs = [
    { _id: CONFIG_ID, displayName: 'WhatsApp QR', distributorId: null, createdBy: USER_ID }
  ];
  const sessions = [];
  let sessionExists = false;

  const original = {
    cfgFind: ChannelConfig.find,
    cfgExists: ChannelConfig.exists,
    wsExists: WhatsAppSession.exists,
    wsFind: WhatsAppSession.find,
    wsUpdate: WhatsAppSession.updateOne,
    wsSave: WhatsAppSession.prototype.save,
    wsSetConfig: WhatsAppSession.prototype.setEncryptedConfig
  };
  t.after(() => {
    ChannelConfig.find = original.cfgFind;
    ChannelConfig.exists = original.cfgExists;
    WhatsAppSession.exists = original.wsExists;
    WhatsAppSession.find = original.wsFind;
    WhatsAppSession.updateOne = original.wsUpdate;
    WhatsAppSession.prototype.save = original.wsSave;
    WhatsAppSession.prototype.setEncryptedConfig = original.wsSetConfig;
  });

  ChannelConfig.find = () => thenable(configs);
  ChannelConfig.exists = async () => true;
  WhatsAppSession.exists = async () => sessionExists;
  WhatsAppSession.find = () => thenable(sessions);
  WhatsAppSession.updateOne = async () => ({ modifiedCount: 1 });
  WhatsAppSession.prototype.setEncryptedConfig = function setEncryptedConfig() { return this; };
  WhatsAppSession.prototype.save = async function save() {
    sessions.push(this);
    return this;
  };

  const first = await WhatsAppQrSessionManager.reconcileCompanyQr(COMPANY, { actorId: 'user1' });
  assert.equal(first.created, 1, 'debe crear una sesion para el config huerfano');
  assert.equal(sessions.length, 1);
  assert.equal(String(sessions[0].integrationId), CONFIG_ID);

  // Segunda pasada: la sesion ya existe -> no crea otra (idempotente).
  sessionExists = true;
  const second = await WhatsAppQrSessionManager.reconcileCompanyQr(COMPANY, { actorId: 'user1' });
  assert.equal(second.created, 0);
});
