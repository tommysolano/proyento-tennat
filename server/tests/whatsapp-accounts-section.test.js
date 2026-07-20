import assert from 'node:assert/strict';
import test from 'node:test';
import { ChannelConfig } from '../src/models/ChannelConfig.js';
import {
  getDefaultAccount,
  getDefaultCloudAccount,
  resolveAccountForConversation,
  setDefaultAccount
} from '../src/modules/communications/accountGateway.js';
import { WhatsAppQualityService } from '../src/modules/communications/WhatsAppQualityService.js';

const COMPANY_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const COMPANY_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

// ---- Stub en memoria de ChannelConfig (sin base de datos) ----
function matchesCondition(value, condition) {
  if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
    if ('$ne' in condition) return String(value ?? '') !== String(condition.$ne ?? '');
    if ('$in' in condition) return condition.$in.some((item) => String(item) === String(value ?? ''));
  }
  return String(value ?? '') === String(condition ?? '');
}
function matchesFilter(doc, filter = {}) {
  return Object.entries(filter).every(([key, condition]) => matchesCondition(doc[key], condition));
}
function makeDoc(raw) {
  return {
    ...raw,
    getDecryptedCredentials: () => raw.credentials || {},
    save: async function save() { return this; }
  };
}
function query(list, one) {
  const q = {
    select: () => q,
    sort: (spec) => {
      const [field, dir] = Object.entries(spec)[0];
      list = [...list].sort((a, b) => (a[field] > b[field] ? dir : -dir));
      return q;
    },
    then: (resolve, reject) => Promise.resolve(one ? list[0] || null : list).then(resolve, reject),
    catch: (reject) => Promise.resolve(one ? list[0] || null : list).catch(reject)
  };
  return q;
}
function stubCollection(docs) {
  const collection = docs.map(makeDoc);
  const originals = { findOne: ChannelConfig.findOne, find: ChannelConfig.find, updateMany: ChannelConfig.updateMany };
  ChannelConfig.findOne = (filter) => query(collection.filter((d) => matchesFilter(d, filter)), true);
  ChannelConfig.find = (filter) => query(collection.filter((d) => matchesFilter(d, filter)), false);
  ChannelConfig.updateMany = async (filter, update) => {
    let n = 0;
    for (const doc of collection.filter((d) => matchesFilter(d, filter))) {
      Object.assign(doc, update.$set || {});
      n += 1;
    }
    return { modifiedCount: n };
  };
  return { collection, restore: () => Object.assign(ChannelConfig, originals) };
}

test('getDefaultAccount: usa el marcado isDefault habilitado', async (t) => {
  const s = stubCollection([
    { _id: '1', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'connected', isDefault: false, createdAt: 1 },
    { _id: '2', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'connected', isDefault: true, createdAt: 2 }
  ]);
  t.after(s.restore);
  const account = await getDefaultAccount(COMPANY_A);
  assert.equal(account._id, '2');
});

test('getDefaultAccount: sin default explicito cae al mas antiguo conectado', async (t) => {
  const s = stubCollection([
    { _id: 'nuevo', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'connected', isDefault: false, createdAt: 5 },
    { _id: 'viejo', companyId: COMPANY_A, channel: 'whatsapp_qr', status: 'connected', isDefault: false, createdAt: 1 },
    { _id: 'apagado', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'disabled', isDefault: false, createdAt: 0 }
  ]);
  t.after(s.restore);
  const account = await getDefaultAccount(COMPANY_A);
  assert.equal(account._id, 'viejo');
});

test('getDefaultAccount: sin canales utilizables devuelve null', async (t) => {
  const s = stubCollection([
    { _id: '1', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'disabled', isDefault: false, createdAt: 1 }
  ]);
  t.after(s.restore);
  assert.equal(await getDefaultAccount(COMPANY_A), null);
});

test('resolveAccountForConversation: canal de la conversacion habilitado se conserva', async (t) => {
  const s = stubCollection([
    { _id: 'pin', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'connected', isDefault: false, createdAt: 2 },
    { _id: 'def', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'connected', isDefault: true, createdAt: 1 }
  ]);
  t.after(s.restore);
  const account = await resolveAccountForConversation({ companyId: COMPANY_A, channelConfigId: 'pin' });
  assert.equal(account._id, 'pin');
});

test('resolveAccountForConversation: canal deshabilitado cae al numero por defecto', async (t) => {
  const s = stubCollection([
    { _id: 'pin', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'disabled', isDefault: false, createdAt: 2 },
    { _id: 'def', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'connected', isDefault: true, createdAt: 1 }
  ]);
  t.after(s.restore);
  const account = await resolveAccountForConversation({ companyId: COMPANY_A, channelConfigId: 'pin' });
  assert.equal(account._id, 'def');
});

test('resolveAccountForConversation: no cruza tenants (canal de otra empresa cae al default propio)', async (t) => {
  const s = stubCollection([
    { _id: 'ajeno', companyId: COMPANY_B, channel: 'whatsapp_cloud', status: 'connected', isDefault: true, createdAt: 1 },
    { _id: 'propio', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'connected', isDefault: true, createdAt: 1 }
  ]);
  t.after(s.restore);
  // La conversacion (empresa A) apunta a un canal de la empresa B: no debe usarlo.
  const account = await resolveAccountForConversation({ companyId: COMPANY_A, channelConfigId: 'ajeno' });
  assert.equal(account._id, 'propio');
});

test('getDefaultCloudAccount: prefiere una cloud COMPLETA aunque el default sea QR', async (t) => {
  const s = stubCollection([
    { _id: 'qr', companyId: COMPANY_A, channel: 'whatsapp_qr', status: 'connected', isDefault: true, createdAt: 1, credentials: {} },
    { _id: 'cloud', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'connected', isDefault: false, createdAt: 2, phoneNumberId: 'PN', externalBusinessId: 'WABA', credentials: { accessToken: 'tok' } }
  ]);
  t.after(s.restore);
  const account = await getDefaultCloudAccount(COMPANY_A);
  assert.equal(account._id, 'cloud');
});

test('getDefaultCloudAccount: sin cloud completa devuelve una para reportar el campo faltante', async (t) => {
  const s = stubCollection([
    { _id: 'incompleta', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'connected', isDefault: true, createdAt: 1, phoneNumberId: 'PN', credentials: {} }
  ]);
  t.after(s.restore);
  const account = await getDefaultCloudAccount(COMPANY_A);
  assert.equal(account._id, 'incompleta');
});

test('setDefaultAccount: es unico por empresa (desmarca el resto)', async (t) => {
  const s = stubCollection([
    { _id: 'a', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'connected', isDefault: true, createdAt: 1 },
    { _id: 'b', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'connected', isDefault: false, createdAt: 2 }
  ]);
  t.after(s.restore);
  await setDefaultAccount(COMPANY_A, 'b');
  assert.equal(s.collection.find((d) => d._id === 'a').isDefault, false);
  assert.equal(s.collection.find((d) => d._id === 'b').isDefault, true);
});

test('setDefaultAccount: no permite marcar un canal deshabilitado', async (t) => {
  const s = stubCollection([
    { _id: 'a', companyId: COMPANY_A, channel: 'whatsapp_cloud', status: 'disabled', isDefault: false, createdAt: 1 }
  ]);
  t.after(s.restore);
  await assert.rejects(() => setDefaultAccount(COMPANY_A, 'a'), /habilitado/);
});
