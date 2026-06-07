import mongoose from 'mongoose';

export const JOB_TYPES = [
  'webhook.whatsapp.inbound',
  'webhook.whatsapp.status',
  'message.whatsapp.send',
  'media.whatsapp.download',
  'notification.dispatch',
  'appointment.reminder',
  'workflow.run'
];
export const JOB_STATUSES = ['pending', 'processing', 'completed', 'failed', 'dead'];

const jobSchema = new mongoose.Schema(
  {
    type: { type: String, enum: JOB_TYPES, required: true },
    status: { type: String, enum: JOB_STATUSES, default: 'pending' },
    priority: { type: Number, default: 0 },
    payload: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
    attempts: { type: Number, min: 0, default: 0 },
    maxAttempts: {
      type: Number,
      min: 1,
      default: () => Number(process.env.JOB_MAX_ATTEMPTS || 5)
    },
    runAt: { type: Date, default: Date.now },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: '' },
    processedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    error: { type: mongoose.Schema.Types.Mixed, default: null },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

jobSchema.index({ status: 1, runAt: 1, priority: -1, createdAt: 1 });
jobSchema.index({ companyId: 1, status: 1, createdAt: -1 });
jobSchema.index({ distributorId: 1, status: 1, createdAt: -1 });
jobSchema.index({ lockedAt: 1 });

export const Job = mongoose.model('Job', jobSchema);
