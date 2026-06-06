import mongoose from 'mongoose';

const pipelineStageSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    pipelineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pipeline', required: true },
    name: { type: String, required: true, trim: true },
    order: { type: Number, required: true, default: 0 },
    probability: { type: Number, min: 0, max: 100, default: 0 },
    color: { type: String, default: '#0e7490', match: /^#[0-9a-fA-F]{6}$/ },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
  },
  { timestamps: true }
);

pipelineStageSchema.index({ companyId: 1, pipelineId: 1, order: 1 });

export const PipelineStage = mongoose.model('PipelineStage', pipelineStageSchema);
