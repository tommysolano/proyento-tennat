const SENSITIVE_KEYS = new Set([
  'accesstoken',
  'appsecret',
  'authorization',
  'authstate',
  'cookie',
  'cookies',
  'credentials',
  'jwt',
  'mongodburi',
  'password',
  'providerpayload',
  'qr',
  'qrcode',
  'refreshtoken',
  'token',
  'verifytoken',
  'webhooksecret'
]);

function sensitiveKey(key) {
  const normalized = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return (
    SENSITIVE_KEYS.has(normalized) ||
    normalized.endsWith('token') ||
    normalized.endsWith('secret') ||
    normalized === 'setcookie'
  );
}

function redactString(value) {
  let output = String(value);
  output = output.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
  output = output.replace(
    /mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi,
    'mongodb://[REDACTED]'
  );
  output = output.replace(
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    '[REDACTED_JWT]'
  );
  output = output.replace(
    /([?&](?:[^=&]*(?:token|secret|authorization)[^=&]*)=)[^&\s]*/gi,
    '$1[REDACTED]'
  );

  for (const secret of [
    process.env.CREDENTIALS_ENCRYPTION_KEY,
    process.env.JWT_SECRET,
    process.env.MONGODB_URI
  ]) {
    if (secret && secret.length >= 8) output = output.split(secret).join('[REDACTED]');
  }
  return output;
}

export function sanitizeUrl(value) {
  try {
    const parsed = new URL(String(value), 'http://localhost');
    for (const key of parsed.searchParams.keys()) {
      if (/(token|secret|authorization|cookie|jwt)/i.test(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return redactString(value);
  }
}

export function sanitize(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));

  const source =
    typeof value.toObject === 'function'
      ? value.toObject({ depopulate: true, virtuals: false })
      : value;
  const result = {};
  for (const [key, item] of Object.entries(source)) {
    result[key] = sensitiveKey(key) ? '[REDACTED]' : sanitize(item, seen);
  }
  return result;
}

export function sanitizeError(error) {
  return sanitize({
    name: error?.name || 'Error',
    message: error?.message || String(error),
    code: error?.code,
    status: error?.status,
    stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
  });
}
