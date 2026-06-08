import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';
import { sanitizeReputationText } from '../modules/reputation/reputationSecurity.js';

export const REFERRAL_PROGRAM_STATUSES = ['draft', 'active', 'paused', 'archived'];

const referralProgramSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    name: { type: String, required: true, maxlength: 160 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    },
    status: { type: String, enum: REFERRAL_PROGRAM_STATUSES, default: 'draft' },
    rewardDescription: { type: String, default: '', maxlength: 2000 },
    referrerReward: { type: String, default: '', maxlength: 1000 },
    refereeReward: { type: String, default: '', maxlength: 1000 },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

referralProgramSchema.pre('validate', function sanitizeProgram(next) {
  this.name = sanitizeReputationText(this.name, 160);
  this.rewardDescription = sanitizeReputationText(this.rewardDescription, 2000);
  this.referrerReward = sanitizeReputationText(this.referrerReward, 1000);
  this.refereeReward = sanitizeReputationText(this.refereeReward, 1000);
  this.settings = sanitize(this.settings || {});
  this.metadata = sanitize(this.metadata || {});
  next();
});
referralProgramSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const ReferralProgram = mongoose.model('ReferralProgram', referralProgramSchema);
