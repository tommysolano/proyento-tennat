import mongoose from 'mongoose';
import { safePublicUrl, sanitizePlainText } from '../modules/marketing/marketingSecurity.js';
import { sanitize } from '../utils/sanitize.js';
import { normalizeOptionalObjectId } from '../utils/validation.js';

export const FUNNEL_STATUSES = ['draft', 'published', 'paused', 'archived'];

const funnelSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    },
    description: { type: String, default: '', maxlength: 2000 },
    status: { type: String, enum: FUNNEL_STATUSES, default: 'draft' },
    settings: {
      defaultRedirectUrl: { type: String, default: '', maxlength: 1000 },
      trackingEnabled: { type: Boolean, default: true },
      customDomainPlaceholder: { type: String, default: '', maxlength: 255 },
      entryStepId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FunnelStep',
        default: null,
        set: normalizeOptionalObjectId
      }
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

funnelSchema.pre('validate', function sanitizeFunnel(next) {
  this.description = sanitizePlainText(this.description, 2000);
  this.settings.defaultRedirectUrl = safePublicUrl(this.settings.defaultRedirectUrl);
  this.settings.customDomainPlaceholder = sanitizePlainText(
    this.settings.customDomainPlaceholder,
    255
  );
  this.metadata = sanitize(this.metadata || {});
  next();
});

funnelSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const Funnel = mongoose.model('Funnel', funnelSchema);
