import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';
import { normalizeOptionalObjectId } from '../utils/validation.js';
import {
  safePublicUrl,
  sanitizeMarketingValue,
  sanitizePlainText
} from '../modules/marketing/marketingSecurity.js';

export const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'completed', 'archived'];

const campaignSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: '', trim: true, maxlength: 3000 },
    channel: { type: String, default: '', trim: true, maxlength: 120 },
    source: { type: String, default: '', trim: true, maxlength: 120 },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft' },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    budget: {
      amount: { type: Number, min: 0, default: 0 },
      currency: { type: String, uppercase: true, trim: true, maxlength: 3, default: 'USD' }
    },
    externalIds: { type: mongoose.Schema.Types.Mixed, default: {} },
    referenceUrl: { type: String, default: '', maxlength: 1000 },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      set: normalizeOptionalObjectId
    },
    formIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Form', set: normalizeOptionalObjectId }],
    landingPageIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LandingPage',
      set: normalizeOptionalObjectId
    }],
    funnelIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Funnel', set: normalizeOptionalObjectId }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

campaignSchema.pre('validate', function sanitizeCampaign(next) {
  this.name = sanitizePlainText(this.name, 160);
  this.description = sanitizePlainText(this.description, 3000);
  this.channel = sanitizePlainText(this.channel, 120);
  this.source = sanitizePlainText(this.source, 120);
  this.referenceUrl = safePublicUrl(this.referenceUrl);
  this.externalIds = sanitizeMarketingValue(this.externalIds || {});
  this.metadata = sanitize(this.metadata || {});
  next();
});

campaignSchema.index({ companyId: 1, status: 1, createdAt: -1 });
campaignSchema.index({ companyId: 1, channel: 1, source: 1 });
campaignSchema.index({ companyId: 1, 'externalIds.campaignId': 1 });

export const Campaign = mongoose.model('Campaign', campaignSchema);
