import mongoose from 'mongoose';
import { sanitizeMarketingValue } from '../modules/marketing/marketingSecurity.js';
import { marketingAttributionSchema } from '../modules/marketing/marketingAttribution.js';
import { normalizeOptionalObjectId } from '../utils/validation.js';

const pageViewSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    landingPageId: { type: mongoose.Schema.Types.ObjectId, ref: 'LandingPage', default: null, set: normalizeOptionalObjectId },
    funnelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Funnel', default: null, set: normalizeOptionalObjectId },
    funnelStepId: { type: mongoose.Schema.Types.ObjectId, ref: 'FunnelStep', default: null, set: normalizeOptionalObjectId },
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', default: null, set: normalizeOptionalObjectId },
    sessionId: { type: String, default: '', maxlength: 100 },
    visitorId: { type: String, default: '', maxlength: 100 },
    ipHash: { type: String, default: '', maxlength: 64 },
    userAgent: { type: String, default: '', maxlength: 300 },
    referrer: { type: String, default: '', maxlength: 1000 },
    utm: { type: mongoose.Schema.Types.Mixed, default: {} },
    attribution: { type: marketingAttributionSchema, default: () => ({}) },
    path: { type: String, default: '', maxlength: 1000 }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

pageViewSchema.pre('validate', function sanitizePageView(next) {
  this.utm = sanitizeMarketingValue(this.utm || {});
  next();
});

pageViewSchema.index({ companyId: 1, landingPageId: 1, createdAt: -1 });
pageViewSchema.index({ companyId: 1, funnelId: 1, funnelStepId: 1, createdAt: -1 });
pageViewSchema.index({ companyId: 1, 'attribution.campaignId': 1, createdAt: -1 });

export const PageView = mongoose.model('PageView', pageViewSchema);
