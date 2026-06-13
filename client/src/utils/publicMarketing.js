const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term'
];

const ATTRIBUTION_KEYS = [
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
  'source',
  'medium',
  'channel',
  'pixel_id',
  'tag_id',
  'external_event_id',
  'producto_consultado',
  'producto_comprado',
  'categoria_consultada',
  'categoria_comprada',
  'referencia_anuncio',
  'canal_ingreso'
];

export function publicMarketingContext(search = globalThis.location?.search || '') {
  const query = new URLSearchParams(search);
  const utm = {};
  const attribution = {};
  for (const key of UTM_KEYS) {
    const value = query.get(key)?.trim();
    if (value) utm[key] = value.slice(0, 300);
  }
  for (const key of ATTRIBUTION_KEYS) {
    const value = query.get(key)?.trim();
    if (value) attribution[key] = value.slice(0, 500);
  }
  return { utm, attribution };
}

export function publicMarketingQuery(search = globalThis.location?.search || '') {
  const context = publicMarketingContext(search);
  return { ...context.utm, ...context.attribution };
}

export function appendPublicMarketingQuery(path, search = globalThis.location?.search || '') {
  const query = new URLSearchParams(publicMarketingQuery(search)).toString();
  if (!query) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${query}`;
}
