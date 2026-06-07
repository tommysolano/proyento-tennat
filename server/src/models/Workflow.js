import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';

export const WORKFLOW_STATUSES = ['draft', 'active', 'paused', 'archived'];

const conditionSchema = new mongoose.Schema(
  {
    field: { type: String, required: true, trim: true },
    operator: { type: String, required: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { _id: true }
);

const actionSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    enabled: { type: Boolean, default: true }
  },
  { _id: true }
);

const workflowSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, default: '', maxlength: 1000 },
    status: { type: String, enum: WORKFLOW_STATUSES, default: 'draft' },
    trigger: {
      type: {
        type: String,
        enum: ['event'],
        default: 'event'
      },
      eventType: { type: String, required: true, trim: true },
      sourceModule: { type: String, required: true, trim: true },
      config: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    conditions: { type: [conditionSchema], default: [] },
    actions: { type: [actionSchema], default: [] },
    settings: {
      runOncePerEntity: { type: Boolean, default: false },
      allowReentry: { type: Boolean, default: true },
      cooldownMinutes: { type: Number, min: 0, max: 525600, default: 0 },
      maxRunsPerDay: { type: Number, min: 0, max: 100000, default: 0 },
      stopOnError: { type: Boolean, default: true },
      timezone: { type: String, default: 'America/Guayaquil', trim: true },
      preventSelfTrigger: { type: Boolean, default: true },
      maxChainDepth: { type: Number, min: 1, max: 20, default: 5 },
      notifyOnComplete: { type: Boolean, default: false }
    },
    version: { type: Number, min: 1, default: 1 },
    lastRunAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

workflowSchema.pre('validate', function sanitizeWorkflow(next) {
  this.description = sanitize(this.description || '');
  this.trigger.config = sanitize(this.trigger.config || {});
  this.metadata = sanitize(this.metadata || {});
  for (const action of this.actions || []) action.config = sanitize(action.config || {});
  next();
});

workflowSchema.index({ companyId: 1, status: 1, 'trigger.eventType': 1 });
workflowSchema.index({ companyId: 1, createdAt: -1 });

export const Workflow = mongoose.model('Workflow', workflowSchema);
