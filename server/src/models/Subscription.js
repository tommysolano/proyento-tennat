import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
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
      enum: ['active', 'past_due', 'cancelled', 'trial'],
      default: 'active'
    },
    startsAt: {
      type: Date,
      default: Date.now
    },
    endsAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
