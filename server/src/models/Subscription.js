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

subscriptionSchema.pre('validate', function validateTrial(next) {
  if (this.status === 'trial') {
    if (!this.startsAt) this.invalidate('startsAt', 'startsAt es requerido para trial');
    if (!this.trialEndsAt) {
      this.invalidate('trialEndsAt', 'trialEndsAt es requerido para trial');
    } else if (this.startsAt && this.trialEndsAt <= this.startsAt) {
      this.invalidate('trialEndsAt', 'trialEndsAt debe ser posterior a startsAt');
    }
  }
  next();
});

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
