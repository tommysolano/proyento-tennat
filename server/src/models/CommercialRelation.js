import mongoose from 'mongoose';

export const COMMERCIAL_RELATION_TYPES = [
  'buyer',
  'interested',
  'decision_maker',
  'participant',
  'primary_contact',
  'secondary_contact',
  'other'
];

const commercialRelationSchema = new mongoose.Schema(
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
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      required: true
    },
    opportunityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Opportunity',
      required: true
    },
    relationType: {
      type: String,
      enum: COMMERCIAL_RELATION_TYPES,
      default: 'participant'
    },
    channel: {
      type: String,
      trim: true,
      default: ''
    },
    campaign: {
      type: String,
      trim: true,
      default: ''
    },
    consultedProduct: {
      type: String,
      trim: true,
      default: ''
    },
    purchasedProduct: {
      type: String,
      trim: true,
      default: ''
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: ''
    },
    relatedAt: {
      type: Date,
      default: Date.now
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

commercialRelationSchema.index(
  { companyId: 1, contactId: 1, opportunityId: 1, relationType: 1 },
  { unique: true }
);
commercialRelationSchema.index({ companyId: 1, contactId: 1, relatedAt: -1 });
commercialRelationSchema.index({ companyId: 1, opportunityId: 1, relatedAt: -1 });

export const CommercialRelation = mongoose.model(
  'CommercialRelation',
  commercialRelationSchema
);
