import mongoose from 'mongoose';

const planSchema = new mongoose.Schema(
  {
    // Commercial plan sold by a Distributor to its Companies.
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      required: true
    },
    description: {
      type: String,
      default: ''
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
      trim: true
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly'
    },
    limits: {
      users: { type: Number, default: 10, min: 0 },
      contacts: { type: Number, default: 1000, min: 0 },
      messages: { type: Number, default: 0, min: 0 },
      storageMb: { type: Number, default: 1024, min: 0 },
      modules: { type: Number, default: 3, min: 0 }
    },
    includedModules: { type: [String], default: ['core', 'crm', 'contacts'] },
    features: {
      type: [String],
      default: []
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'archived'],
      default: 'active'
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

planSchema.index({ distributorId: 1, code: 1 }, { unique: true });

export const Plan = mongoose.model('Plan', planSchema);
