import mongoose from 'mongoose';

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    taxId: {
      type: String,
      trim: true
    },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      required: true
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    industry: {
      type: String,
      default: 'Servicios'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'trial'],
      default: 'active'
    }
  },
  { timestamps: true }
);

export const Company = mongoose.model('Company', companySchema);
