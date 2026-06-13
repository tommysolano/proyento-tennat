import mongoose from 'mongoose';
import {
  safePublicUrl,
  sanitizeLimitedHtml,
  sanitizePlainText
} from '../modules/marketing/marketingSecurity.js';
import { sanitize } from '../utils/sanitize.js';
import { normalizeOptionalObjectId } from '../utils/validation.js';
import { marketingAttributionSchema } from '../modules/marketing/marketingAttribution.js';

export const LANDING_PAGE_STATUSES = ['draft', 'published', 'paused', 'archived'];
export const LANDING_SECTION_TYPES = [
  'hero',
  'text',
  'image',
  'button',
  'form_embed',
  'booking_embed',
  'review_widget_embed',
  'testimonials_static',
  'faq',
  'custom_html_limited'
];

const sectionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: LANDING_SECTION_TYPES, required: true },
    order: { type: Number, min: 0, default: 0 },
    content: { type: mongoose.Schema.Types.Mixed, default: {} },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { _id: true }
);

const landingPageSchema = new mongoose.Schema(
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
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: '', maxlength: 2000 },
    status: { type: String, enum: LANDING_PAGE_STATUSES, default: 'draft' },
    content: {
      sections: {
        type: [sectionSchema],
        default: [],
        validate: {
          validator: (items) => items.length <= 50,
          message: 'Una landing admite maximo 50 secciones'
        }
      },
      html: { type: String, default: '', maxlength: 20000 },
      blocks: { type: [mongoose.Schema.Types.Mixed], default: [] }
    },
    seo: {
      title: { type: String, default: '', maxlength: 180 },
      description: { type: String, default: '', maxlength: 320 },
      imageUrl: { type: String, default: '', maxlength: 1000 },
      noIndex: { type: Boolean, default: false }
    },
    styling: {
      primaryColor: { type: String, default: '#0e7490', match: /^#[0-9a-fA-F]{6}$/ },
      backgroundColor: { type: String, default: '#ffffff', match: /^#[0-9a-fA-F]{6}$/ },
      textColor: { type: String, default: '#0f172a', match: /^#[0-9a-fA-F]{6}$/ }
    },
    settings: {
      redirectUrl: { type: String, default: '', maxlength: 1000 },
      trackingEnabled: { type: Boolean, default: true },
      associatedFormId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Form',
        default: null,
        set: normalizeOptionalObjectId
      },
      associatedBookingLinkId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BookingLink',
        default: null,
        set: normalizeOptionalObjectId
      }
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    attribution: { type: marketingAttributionSchema, default: () => ({}) },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

landingPageSchema.pre('validate', function sanitizeLanding(next) {
  this.description = sanitizePlainText(this.description, 2000);
  this.content.html = sanitizeLimitedHtml(this.content.html);
  for (const section of this.content.sections || []) {
    section.content = sanitize(section.content || {});
    if (section.type === 'custom_html_limited') {
      section.content.html = sanitizeLimitedHtml(section.content.html);
    }
    for (const key of ['url', 'imageUrl', 'href']) {
      if (section.content?.[key]) section.content[key] = safePublicUrl(section.content[key]);
    }
    section.settings = sanitize(section.settings || {});
  }
  this.seo.title = sanitizePlainText(this.seo.title, 180);
  this.seo.description = sanitizePlainText(this.seo.description, 320);
  this.seo.imageUrl = safePublicUrl(this.seo.imageUrl);
  this.settings.redirectUrl = safePublicUrl(this.settings.redirectUrl);
  this.metadata = sanitize(this.metadata || {});
  next();
});

landingPageSchema.index({ companyId: 1, status: 1, createdAt: -1 });
landingPageSchema.index({ companyId: 1, 'attribution.campaignId': 1 });

export const LandingPage = mongoose.model('LandingPage', landingPageSchema);
