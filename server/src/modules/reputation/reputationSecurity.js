import { randomBytes } from 'node:crypto';
import {
  hashPublicValue,
  safePublicUrl,
  sanitizeMarketingValue,
  sanitizePlainText,
  slugifyPublic
} from '../marketing/marketingSecurity.js';

export function createPublicToken() {
  return randomBytes(32).toString('base64url');
}

export function createReferralCode() {
  return randomBytes(9).toString('base64url').replace(/[-_]/g, '').slice(0, 12).toUpperCase();
}

export function publicBaseUrl() {
  return String(
    process.env.PUBLIC_BASE_URL ||
    process.env.CLIENT_URL ||
    process.env.SERVER_URL ||
    'http://localhost:5173'
  ).replace(/\/$/, '');
}

export function publicReviewUrl(token) {
  return `${publicBaseUrl()}/r/${encodeURIComponent(token)}`;
}

export function sanitizeReputationText(value, maxLength = 5000) {
  return sanitizePlainText(value, maxLength);
}

export function sanitizeReputationValue(value) {
  return sanitizeMarketingValue(value);
}

export function safeImageUrl(value) {
  return safePublicUrl(value, { allowRelative: false });
}

export function publicSlug(value) {
  return slugifyPublic(value);
}

export function requestIpHash(req) {
  return hashPublicValue(req.ip || req.socket?.remoteAddress || '');
}
