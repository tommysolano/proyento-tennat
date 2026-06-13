import mongoose from 'mongoose';

export const CRM_LIST_ENTITY_TYPES = ['contact', 'opportunity'];

const crmListSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    entityType: {
      type: String,
      enum: CRM_LIST_ENTITY_TYPES,
      required: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { timestamps: true }
);

crmListSchema.index({ companyId: 1, entityType: 1, status: 1, name: 1 });

export const CrmList = mongoose.model('CrmList', crmListSchema);
