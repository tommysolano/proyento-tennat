import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';

export const REFERRAL_STATUSES = ['invited', 'submitted', 'converted', 'rejected', 'rewarded'];
export const REFERRAL_REWARD_STATUSES = [
  'pending', 'approved', 'paid_manually', 'cancelled'
];

const referralSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    referralProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReferralProgram', required: true },
    referrerContactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
    referredContactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 32 },
    status: { type: String, enum: REFERRAL_STATUSES, default: 'invited' },
    source: { type: String, default: 'manual', maxlength: 80 },
    rewardStatus: { type: String, enum: REFERRAL_REWARD_STATUSES, default: 'pending' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    convertedAt: { type: Date, default: null },
    rewardedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

referralSchema.pre('validate', function sanitizeReferral(next) {
  this.metadata = sanitize(this.metadata || {});
  next();
});
referralSchema.index({ referralProgramId: 1, code: 1 }, { unique: true });
referralSchema.index({ companyId: 1, referrerContactId: 1, createdAt: -1 });
referralSchema.index({ companyId: 1, referredContactId: 1, createdAt: -1 });

export const Referral = mongoose.model('Referral', referralSchema);
