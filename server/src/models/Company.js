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
      enum: ['active', 'suspended', 'cancelled', 'trial', 'inactive'],
      default: 'active'
    },
    settings: {
      timezone: { type: String, default: 'America/Guayaquil' },
      locale: { type: String, default: 'es-EC' },
      enabledModules: { type: [String], default: [] },
      businessInfo: {
        address: { type: String, default: '' },
        phone: { type: String, default: '' },
        email: { type: String, default: '' }
      }
    },
    onboarding: {
      completed: { type: Boolean, default: false },
      steps: {
        profile: { type: Boolean, default: false },
        users: { type: Boolean, default: false },
        contacts: { type: Boolean, default: false },
        firstAssignment: { type: Boolean, default: false }
      }
    }
  },
  { timestamps: true }
);

export const Company = mongoose.model('Company', companySchema);
