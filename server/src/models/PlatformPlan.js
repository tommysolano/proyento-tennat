import mongoose from 'mongoose';

const platformLimitsSchema = new mongoose.Schema(
  {
    companies: { type: Number, default: 1, min: 0 },
    users: { type: Number, default: 5, min: 0 },
    contacts: { type: Number, default: 1000, min: 0 },
    modules: { type: Number, default: 3, min: 0 },
    storageMb: { type: Number, default: 1024, min: 0 },
    messages: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const platformPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '', trim: true },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD', uppercase: true, trim: true },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly'
    },
    limits: { type: platformLimitsSchema, default: () => ({}) },
    includedModules: { type: [String], default: ['core'] },
    status: {
      type: String,
      enum: ['active', 'inactive', 'archived'],
      default: 'active'
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export const PlatformPlan = mongoose.model('PlatformPlan', platformPlanSchema);
