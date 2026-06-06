import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    // Company subscription to a commercial Plan owned by its Distributor.
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true
    },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      required: true
    },
    status: {
      type: String,
      enum: ['trial', 'active', 'past_due', 'cancelled', 'suspended'],
      default: 'active'
    },
    startsAt: {
      type: Date,
      default: Date.now
    },
    endsAt: {
      type: Date,
      default: null
    },
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

subscriptionSchema.index({ distributorId: 1, companyId: 1, createdAt: -1 });

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
