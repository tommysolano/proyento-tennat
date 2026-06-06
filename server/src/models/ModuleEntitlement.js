import mongoose from 'mongoose';

const moduleEntitlementSchema = new mongoose.Schema(
  {
    scopeType: {
      type: String,
      enum: [
        'platform_plan',
        'distributor',
        'company',
        'company_subscription',
        'platform_subscription'
      ],
      required: true
    },
    scopeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    moduleKey: { type: String, required: true, lowercase: true, trim: true },
    enabled: { type: Boolean, default: true },
    limits: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

moduleEntitlementSchema.index(
  { scopeType: 1, scopeId: 1, moduleKey: 1 },
  { unique: true }
);

export const ModuleEntitlement = mongoose.model(
  'ModuleEntitlement',
  moduleEntitlementSchema
);
