import mongoose from 'mongoose';
import { sanitizeMarketingValue } from '../modules/marketing/marketingSecurity.js';
import { sanitize } from '../utils/sanitize.js';
import { marketingAttributionSchema } from '../modules/marketing/marketingAttribution.js';
import { normalizeOptionalObjectId } from '../utils/validation.js';

const formSubmissionSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: true },
    sourceType: {
      type: String,
      enum: ['form', 'landing_page', 'funnel_step', 'public_booking'],
      default: 'form'
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      set: normalizeOptionalObjectId
    },
    funnelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Funnel',
      default: null,
      set: normalizeOptionalObjectId
    },
    funnelStepId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FunnelStep',
      default: null,
      set: normalizeOptionalObjectId
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      default: null,
      set: normalizeOptionalObjectId
    },
    opportunityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Opportunity',
      default: null,
      set: normalizeOptionalObjectId
    },
    values: { type: mongoose.Schema.Types.Mixed, default: {} },
    normalizedValues: { type: mongoose.Schema.Types.Mixed, default: {}, select: false },
    status: {
      type: String,
      enum: ['received', 'processed', 'spam', 'failed', 'ignored'],
      default: 'received'
    },
    ipHash: { type: String, default: '', maxlength: 64 },
    userAgent: { type: String, default: '', maxlength: 300 },
    referrer: { type: String, default: '', maxlength: 1000 },
    utm: { type: mongoose.Schema.Types.Mixed, default: {} },
    consent: {
      granted: { type: Boolean, default: false },
      text: { type: String, default: '', maxlength: 1000 },
      grantedAt: { type: Date, default: null }
    },
    spamScore: { type: Number, min: 0, max: 100, default: 0 },
    error: { type: mongoose.Schema.Types.Mixed, default: null },
    attribution: { type: marketingAttributionSchema, default: () => ({}) },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

formSubmissionSchema.pre('validate', function sanitizeSubmission(next) {
  this.values = sanitizeMarketingValue(this.values || {});
  this.normalizedValues = sanitizeMarketingValue(this.normalizedValues || {});
  this.utm = sanitizeMarketingValue(this.utm || {});
  this.error = sanitize(this.error);
  this.metadata = sanitize(this.metadata || {});
  next();
});

formSubmissionSchema.index({ companyId: 1, formId: 1, createdAt: -1 });
formSubmissionSchema.index({ formId: 1, status: 1, createdAt: -1 });
formSubmissionSchema.index({ companyId: 1, contactId: 1, createdAt: -1 });
formSubmissionSchema.index({ companyId: 1, 'attribution.campaignId': 1, createdAt: -1 });

export const FormSubmission = mongoose.model('FormSubmission', formSubmissionSchema);
