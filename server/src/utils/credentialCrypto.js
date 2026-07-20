import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const ENVELOPE_VERSION = 1;

function encryptionKey() {
  const configured = process.env.CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw Object.assign(
      new Error('CREDENTIALS_ENCRYPTION_KEY es requerida para manejar credenciales'),
      { code: 'CREDENTIALS_ENCRYPTION_KEY_MISSING' }
    );
  }
  return createHash('sha256').update(configured, 'utf8').digest();
}

const RECOMMENDED_KEY_LENGTH = 32;

/**
 * Estado de la clave de cifrado de credenciales, para health/diagnostico. La
 * clave se deriva con SHA-256, asi que cualquier valor no vacio funciona; la
 * longitud de 32+ es una recomendacion de seguridad, no un requisito tecnico.
 */
export function credentialsKeyStatus() {
  const configured = process.env.CREDENTIALS_ENCRYPTION_KEY?.trim() || '';
  return {
    configured: Boolean(configured),
    length: configured.length,
    meetsRecommendedLength: configured.length >= RECOMMENDED_KEY_LENGTH
  };
}

export function isEncryptedValue(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      value.encrypted === true &&
      value.version === ENVELOPE_VERSION &&
      value.iv &&
      value.authTag &&
      value.ciphertext
  );
}

export function encryptSecret(value) {
  if (value === undefined || value === null || value === '') return '';
  if (isEncryptedValue(value)) return value;

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(value), 'utf8'),
    cipher.final()
  ]);

  return {
    encrypted: true,
    version: ENVELOPE_VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

export function decryptSecret(value) {
  if (!value) return '';
  // Legacy plaintext remains readable so existing installations can rotate it
  // through the ChannelConfig API without a destructive migration.
  if (!isEncryptedValue(value)) return String(value);

  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(value.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(value.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

export function encryptSecretMap(values = {}) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, encryptSecret(value)])
  );
}

export function decryptSecretMap(values = {}) {
  return Object.fromEntries(
    Object.entries(values || {}).map(([key, value]) => [key, decryptSecret(value)])
  );
}
