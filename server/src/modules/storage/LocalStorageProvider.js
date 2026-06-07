import { randomUUID } from 'node:crypto';
import {
  createReadStream,
  createWriteStream
} from 'node:fs';
import {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { dirname, extname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { StorageProvider } from './StorageProvider.js';
import {
  sanitizeFilename,
  validateMedia
} from './mediaValidation.js';

const serverRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

function configuredRoot() {
  const configured = process.env.MEDIA_LOCAL_DIR || 'server/uploads';
  if (isAbsolute(configured)) return resolve(configured);
  const normalized = configured.replaceAll('\\', '/');
  return normalized === 'server' || normalized.startsWith('server/')
    ? resolve(serverRoot, '..', configured)
    : resolve(serverRoot, configured);
}

function assertInsideRoot(path) {
  const root = configuredRoot();
  const resolved = resolve(path);
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
    throw new Error('storageKey fuera del directorio de media');
  }
  return resolved;
}

export class LocalStorageProvider extends StorageProvider {
  constructor() {
    super();
    this.name = 'local';
    this.root = configuredRoot();
  }

  pathForKey(storageKey) {
    if (!storageKey || isAbsolute(storageKey) || storageKey.includes('..')) {
      throw new Error('storageKey invalido');
    }
    return assertInsideRoot(resolve(this.root, storageKey));
  }

  async uploadBuffer({ buffer, filename, mimeType, scope = {} }) {
    const validation = validateMedia({
      filename,
      mimeType,
      size: buffer?.length
    });
    const tenant = String(scope.companyId || scope.scopeId || 'global').replace(
      /[^a-zA-Z0-9_-]/g,
      ''
    );
    const date = new Date();
    const extension = extname(validation.filename) || validation.extension;
    const storageKey = [
      tenant || 'global',
      String(date.getUTCFullYear()),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      `${randomUUID()}${extension}`
    ].join('/');
    const target = this.pathForKey(storageKey);
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(target, buffer, { flag: 'wx', mode: 0o600 });
      await writeFile(
        `${target}.json`,
        JSON.stringify({
          filename: sanitizeFilename(validation.filename),
          mimeType: validation.mimeType,
          size: validation.size,
          createdAt: new Date().toISOString()
        }),
        { flag: 'wx', mode: 0o600 }
      );
    } catch (error) {
      await Promise.all([
        rm(target, { force: true }),
        rm(`${target}.json`, { force: true })
      ]);
      throw error;
    }
    return {
      storageKey,
      filename: validation.filename,
      mimeType: validation.mimeType,
      size: validation.size,
      provider: this.name
    };
  }

  async uploadStream({ stream, filename, mimeType, scope = {} }) {
    const safeFilename = sanitizeFilename(filename);
    const extension = extname(safeFilename);
    const tenant = String(scope.companyId || scope.scopeId || 'global').replace(
      /[^a-zA-Z0-9_-]/g,
      ''
    );
    const storageKey = `${tenant || 'global'}/stream/${randomUUID()}${extension}`;
    const target = this.pathForKey(storageKey);
    await mkdir(dirname(target), { recursive: true });
    try {
      await pipeline(stream, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
      const metadata = await stat(target);
      const validation = validateMedia({
        filename: safeFilename,
        mimeType,
        size: metadata.size
      });
      await writeFile(
        `${target}.json`,
        JSON.stringify({
          filename: validation.filename,
          mimeType: validation.mimeType,
          size: validation.size,
          createdAt: new Date().toISOString()
        }),
        { flag: 'wx', mode: 0o600 }
      );
      return { storageKey, ...validation, provider: this.name };
    } catch (error) {
      await Promise.all([
        rm(target, { force: true }),
        rm(`${target}.json`, { force: true })
      ]);
      throw error;
    }
  }

  async getSignedUrl() {
    throw Object.assign(
      new Error(
        'LocalStorageProvider sirve media mediante el endpoint autenticado del mensaje'
      ),
      { status: 501, code: 'LOCAL_SIGNED_URL_DISABLED' }
    );
  }

  async deleteObject({ storageKey }) {
    const target = this.pathForKey(storageKey);
    await Promise.all([
      rm(target, { force: true }),
      rm(`${target}.json`, { force: true })
    ]);
  }

  async getObjectMetadata({ storageKey }) {
    const target = this.pathForKey(storageKey);
    const [fileStats, metadata] = await Promise.all([
      stat(target),
      readFile(`${target}.json`, 'utf8').then(JSON.parse).catch(() => ({}))
    ]);
    return {
      storageKey,
      filename: metadata.filename || 'media',
      mimeType: metadata.mimeType || 'application/octet-stream',
      size: fileStats.size,
      createdAt: metadata.createdAt || fileStats.birthtime
    };
  }

  async createReadStream({ storageKey }) {
    const metadata = await this.getObjectMetadata({ storageKey });
    return {
      stream: createReadStream(this.pathForKey(storageKey)),
      metadata
    };
  }
}
