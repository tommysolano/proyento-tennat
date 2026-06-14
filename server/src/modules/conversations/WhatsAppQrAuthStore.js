import { WhatsAppSession } from '../../models/WhatsAppSession.js';

const writes = new Map();

function serialize(value, BufferJSON) {
  return JSON.stringify(value, BufferJSON.replacer);
}

function deserialize(value, BufferJSON) {
  return JSON.parse(value, BufferJSON.reviver);
}

function queueWrite(sessionId, operation) {
  const key = String(sessionId);
  const previous = writes.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  writes.set(key, next);
  return next.finally(() => {
    if (writes.get(key) === next) writes.delete(key);
  });
}

export async function createMongoAuthState(sessionId, baileys) {
  const session = await WhatsAppSession.findById(sessionId).select('+authState');
  if (!session) throw new Error('Sesion WhatsApp QR no encontrada');
  const { BufferJSON, initAuthCreds, proto } = baileys;
  const stored = session.getSerializedAuthState();
  const persisted = stored
    ? deserialize(stored, BufferJSON)
    : { creds: initAuthCreds(), keys: {} };
  persisted.keys ||= {};

  async function persist() {
    return queueWrite(sessionId, async () => {
      const current = await WhatsAppSession.findById(sessionId).select('+authState');
      if (!current) return;
      current.setSerializedAuthState(serialize(persisted, BufferJSON));
      await current.save();
    });
  }

  return {
    state: {
      creds: persisted.creds,
      keys: {
        async get(type, ids) {
          const result = {};
          for (const id of ids) {
            let value = persisted.keys?.[type]?.[id];
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            result[id] = value;
          }
          return result;
        },
        async set(data) {
          for (const [type, entries] of Object.entries(data || {})) {
            persisted.keys[type] ||= {};
            for (const [id, value] of Object.entries(entries || {})) {
              if (value) persisted.keys[type][id] = value;
              else delete persisted.keys[type][id];
            }
          }
          await persist();
        }
      }
    },
    saveCreds: persist
  };
}

export async function deleteMongoAuthState(sessionId) {
  const session = await WhatsAppSession.findById(sessionId).select('+authState');
  if (!session) return;
  session.setSerializedAuthState('');
  await session.save();
}
