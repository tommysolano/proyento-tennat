import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';

export const REVIEW_REQUEST_STATUSES = [
  'draft', 'pending', 'sent', 'opened', 'completed', 'expired', 'cancelled'
];
export const REVIEW_REQUEST_CHANNELS = [
  'manual', 'internal', 'whatsapp_planned', 'email_planned', 'sms_planned'
];

const reviewRequestSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', default: null },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
    status: { type: String, enum: REVIEW_REQUEST_STATUSES, default: 'pending' },
    channel: { type: String, enum: REVIEW_REQUEST_CHANNELS, default: 'manual' },
    publicToken: { type: String, required: true, unique: true, index: true },
    publicUrl: { type: String, required: true, maxlength: 1200 },
    expiresAt: { type: Date, required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    openedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

reviewRequestSchema.pre('validate', function sanitizeRequest(next) {
  this.metadata = sanitize(this.metadata || {});
  next();
});
reviewRequestSchema.index({ companyId: 1, contactId: 1, createdAt: -1 });
reviewRequestSchema.index({ companyId: 1, status: 1, expiresAt: 1 });

export const ReviewRequest = mongoose.model('ReviewRequest', reviewRequestSchema);
