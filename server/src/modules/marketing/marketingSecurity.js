import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { sanitize } from '../../utils/sanitize.js';

const BLOCKED_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'password',
  'credentials',
  'token',
  'secret',
  'providerpayload'
]);

export function slugifyPublic(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function isSafeMarketingKey(value) {
  const key = String(value || '').toLowerCase();
  return /^[a-z][a-z0-9_]{0,63}$/.test(key) && !BLOCKED_KEYS.has(key);
}

export function sanitizePlainText(value, maxLength = 5000) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeLimitedHtml(value, maxLength = 20000) {
  return String(value || '')
    .slice(0, maxLength)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/<(?!\/?(?:p|br|strong|em|b|i|u|ul|ol|li|h[1-4]|blockquote|a)(?:\s|>|\/))[^>]*>/gi, '')
    .replace(/<([a-z][a-z0-9]*)(?:\s[^>]*)>/gi, '<$1>');
}

export function safePublicUrl(value, { allowRelative = true } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (allowRelative && raw.startsWith('/') && !raw.startsWith('//')) return raw.slice(0, 1000);
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString().slice(0, 1000) : '';
  } catch {
    return '';
  }
}

export function sanitizeMarketingValue(value, depth = 0) {
  if (depth > 5) return null;
  if (value === null || value === undefined || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return sanitizePlainText(value);
  if (typeof value?.toHexString === 'function') return value.toHexString();
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeMarketingValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 100)) {
      if (!isSafeMarketingKey(key)) continue;
      output[key] = sanitizeMarketingValue(item, depth + 1);
    }
    return output;
  }
  return sanitize(value);
}

export function hashPublicValue(value) {
  const salt =
    process.env.PUBLIC_TRACKING_SALT ||
    process.env.JWT_SECRET ||
    'tenantdesk-development-tracking-salt';
  return createHash('sha256').update(`${salt}:${String(value || '')}`).digest('hex');
}

export function createSubmissionToken(formId, issuedAt = Date.now()) {
  const payload = `${formId}.${issuedAt}`;
  const secret = process.env.JWT_SECRET || 'tenantdesk-development-submission-secret';
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

export function parseSubmissionToken(token, expectedFormId) {
  try {
    const decoded = Buffer.from(String(token || ''), 'base64url').toString('utf8');
    const [formId, issuedAt, signature] = decoded.split('.');
    if (formId !== String(expectedFormId) || !/^\d+$/.test(issuedAt)) return null;
    const payload = `${formId}.${issuedAt}`;
    const secret = process.env.JWT_SECRET || 'tenantdesk-development-submission-secret';
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null;
    }
    return { formId, issuedAt: Number(issuedAt) };
  } catch {
    return null;
  }
}

export function safeTrackingContext(req) {
  const userAgent = sanitizePlainText(req.get('user-agent') || '', 300);
  const rawReferrer = safePublicUrl(req.get('referer') || req.get('referrer') || '');
  let referrer = rawReferrer;
  try {
    const parsed = new URL(rawReferrer);
    referrer = `${parsed.origin}${parsed.pathname}`.slice(0, 1000);
  } catch {
    referrer = String(rawReferrer).split('?')[0];
  }
  const utm = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    if (req.query?.[key] || req.body?.utm?.[key]) {
      utm[key] = sanitizePlainText(req.query?.[key] || req.body?.utm?.[key], 200);
    }
  }
  return {
    ipHash: hashPublicValue(req.ip || req.socket?.remoteAddress || ''),
    userAgent,
    referrer,
    utm,
    sessionId: sanitizePlainText(req.body?.sessionId || req.query?.sessionId || '', 100),
    visitorId: sanitizePlainText(req.body?.visitorId || req.query?.visitorId || '', 100)
  };
}
