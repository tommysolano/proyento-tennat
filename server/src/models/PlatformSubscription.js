import mongoose from 'mongoose';

const platformSubscriptionSchema = new mongoose.Schema(
  {
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      required: true,
      index: true
    },
    platformPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformPlan',
      required: true
    },
    status: {
      type: String,
      enum: ['trial', 'active', 'past_due', 'cancelled', 'suspended'],
      default: 'trial'
    },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, default: null },
    trialEndsAt: { type: Date, default: null },
    currentPeriodStart: { type: Date, default: Date.now },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    paymentProvider: { type: String, default: 'manual' },
    providerCustomerId: { type: String, default: '' },
    providerSubscriptionId: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

platformSubscriptionSchema.index({ distributorId: 1, createdAt: -1 });

export const PlatformSubscription = mongoose.model(
  'PlatformSubscription',
  platformSubscriptionSchema
);
