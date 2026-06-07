import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';

const workflowEventSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    eventType: { type: String, required: true, trim: true },
    sourceModule: { type: String, required: true, trim: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    idempotencyKey: { type: String, required: true, unique: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {}, select: false },
    status: {
      type: String,
      enum: ['pending', 'processed', 'ignored', 'failed'],
      default: 'pending'
    },
    processedAt: { type: Date, default: null },
    error: { type: mongoose.Schema.Types.Mixed, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (document, value) => {
        delete value.payload;
        return value;
      }
    }
  }
);

workflowEventSchema.pre('validate', function sanitizeEvent(next) {
  this.payload = sanitize(this.payload || {});
  this.metadata = sanitize(this.metadata || {});
  this.error = sanitize(this.error);
  next();
});

workflowEventSchema.index({ companyId: 1, eventType: 1, createdAt: -1 });
workflowEventSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const WorkflowEvent = mongoose.model('WorkflowEvent', workflowEventSchema);
