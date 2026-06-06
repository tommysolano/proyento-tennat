import mongoose from 'mongoose';

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
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
    billingCycle: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
      default: 'monthly'
    },
    limits: {
      users: {
        type: Number,
        default: 10
      },
      contacts: {
        type: Number,
        default: 1000
      },
      channels: {
        type: Number,
        default: 2
      }
    },
    features: {
      type: [String],
      default: []
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'draft'],
      default: 'active'
    }
  },
  { timestamps: true }
);

export const Plan = mongoose.model('Plan', planSchema);
