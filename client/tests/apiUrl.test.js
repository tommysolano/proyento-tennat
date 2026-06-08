import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApiUrl, normalizeApiBaseUrl } from '../src/apiUrl.js';

test('normalizes the configured API base without duplicating /api', () => {
  assert.equal(
    normalizeApiBaseUrl('https://proyento-tennat.onrender.com/api/'),
    'https://proyento-tennat.onrender.com/api'
  );
  assert.equal(
    normalizeApiBaseUrl('https://proyento-tennat.onrender.com/api/api'),
    'https://proyento-tennat.onrender.com/api'
  );
  assert.equal(
    normalizeApiBaseUrl('https://proyento-tennat.onrender.com'),
    'https://proyento-tennat.onrender.com/api'
  );
});

test('builds the login endpoint with exactly one /api segment', () => {
  const baseUrl = normalizeApiBaseUrl('https://proyento-tennat.onrender.com/api');

  assert.equal(
    buildApiUrl(baseUrl, '/auth/login'),
    'https://proyento-tennat.onrender.com/api/auth/login'
  );
  assert.equal(
    buildApiUrl(baseUrl, '/api/auth/login'),
    'https://proyento-tennat.onrender.com/api/auth/login'
  );
});

test('uses local and same-origin fallbacks for missing configuration', () => {
  assert.equal(normalizeApiBaseUrl('', { dev: true }), 'http://localhost:4000/api');
  assert.equal(normalizeApiBaseUrl('', { dev: false }), '/api');
});
