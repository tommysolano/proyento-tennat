import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';
import {
  safeImageUrl,
  sanitizeReputationText
} from '../modules/reputation/reputationSecurity.js';

export const TESTIMONIAL_STATUSES = ['draft', 'published', 'archived'];

const testimonialSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    reviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', default: null },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    authorName: { type: String, required: true, maxlength: 160 },
    authorTitle: { type: String, default: '', maxlength: 160 },
    quote: { type: String, required: true, maxlength: 5000 },
    rating: { type: Number, min: 1, max: 5, default: null },
    imageUrl: { type: String, default: '', maxlength: 1000 },
    status: { type: String, enum: TESTIMONIAL_STATUSES, default: 'draft' },
    featured: { type: Boolean, default: false },
    order: { type: Number, min: 0, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

testimonialSchema.pre('validate', function sanitizeTestimonial(next) {
  this.authorName = sanitizeReputationText(this.authorName, 160);
  this.authorTitle = sanitizeReputationText(this.authorTitle, 160);
  this.quote = sanitizeReputationText(this.quote, 5000);
  this.imageUrl = safeImageUrl(this.imageUrl);
  this.metadata = sanitize(this.metadata || {});
  next();
});
testimonialSchema.index({ companyId: 1, status: 1, featured: 1, order: 1 });

export const Testimonial = mongoose.model('Testimonial', testimonialSchema);
