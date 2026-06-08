import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';
import { sanitizeReputationText } from '../modules/reputation/reputationSecurity.js';

export const COUPON_DISCOUNT_TYPES = ['percentage', 'fixed_amount', 'custom'];
export const COUPON_STATUSES = ['draft', 'active', 'expired', 'disabled', 'archived'];

const couponSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 64 },
    name: { type: String, required: true, maxlength: 160 },
    description: { type: String, default: '', maxlength: 2000 },
    discountType: { type: String, enum: COUPON_DISCOUNT_TYPES, default: 'custom' },
    discountValue: { type: Number, min: 0, default: 0 },
    currency: { type: String, default: 'USD', uppercase: true, trim: true, maxlength: 3 },
    status: { type: String, enum: COUPON_STATUSES, default: 'draft' },
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    maxRedemptions: { type: Number, min: 0, default: 0 },
    perContactLimit: { type: Number, min: 1, default: 1 },
    usageCount: { type: Number, min: 0, default: 0 },
    applicableTo: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

couponSchema.pre('validate', function sanitizeCoupon(next) {
  this.name = sanitizeReputationText(this.name, 160);
  this.description = sanitizeReputationText(this.description, 2000);
  this.applicableTo = sanitize(this.applicableTo || {});
  this.metadata = sanitize(this.metadata || {});
  next();
});
couponSchema.index({ companyId: 1, code: 1 }, { unique: true });
couponSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const Coupon = mongoose.model('Coupon', couponSchema);
