import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';

export const ALERT_SEVERITIES = ['info', 'warning', 'critical'];
export const ALERT_TYPES = [
  'dead_jobs',
  'webhook_signature_failed',
  'channel_error',
  'message_failures',
  'usage_limit_reached',
  'credentials_error',
  'workflow_failure',
  'workflow_action'
];

const operationalAlertSchema = new mongoose.Schema(
  {
    scopeType: {
      type: String,
      enum: ['platform', 'distributor', 'company'],
      required: true
    },
    scopeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    severity: { type: String, enum: ALERT_SEVERITIES, required: true },
    type: { type: String, enum: ALERT_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    relatedType: { type: String, default: '', trim: true },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: {
      type: String,
      enum: ['open', 'acknowledged', 'resolved'],
      default: 'open'
    },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acknowledgedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

operationalAlertSchema.pre('validate', function sanitizeAlert(next) {
  this.title = sanitize(this.title);
  this.message = sanitize(this.message);
  this.metadata = sanitize(this.metadata || {});
  next();
});

operationalAlertSchema.index({ companyId: 1, status: 1, severity: 1, createdAt: -1 });
operationalAlertSchema.index({ type: 1, relatedType: 1, relatedId: 1, status: 1 });

export const OperationalAlert = mongoose.model(
  'OperationalAlert',
  operationalAlertSchema
);
