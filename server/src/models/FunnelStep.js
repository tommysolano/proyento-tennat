import mongoose from 'mongoose';
import {
  safePublicUrl,
  sanitizeLimitedHtml,
  sanitizePlainText
} from '../modules/marketing/marketingSecurity.js';
import { sanitize } from '../utils/sanitize.js';

export const FUNNEL_STEP_TYPES = [
  'landing',
  'form',
  'survey',
  'booking',
  'thank_you',
  'redirect'
];
export const FUNNEL_STEP_STATUSES = ['draft', 'published', 'paused', 'archived'];

const funnelStepSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    funnelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Funnel', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    },
    type: { type: String, enum: FUNNEL_STEP_TYPES, default: 'landing' },
    order: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: FUNNEL_STEP_STATUSES, default: 'draft' },
    landingPageId: { type: mongoose.Schema.Types.ObjectId, ref: 'LandingPage', default: null },
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', default: null },
    bookingLinkId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookingLink', default: null },
    content: {
      title: { type: String, default: '', maxlength: 180 },
      description: { type: String, default: '', maxlength: 2000 },
      html: { type: String, default: '', maxlength: 20000 }
    },
    settings: {
      redirectUrl: { type: String, default: '', maxlength: 1000 },
      nextStepId: { type: mongoose.Schema.Types.ObjectId, ref: 'FunnelStep', default: null }
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

funnelStepSchema.pre('validate', function sanitizeFunnelStep(next) {
  this.content.title = sanitizePlainText(this.content.title, 180);
  this.content.description = sanitizePlainText(this.content.description, 2000);
  this.content.html = sanitizeLimitedHtml(this.content.html);
  this.settings.redirectUrl = safePublicUrl(this.settings.redirectUrl);
  this.metadata = sanitize(this.metadata || {});
  next();
});

funnelStepSchema.index({ funnelId: 1, slug: 1 }, { unique: true });
funnelStepSchema.index({ companyId: 1, funnelId: 1, order: 1 });

export const FunnelStep = mongoose.model('FunnelStep', funnelStepSchema);
