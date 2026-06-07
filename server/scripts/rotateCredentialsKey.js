import mongoose from 'mongoose';
import { loadEnv } from '../src/config/env.js';
import { ChannelConfig } from '../src/models/ChannelConfig.js';
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
} finally {
  await mongoose.disconnect().catch(() => {});
}

console.log(
  execute
    ? `Rotacion completada para ${prepared} ChannelConfig.`
    : `Dry-run correcto: ${prepared} ChannelConfig pueden rotarse. Use --execute despues de crear un backup.`
);
