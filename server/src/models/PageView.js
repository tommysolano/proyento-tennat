import mongoose from 'mongoose';
import { sanitizeMarketingValue } from '../modules/marketing/marketingSecurity.js';

const pageViewSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    landingPageId: { type: mongoose.Schema.Types.ObjectId, ref: 'LandingPage', default: null },
    funnelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Funnel', default: null },
    funnelStepId: { type: mongoose.Schema.Types.ObjectId, ref: 'FunnelStep', default: null },
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', default: null },
    sessionId: { type: String, default: '', maxlength: 100 },
    visitorId: { type: String, default: '', maxlength: 100 },
    ipHash: { type: String, default: '', maxlength: 64 },
    userAgent: { type: String, default: '', maxlength: 300 },
    referrer: { type: String, default: '', maxlength: 1000 },
    utm: { type: mongoose.Schema.Types.Mixed, default: {} },
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

export const PageView = mongoose.model('PageView', pageViewSchema);
