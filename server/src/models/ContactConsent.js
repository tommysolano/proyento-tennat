import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';
import { normalizeOptionalObjectId } from '../utils/validation.js';

export const CONSENT_CHANNELS = [
  'whatsapp',
  'sms',
  'email',
  'call',
  'facebook_messenger',
  'instagram_dm',
  'other'
];
export const CONSENT_STATUSES = [
  'opted_in',
  'opted_out',
  'unknown',
  'transactional_only',
  'blocked'
];
export const CONSENT_SOURCES = [
  'manual',
  'form',
  'booking',
  'import',
  'integration',
  'inbound_message',
  'unsubscribe_link',
  'api',
  'other'
];

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: CONSENT_STATUSES, required: true },
    source: { type: String, enum: CONSENT_SOURCES, required: true },
    legalBasis: { type: String, trim: true, maxlength: 300, default: '' },
    consentText: { type: String, trim: true, maxlength: 2000, default: '' },
    consentVersion: { type: String, trim: true, maxlength: 100, default: '' },
    reason: { type: String, trim: true, maxlength: 1000, default: '' },
    sourceReference: { type: String, trim: true, maxlength: 300, default: '' },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      set: normalizeOptionalObjectId
    },
    evidence: { type: mongoose.Schema.Types.Mixed, default: {} },
    recordedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const contactConsentSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null,
      set: normalizeOptionalObjectId
    },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
    channel: { type: String, enum: CONSENT_CHANNELS, required: true },
    status: { type: String, enum: CONSENT_STATUSES, default: 'unknown' },
    source: { type: String, enum: CONSENT_SOURCES, default: 'other' },
    legalBasis: { type: String, trim: true, maxlength: 300, default: '' },
    consentText: { type: String, trim: true, maxlength: 2000, default: '' },
    consentVersion: { type: String, trim: true, maxlength: 100, default: '' },
    sourceReference: { type: String, trim: true, maxlength: 300, default: '' },
    consentedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      set: normalizeOptionalObjectId
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    evidence: { type: mongoose.Schema.Types.Mixed, default: {} },
    history: { type: [historySchema], default: [] }
  },
  { timestamps: true }
);

contactConsentSchema.pre('validate', function sanitizeConsent(next) {
  this.metadata = sanitize(this.metadata || {});
  this.evidence = sanitize(this.evidence || {});
  for (const item of this.history || []) item.evidence = sanitize(item.evidence || {});
  next();
});

contactConsentSchema.index(
  { companyId: 1, contactId: 1, channel: 1 },
  { unique: true }
);
contactConsentSchema.index({ companyId: 1, channel: 1, status: 1 });
contactConsentSchema.index({ companyId: 1, updatedAt: -1 });

export const ContactConsent = mongoose.model('ContactConsent', contactConsentSchema);
