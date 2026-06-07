import { extname } from 'node:path';

const DEFAULT_ALLOWED = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/ogg',
  'video/mp4',
  'application/pdf'
];

const MIME_EXTENSIONS = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'audio/mpeg': ['.mp3', '.mpeg'],
  'audio/ogg': ['.ogg', '.oga'],
  'video/mp4': ['.mp4'],
  'application/pdf': ['.pdf']
};

const DANGEROUS_EXTENSIONS = new Set([
  '.bat',
  '.cmd',
  '.com',
  '.exe',
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.ps1',
  '.sh',
  '.svg',
  '.vbs'
]);

export function allowedMimeTypes() {
  return (process.env.MEDIA_ALLOWED_MIME_TYPES || DEFAULT_ALLOWED.join(','))
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function mediaMaxBytes() {
  return Math.max(1, Number(process.env.MEDIA_MAX_SIZE_MB || 25)) * 1024 * 1024;
}

export function sanitizeFilename(value = 'file') {
  const source = String(value || 'file')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 180);
  return source || 'file';
}

export function extensionForMime(mimeType) {
  return MIME_EXTENSIONS[mimeType]?.[0] || '';
}

export function validateMedia({ filename, mimeType, size }) {
  const normalizedMime = String(mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const safeFilename = sanitizeFilename(filename);
  const extension = extname(safeFilename).toLowerCase();
  const allowed = allowedMimeTypes();
  const maxBytes = mediaMaxBytes();

  if (!normalizedMime) {
    throw Object.assign(new Error('mimeType es requerido para media'), {
      status: 400,
      retryable: false,
      code: 'MEDIA_MIME_REQUIRED'
    });
  }
  if (!allowed.includes(normalizedMime)) {
    throw Object.assign(new Error(`Tipo de media no permitido: ${normalizedMime}`), {
      status: 415,
      retryable: false,
      code: 'MEDIA_TYPE_NOT_ALLOWED'
    });
  }
  if (DANGEROUS_EXTENSIONS.has(extension)) {
    throw Object.assign(new Error('La extension del archivo no esta permitida'), {
      status: 415,
      retryable: false,
      code: 'MEDIA_EXTENSION_NOT_ALLOWED'
    });
  }
  const expectedExtensions = MIME_EXTENSIONS[normalizedMime] || [];
  if (extension && expectedExtensions.length && !expectedExtensions.includes(extension)) {
    throw Object.assign(
      new Error(`La extension ${extension} no coincide con ${normalizedMime}`),
      { status: 415, retryable: false, code: 'MEDIA_EXTENSION_MISMATCH' }
    );
  }
  const numericSize = Number(size || 0);
  if (!Number.isFinite(numericSize) || numericSize <= 0) {
    throw Object.assign(new Error('El archivo esta vacio'), {
      status: 400,
      retryable: false,
      code: 'MEDIA_EMPTY'
    });
  }
  if (numericSize > maxBytes) {
    throw Object.assign(
      new Error(`El archivo supera el limite de ${process.env.MEDIA_MAX_SIZE_MB || 25} MB`),
      { status: 413, retryable: false, code: 'MEDIA_TOO_LARGE' }
    );
  }
  return {
    filename: safeFilename,
    mimeType: normalizedMime,
    size: numericSize,
    extension: extension || extensionForMime(normalizedMime)
  };
}
