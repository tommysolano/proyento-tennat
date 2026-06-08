import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';
import { sanitizeReputationText } from '../modules/reputation/reputationSecurity.js';

export const REVIEW_SOURCES = [
  'internal', 'google_placeholder', 'facebook_placeholder', 'imported'
];
export const REVIEW_STATUSES = ['new', 'approved', 'rejected', 'published', 'archived'];
export const REVIEW_SENTIMENTS = ['positive', 'neutral', 'negative', 'unknown'];

const reviewSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    reviewRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReviewRequest', default: null },
    source: { type: String, enum: REVIEW_SOURCES, default: 'internal' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: '', maxlength: 180 },
    comment: { type: String, required: true, maxlength: 5000 },
    reviewerName: { type: String, required: true, maxlength: 160 },
    reviewerEmail: { type: String, default: '', lowercase: true, trim: true, maxlength: 320 },
    status: { type: String, enum: REVIEW_STATUSES, default: 'new' },
    sentiment: { type: String, enum: REVIEW_SENTIMENTS, default: 'unknown' },
    publicApproved: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    responseText: { type: String, default: '', maxlength: 5000 },
    respondedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

reviewSchema.pre('validate', function sanitizeReview(next) {
  this.title = sanitizeReputationText(this.title, 180);
  this.comment = sanitizeReputationText(this.comment, 5000);
  this.reviewerName = sanitizeReputationText(this.reviewerName, 160);
  this.responseText = sanitizeReputationText(this.responseText, 5000);
  this.metadata = sanitize(this.metadata || {});
  next();
});
reviewSchema.index({ companyId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ companyId: 1, contactId: 1, createdAt: -1 });
reviewSchema.index({ reviewRequestId: 1 }, { unique: true, sparse: true });

export const Review = mongoose.model('Review', reviewSchema);
