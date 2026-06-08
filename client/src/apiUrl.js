export function normalizeApiBaseUrl(configuredUrl, { dev = false } = {}) {
  const fallback = dev ? 'http://localhost:4000/api' : '/api';
  const rawValue = String(configuredUrl || fallback).trim();
  const unquotedValue = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  const withoutTrailingSlashes = unquotedValue.replace(/\/+$/, '');
  const withoutDuplicateApi = withoutTrailingSlashes.replace(/(?:\/api)+$/i, '/api');

  return /\/api$/i.test(withoutDuplicateApi)
    ? withoutDuplicateApi
    : `${withoutDuplicateApi}/api`;
}

export function buildApiUrl(baseUrl, path = '') {
  const normalizedPath = `/${String(path).trim().replace(/^\/+/, '')}`;
  const pathWithoutDuplicateApi = normalizedPath.replace(/^\/api(?=\/|$)/i, '');

  return `${baseUrl}${pathWithoutDuplicateApi}`;
}
