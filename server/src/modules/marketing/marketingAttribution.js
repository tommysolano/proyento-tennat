import mongoose from 'mongoose';
import { normalizeOptionalObjectId } from '../../utils/validation.js';
import {
  safePublicUrl,
  sanitizeMarketingValue,
  sanitizePlainText
} from './marketingSecurity.js';

export const ATTRIBUTION_INTERNAL_ID_FIELDS = [
  'campaignId',
  'landingPageId',
  'formId',
  'funnelId',
  'funnelStepId',
  'integrationId'
];

export const ATTRIBUTION_STRING_FIELDS = [
  'campaignName',
  'externalCampaignId',
  'externalAdSetId',
  'adSetName',
  'externalAdId',
  'adName',
  'source',
  'medium',
  'channel',
  'pixelId',
  'tagId',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
  'utmTerm',
  'landingPageUrl',
  'externalEventId',
  'consultedProduct',
  'purchasedProduct',
  'consultedCategory',
  'purchasedCategory',
  'adReference',
  'entryChannel'
];

const ATTRIBUTION_ALIASES = {
  campaign_id: 'externalCampaignId',
  campaign_name: 'campaignName',
  adset_id: 'externalAdSetId',
  adset_name: 'adSetName',
  ad_id: 'externalAdId',
  ad_name: 'adName',
  pixel_id: 'pixelId',
  tag_id: 'tagId',
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_content: 'utmContent',
  utm_term: 'utmTerm',
  landing_page_id: 'landingPageId',
  landing_page_url: 'landingPageUrl',
  form_id: 'formId',
  funnel_id: 'funnelId',
  funnel_step_id: 'funnelStepId',
  integration_id: 'integrationId',
  external_event_id: 'externalEventId',
  producto_consultado: 'consultedProduct',
  producto_comprado: 'purchasedProduct',
  categoria_consultada: 'consultedCategory',
  categoria_comprada: 'purchasedCategory',
  referencia_anuncio: 'adReference',
  canal_ingreso: 'entryChannel',
  first_interaction_at: 'firstInteractionAt',
  last_interaction_at: 'lastInteractionAt'
};

function optionalRef(ref) {
  return {
    type: mongoose.Schema.Types.ObjectId,
    ref,
    default: null,
    set: normalizeOptionalObjectId
  };
}

