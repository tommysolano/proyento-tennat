import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';

export const CONVERSION_TYPES = [
  'page_view',
  'form_submission',
  'booking_created',
  'contact_created',
  'opportunity_created',
  'button_click'
];

const conversionEventSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    type: { type: String, enum: CONVERSION_TYPES, required: true },
    landingPageId: { type: mongoose.Schema.Types.ObjectId, ref: 'LandingPage', default: null },
    funnelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Funnel', default: null },
    funnelStepId: { type: mongoose.Schema.Types.ObjectId, ref: 'FunnelStep', default: null },
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', default: null },
    formSubmissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FormSubmission',
      default: null
    },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', default: null },
    value: { type: Number, min: 0, default: 0 },
    currency: { type: String, default: 'USD', uppercase: true, maxlength: 3 },
    sessionId: { type: String, default: '', maxlength: 100 },
    visitorId: { type: String, default: '', maxlength: 100 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

conversionEventSchema.pre('validate', function sanitizeConversion(next) {
  this.metadata = sanitize(this.metadata || {});
  next();
});

conversionEventSchema.index({ companyId: 1, type: 1, createdAt: -1 });
conversionEventSchema.index({ companyId: 1, funnelId: 1, funnelStepId: 1, createdAt: -1 });
conversionEventSchema.index({ companyId: 1, formId: 1, createdAt: -1 });

export const ConversionEvent = mongoose.model('ConversionEvent', conversionEventSchema);
