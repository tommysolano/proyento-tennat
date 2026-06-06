import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    relatedType: { type: String, enum: ['contact', 'opportunity'], required: true },
    relatedId: { type: mongoose.Schema.Types.ObjectId, required: true },
    text: { type: String, required: true, trim: true, maxlength: 5000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    visibility: { type: String, enum: ['internal', 'team'], default: 'team' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

noteSchema.index({ companyId: 1, relatedType: 1, relatedId: 1, createdAt: -1 });

export const Note = mongoose.model('Note', noteSchema);
