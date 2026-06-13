import mongoose from 'mongoose';

const tagSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true },
    color: {
      type: String,
      default: '#0e7490',
      match: [/^#[0-9a-fA-F]{6}$/, 'color debe usar formato hexadecimal']
    },
    description: { type: String, trim: true, default: '' },
    scope: {
      type: String,
      enum: ['contact', 'opportunity', 'appointment', 'workflow'],
      default: 'contact'
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

tagSchema.index({ companyId: 1, normalizedName: 1 }, { unique: true });
tagSchema.index({ companyId: 1, scope: 1, status: 1, name: 1 });

export const Tag = mongoose.model('Tag', tagSchema);
