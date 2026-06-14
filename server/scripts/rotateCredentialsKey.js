import mongoose from 'mongoose';
import { loadEnv } from '../src/config/env.js';
import { ChannelConfig } from '../src/models/ChannelConfig.js';
import { WhatsAppSession } from '../src/models/WhatsAppSession.js';
import {
  decryptSecret,
  decryptSecretMap,
  encryptSecret,
  encryptSecretMap
} from '../src/utils/credentialCrypto.js';

loadEnv();

const execute = process.argv.includes('--execute');
const oldKey = process.env.OLD_CREDENTIALS_ENCRYPTION_KEY?.trim();
const newKey = process.env.NEW_CREDENTIALS_ENCRYPTION_KEY?.trim();

if (!oldKey || oldKey.length < 32 || !newKey || newKey.length < 32) {
  throw new Error(
    'OLD_CREDENTIALS_ENCRYPTION_KEY y NEW_CREDENTIALS_ENCRYPTION_KEY deben tener al menos 32 caracteres'
  );
}
if (oldKey === newKey) throw new Error('Las claves vieja y nueva deben ser diferentes');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI es requerida');

let prepared = 0;
let preparedSessions = 0;
try {
  await mongoose.connect(process.env.MONGODB_URI);
  const configs = await ChannelConfig.find()
    .select('+credentials +verifyToken +webhookSecret')
    .lean();

  for (const config of configs) {
    process.env.CREDENTIALS_ENCRYPTION_KEY = oldKey;
    const plaintext = {
      credentials: decryptSecretMap(config.credentials || {}),
      verifyToken: decryptSecret(config.verifyToken),
      webhookSecret: decryptSecret(config.webhookSecret)
    };

    process.env.CREDENTIALS_ENCRYPTION_KEY = newKey;
    const replacement = {
      credentials: encryptSecretMap(plaintext.credentials),
      verifyToken: encryptSecret(plaintext.verifyToken),
      webhookSecret: encryptSecret(plaintext.webhookSecret),
      'metadata.encryptionKeyRotatedAt': new Date()
    };
    prepared += 1;
    if (execute) {
      await ChannelConfig.collection.updateOne(
        { _id: config._id },
        { $set: replacement }
      );
    }
  }

  const sessions = await WhatsAppSession.find()
    .select('+authState +encryptedConfig')
    .lean();
  for (const session of sessions) {
    process.env.CREDENTIALS_ENCRYPTION_KEY = oldKey;
    const plaintext = {
      authState: decryptSecret(session.authState),
      encryptedConfig: decryptSecret(session.encryptedConfig)
    };

    process.env.CREDENTIALS_ENCRYPTION_KEY = newKey;
    const replacement = {
      authState: encryptSecret(plaintext.authState),
      encryptedConfig: encryptSecret(plaintext.encryptedConfig),
      'metadata.encryptionKeyRotatedAt': new Date()
    };
    preparedSessions += 1;
    if (execute) {
      await WhatsAppSession.collection.updateOne(
        { _id: session._id },
        { $set: replacement }
      );
    }
  }
} finally {
  await mongoose.disconnect().catch(() => {});
}

console.log(
  execute
    ? `Rotacion completada para ${prepared} ChannelConfig y ${preparedSessions} WhatsAppSession.`
    : `Dry-run correcto: ${prepared} ChannelConfig y ${preparedSessions} WhatsAppSession pueden rotarse. Use --execute despues de crear un backup.`
);
