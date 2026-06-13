import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';
import { normalizeOptionalObjectId } from '../utils/validation.js';
import { CONSENT_CHANNELS } from './ContactConsent.js';

export const SUPPRESSION_TYPES = ['email', 'phone', 'external_id'];
export const SUPPRESSION_STATUSES = ['active', 'revoked'];

const suppressionEntrySchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null,
      set: normalizeOptionalObjectId
    },
    type: { type: String, enum: SUPPRESSION_TYPES, required: true },
    normalizedValue: { type: String, required: true, trim: true, maxlength: 500 },
    displayValue: { type: String, trim: true, maxlength: 500, default: '' },
    channel: { type: String, enum: [...CONSENT_CHANNELS, 'all'], default: 'all' },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    source: { type: String, trim: true, maxlength: 100, default: 'manual' },
    status: { type: String, enum: SUPPRESSION_STATUSES, default: 'active' },
    expiresAt: { type: Date, default: null },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      set: normalizeOptionalObjectId
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      set: normalizeOptionalObjectId
    },
    revokedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

suppressionEntrySchema.pre('validate', function sanitizeSuppression(next) {
  this.metadata = sanitize(this.metadata || {});
  next();
});

suppressionEntrySchema.index(
  { companyId: 1, type: 1, normalizedValue: 1, channel: 1 },
  { unique: true }
);
suppressionEntrySchema.index({ companyId: 1, status: 1, channel: 1 });
suppressionEntrySchema.index({ companyId: 1, expiresAt: 1 });

export const SuppressionEntry = mongoose.model('SuppressionEntry', suppressionEntrySchema);
