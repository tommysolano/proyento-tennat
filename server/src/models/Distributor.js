import mongoose from 'mongoose';

const distributorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    ownerName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'trial'],
      default: 'active'
    },
    region: {
      type: String,
      default: 'LatAm'
    }
  },
  { timestamps: true }
);

export const Distributor = mongoose.model('Distributor', distributorSchema);
