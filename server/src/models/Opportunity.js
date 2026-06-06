import mongoose from 'mongoose';
import { CRM_PRIORITIES } from './Contact.js';

export const OPPORTUNITY_STATUSES = ['open', 'won', 'lost', 'archived'];

const opportunitySchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
    pipelineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pipeline', required: true },
    stageId: { type: mongoose.Schema.Types.ObjectId, ref: 'PipelineStage', required: true },
    title: { type: String, required: true, trim: true },
    value: { type: Number, min: 0, default: 0 },
    currency: { type: String, trim: true, uppercase: true, default: 'USD' },
    status: { type: String, enum: OPPORTUNITY_STATUSES, default: 'open' },
    probability: { type: Number, min: 0, max: 100, default: 0 },
    expectedCloseDate: { type: Date, default: null },
    nextFollowUpAt: { type: Date, default: null },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    source: { type: String, trim: true, default: '' },
    priority: { type: String, enum: CRM_PRIORITIES, default: 'medium' },
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    lostReason: { type: String, trim: true, default: '' },
    wonAt: { type: Date, default: null },
    lostAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

opportunitySchema.index({ companyId: 1, pipelineId: 1, stageId: 1, status: 1 });
opportunitySchema.index({ companyId: 1, assignedTo: 1 });
opportunitySchema.index({ companyId: 1, contactId: 1 });

export const Opportunity = mongoose.model('Opportunity', opportunitySchema);