export const marketingAttributionSchema = new mongoose.Schema(
  {
    campaignId: optionalRef('Campaign'),
    campaignName: { type: String, default: '', trim: true, maxlength: 300 },
    externalCampaignId: { type: String, default: '', trim: true, maxlength: 300 },
    externalAdSetId: { type: String, default: '', trim: true, maxlength: 300 },
    adSetName: { type: String, default: '', trim: true, maxlength: 300 },
    externalAdId: { type: String, default: '', trim: true, maxlength: 300 },
    adName: { type: String, default: '', trim: true, maxlength: 300 },
    source: { type: String, default: '', trim: true, maxlength: 200 },
    medium: { type: String, default: '', trim: true, maxlength: 200 },
    channel: { type: String, default: '', trim: true, maxlength: 200 },
    pixelId: { type: String, default: '', trim: true, maxlength: 300 },
    tagId: { type: String, default: '', trim: true, maxlength: 300 },
    utmSource: { type: String, default: '', trim: true, maxlength: 200 },
    utmMedium: { type: String, default: '', trim: true, maxlength: 200 },
    utmCampaign: { type: String, default: '', trim: true, maxlength: 300 },
    utmContent: { type: String, default: '', trim: true, maxlength: 300 },
    utmTerm: { type: String, default: '', trim: true, maxlength: 300 },
    landingPageId: optionalRef('LandingPage'),
    landingPageUrl: { type: String, default: '', trim: true, maxlength: 1000 },
    formId: optionalRef('Form'),
    funnelId: optionalRef('Funnel'),
    funnelStepId: optionalRef('FunnelStep'),
    integrationId: optionalRef('Integration'),
    externalEventId: { type: String, default: '', trim: true, maxlength: 300 },
    consultedProduct: { type: String, default: '', trim: true, maxlength: 500 },
    purchasedProduct: { type: String, default: '', trim: true, maxlength: 500 },
    consultedCategory: { type: String, default: '', trim: true, maxlength: 300 },
    purchasedCategory: { type: String, default: '', trim: true, maxlength: 300 },
    adReference: { type: String, default: '', trim: true, maxlength: 500 },
    entryChannel: { type: String, default: '', trim: true, maxlength: 200 },
    firstInteractionAt: { type: Date, default: null },
    lastInteractionAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { _id: false }
);

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeMarketingAttribution(input = {}, defaults = {}) {
  const source = { ...(input && typeof input === 'object' ? input : {}) };
  for (const [key, value] of Object.entries(defaults || {})) {
    const field = ATTRIBUTION_ALIASES[key] || key;
    if (ATTRIBUTION_INTERNAL_ID_FIELDS.includes(field)) {
      source[field] = value;
    } else if (
      (source[field] === undefined || source[field] === null || source[field] === '') &&
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      source[field] = value;
    }
  }
  const normalized = {};

  for (const [key, rawValue] of Object.entries(source)) {
    const field = ATTRIBUTION_ALIASES[key] || key;
    if (ATTRIBUTION_INTERNAL_ID_FIELDS.includes(field)) {
      const value = normalizeOptionalObjectId(rawValue);
      if (value !== null && value !== undefined && !mongoose.isValidObjectId(value)) {
        throw Object.assign(new Error(`${field} debe ser un ObjectId interno valido`), {
          status: 400
        });
      }
      if (value !== undefined) normalized[field] = value;
      continue;
    }
    if (ATTRIBUTION_STRING_FIELDS.includes(field)) {
      const value = field === 'landingPageUrl'
        ? safePublicUrl(rawValue)
        : sanitizePlainText(rawValue, field === 'landingPageUrl' ? 1000 : 500);
      if (value) normalized[field] = value;
      continue;
    }
    if (field === 'firstInteractionAt' || field === 'lastInteractionAt') {
      const value = dateOrNull(rawValue);
      if (value) normalized[field] = value;
    }
    if (field === 'metadata') {
      normalized.metadata = sanitizeMarketingValue(rawValue || {});
    }
  }
  return normalized;
}

export function mergeMarketingAttribution(current = {}, incoming = {}, now = new Date()) {
  const previous = current?.toObject?.() || current || {};
  const next = normalizeMarketingAttribution(incoming);
  const hasIncoming = Object.keys(next).some((key) =>
    key !== 'metadata' && next[key] !== '' && next[key] !== null && next[key] !== undefined
  );
  return {
    ...previous,
    ...next,
    metadata: {
      ...(previous.metadata || {}),
      ...(next.metadata || {})
    },
    firstInteractionAt:
      previous.firstInteractionAt || next.firstInteractionAt || (hasIncoming ? now : null),
    lastInteractionAt:
      next.lastInteractionAt || (hasIncoming ? now : previous.lastInteractionAt || null)
  };
}

export function attributionFromTracking(tracking = {}, input = {}, defaults = {}) {
  const utm = tracking.utm || {};
  return normalizeMarketingAttribution(
    {
      ...(input && typeof input === 'object' ? input : {}),
      utmSource: utm.utm_source,
      utmMedium: utm.utm_medium,
      utmCampaign: utm.utm_campaign,
      utmContent: utm.utm_content,
      utmTerm: utm.utm_term,
      source: input?.source || utm.utm_source,
      medium: input?.medium || utm.utm_medium,
      channel: input?.channel || input?.entryChannel,
      landingPageUrl: input?.landingPageUrl || tracking.referrer
    },
    defaults
  );
}
