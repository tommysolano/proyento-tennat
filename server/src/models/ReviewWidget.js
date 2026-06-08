import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';
import { sanitizeReputationText } from '../modules/reputation/reputationSecurity.js';

export const REVIEW_WIDGET_TYPES = ['carousel', 'list', 'grid', 'badge'];
export const REVIEW_WIDGET_STATUSES = ['draft', 'published', 'archived'];

const reviewWidgetSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    name: { type: String, required: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    },
    type: { type: String, enum: REVIEW_WIDGET_TYPES, default: 'grid' },
    status: { type: String, enum: REVIEW_WIDGET_STATUSES, default: 'draft' },
    settings: {
      minRating: { type: Number, min: 1, max: 5, default: 4 },
      maxItems: { type: Number, min: 1, max: 100, default: 12 },
      showRating: { type: Boolean, default: true },
      showAuthor: { type: Boolean, default: true },
      showDate: { type: Boolean, default: true },
      onlyFeatured: { type: Boolean, default: false },
      sources: { type: [String], default: ['internal'] }
    },
    styling: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    publishedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

reviewWidgetSchema.pre('validate', function sanitizeWidget(next) {
  this.name = sanitizeReputationText(this.name, 120);
  this.styling = sanitize(this.styling || {});
  this.metadata = sanitize(this.metadata || {});
  next();
});
reviewWidgetSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const ReviewWidget = mongoose.model('ReviewWidget', reviewWidgetSchema);
