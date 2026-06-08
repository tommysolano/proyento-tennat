import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';

export const COUPON_REDEMPTION_STATUSES = ['issued', 'redeemed', 'cancelled', 'expired'];

const couponRedemptionSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    status: { type: String, enum: COUPON_REDEMPTION_STATUSES, default: 'issued' },
    redeemedAt: { type: Date, default: null },
    redeemedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    source: { type: String, default: 'manual', maxlength: 80 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

couponRedemptionSchema.pre('validate', function sanitizeRedemption(next) {
  this.metadata = sanitize(this.metadata || {});
  next();
});
couponRedemptionSchema.index({ companyId: 1, contactId: 1, createdAt: -1 });
couponRedemptionSchema.index({ companyId: 1, couponId: 1, status: 1 });

export const CouponRedemption = mongoose.model(
  'CouponRedemption',
  couponRedemptionSchema
);
