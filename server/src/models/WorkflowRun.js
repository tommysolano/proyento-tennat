import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';

export const WORKFLOW_RUN_STATUSES = [
  'queued',
  'running',
  'waiting',
  'completed',
  'failed',
  'skipped',
  'cancelled'
];

const conditionResultSchema = new mongoose.Schema(
  {
    field: String,
    operator: String,
    expected: mongoose.Schema.Types.Mixed,
    actual: mongoose.Schema.Types.Mixed,
    matched: Boolean
  },
  { _id: false }
);

const actionResultSchema = new mongoose.Schema(
  {
    actionIndex: { type: Number, required: true },
    actionType: { type: String, required: true },
    status: {
      type: String,
      enum: ['completed', 'failed', 'skipped', 'scheduled'],
      required: true
    },
    result: { type: mongoose.Schema.Types.Mixed, default: {} },
    error: { type: mongoose.Schema.Types.Mixed, default: null },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    durationMs: { type: Number, min: 0, default: 0 }
  },
  { _id: true }
);

const workflowRunSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true },
    workflowVersion: { type: Number, min: 1, required: true },
    status: { type: String, enum: WORKFLOW_RUN_STATUSES, default: 'queued' },
    triggerType: { type: String, default: 'event' },
    eventType: { type: String, required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowEvent', default: null },
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    idempotencyKey: { type: String, required: true, unique: true },
    matchedConditions: { type: [conditionResultSchema], default: [] },
    executedActions: { type: [actionResultSchema], default: [] },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dryRun: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    durationMs: { type: Number, min: 0, default: 0 },
    error: { type: mongoose.Schema.Types.Mixed, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

workflowRunSchema.pre('validate', function sanitizeRun(next) {
  this.error = sanitize(this.error);
  this.metadata = sanitize(this.metadata || {});
  for (const item of this.executedActions || []) {
    item.result = sanitize(item.result || {});
    item.error = sanitize(item.error);
  }
  next();
});

workflowRunSchema.index({ companyId: 1, workflowId: 1, createdAt: -1 });
workflowRunSchema.index({ companyId: 1, status: 1, createdAt: -1 });
workflowRunSchema.index({ workflowId: 1, entityType: 1, entityId: 1, createdAt: -1 });

export const WorkflowRun = mongoose.model('WorkflowRun', workflowRunSchema);
