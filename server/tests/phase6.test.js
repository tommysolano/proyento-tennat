import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import mongoose from 'mongoose';
import {
  decryptSecret,
  encryptSecret,
  isEncryptedValue
} from '../src/utils/credentialCrypto.js';
import {
  mediaMaxBytes,
  sanitizeFilename,
  validateMedia
} from '../src/modules/storage/mediaValidation.js';
import { LocalStorageProvider } from '../src/modules/storage/LocalStorageProvider.js';
import { Message } from '../src/models/Message.js';
import { OperationalAlert } from '../src/models/OperationalAlert.js';
import { hasPermission } from '../src/core/permissions/permissions.js';
import { usagePeriod } from '../src/utils/usage.js';

const previousEnvironment = {
  CREDENTIALS_ENCRYPTION_KEY: process.env.CREDENTIALS_ENCRYPTION_KEY,
  MEDIA_LOCAL_DIR: process.env.MEDIA_LOCAL_DIR,
  MEDIA_MAX_SIZE_MB: process.env.MEDIA_MAX_SIZE_MB,
  MEDIA_ALLOWED_MIME_TYPES: process.env.MEDIA_ALLOWED_MIME_TYPES
};

process.env.CREDENTIALS_ENCRYPTION_KEY = 'phase6-test-key-with-at-least-32-characters';
process.env.MEDIA_LOCAL_DIR = '.tmp-phase6-media';
process.env.MEDIA_MAX_SIZE_MB = '1';
process.env.MEDIA_ALLOWED_MIME_TYPES =
  'image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,video/mp4,application/pdf';

const storage = new LocalStorageProvider();

after(async () => {
  await rm(storage.root, { recursive: true, force: true });
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('media validation accepts allowed files and sanitizes names', () => {
  const result = validateMedia({
    filename: '../factura final.pdf',
    mimeType: 'application/pdf',
    size: 128
  });
  assert.equal(result.filename, '_factura_final.pdf');
  assert.equal(result.mimeType, 'application/pdf');
  assert.equal(sanitizeFilename('reporte<script>.pdf'), 'reporte_script_.pdf');
  assert.equal(
    validateMedia({
      filename: 'voice.ogg',
      mimeType: 'audio/ogg; codecs=opus',
      size: 64
    }).mimeType,
    'audio/ogg'
  );
});

test('media validation rejects dangerous, mismatched and oversized files', () => {
  assert.throws(
    () => validateMedia({ filename: 'payload.html', mimeType: 'text/html', size: 10 }),
    { code: 'MEDIA_TYPE_NOT_ALLOWED' }
  );
  assert.throws(
    () => validateMedia({ filename: 'foto.pdf', mimeType: 'image/png', size: 10 }),
    { code: 'MEDIA_EXTENSION_MISMATCH' }
  );
  assert.throws(
    () => validateMedia({
      filename: 'foto.png',
      mimeType: 'image/png',
      size: mediaMaxBytes() + 1
    }),
    { code: 'MEDIA_TOO_LARGE' }
  );
});

test('local storage confines keys and supports buffer and stream lifecycle', async () => {
  assert.throws(() => storage.pathForKey('../outside.pdf'), /storageKey invalido/);

  const first = await storage.uploadBuffer({
    buffer: Buffer.from('phase6-pdf'),
    filename: 'evidence.pdf',
    mimeType: 'application/pdf',
    scope: { companyId: new mongoose.Types.ObjectId() }
  });
  assert.match(first.storageKey, /^[a-f0-9]+\/\d{4}\/\d{2}\//);
  const metadata = await storage.getObjectMetadata({ storageKey: first.storageKey });
  assert.equal(metadata.filename, 'evidence.pdf');
  assert.equal(metadata.size, 10);
  await storage.deleteObject({ storageKey: first.storageKey });
  await assert.rejects(
    storage.getObjectMetadata({ storageKey: first.storageKey }),
    /ENOENT/
  );

  const second = await storage.uploadStream({
    stream: Readable.from(Buffer.from('stream-pdf')),
    filename: 'stream.pdf',
    mimeType: 'application/pdf',
    scope: { companyId: new mongoose.Types.ObjectId() }
  });
  assert.equal(second.size, 10);
  await storage.deleteObject({ storageKey: second.storageKey });
});

test('message JSON never exposes storage or provider media identifiers', () => {
  const id = new mongoose.Types.ObjectId();
  const message = new Message({
    companyId: id,
    conversationId: new mongoose.Types.ObjectId(),
    contactId: new mongoose.Types.ObjectId(),
    channel: 'internal',
    direction: 'inbound',
    type: 'document',
    status: 'received',
    media: {
      storageKey: `${id}/2026/06/private.pdf`,
      providerMediaId: 'provider-secret-id',
      filename: 'private.pdf',
      mimeType: 'application/pdf',
      size: 10,
      status: 'available'
    }
  });
  const json = message.toJSON();
  assert.equal(json.media.storageKey, undefined);
  assert.equal(json.media.providerMediaId, undefined);
  assert.equal(json.media.storageKeyConfigured, true);
  assert.equal(json.media.providerMediaIdConfigured, true);
  assert.match(json.media.contentUrl, /\/media\/content$/);
});

test('local storage refuses direct signed URLs that would expose storage keys', async () => {
  await assert.rejects(storage.getSignedUrl({ storageKey: 'private/file.pdf' }), {
    code: 'LOCAL_SIGNED_URL_DISABLED'
  });
});

test('credential envelopes decrypt without exposing plaintext structure', () => {
  const encrypted = encryptSecret('token-phase6');
  assert.equal(isEncryptedValue(encrypted), true);
  assert.equal(encrypted.ciphertext.includes('token-phase6'), false);
  assert.equal(decryptSecret(encrypted), 'token-phase6');
});

test('operational alerts redact credential-like content before validation', async () => {
  const companyId = new mongoose.Types.ObjectId();
  const alert = new OperationalAlert({
    scopeType: 'company',
    scopeId: companyId,
    companyId,
    severity: 'critical',
    type: 'credentials_error',
    title: 'Token rejected',
    message: `Provider returned ${['Bearer', 'secret-token-value-123456789'].join(' ')}`,
    metadata: { accessToken: 'secret-token-value-123456789' }
  });
  await alert.validate();
  assert.match(alert.message, /Bearer \[REDACTED\]/);
  assert.equal(alert.metadata.accessToken, '[REDACTED]');
});

test('phase 6 permissions preserve tenant role boundaries', () => {
  assert.equal(hasPermission('ADMIN', 'jobs:replay_company'), true);
  assert.equal(hasPermission('CALLCENTER', 'jobs:replay_company'), false);
  assert.equal(hasPermission('SUPERVISOR', 'media:read_team'), true);
  assert.equal(hasPermission('CALLCENTER', 'media:upload_assigned'), true);
  assert.equal(hasPermission('SUPERADMIN', 'alerts:ack_all'), true);
});

test('usage periods are stable UTC calendar months', () => {
  const period = usagePeriod(new Date('2026-06-07T12:00:00.000Z'));
  assert.equal(period.periodStart.toISOString(), '2026-06-01T00:00:00.000Z');
  assert.equal(period.periodEnd.toISOString(), '2026-07-01T00:00:00.000Z');
});
