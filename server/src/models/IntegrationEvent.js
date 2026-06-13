import mongoose from 'mongoose';
import { marketingAttributionSchema } from '../modules/marketing/marketingAttribution.js';
import { sanitize } from '../utils/sanitize.js';

const integrationEventSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    integrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Integration', required: true },
    externalEventId: { type: String, required: true, trim: true, maxlength: 300 },
    type: { type: String, default: 'payload.received', trim: true, maxlength: 160 },
    payloadHash: { type: String, required: true, maxlength: 64 },
    status: {
      type: String,
      enum: ['received', 'processing', 'processed', 'failed', 'duplicate'],
      default: 'received'
    },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: {}, select: false },
    mappedData: { type: mongoose.Schema.Types.Mixed, default: {} },
    attribution: { type: marketingAttributionSchema, default: () => ({}) },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', default: null },
    formSubmissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FormSubmission',
      default: null
    },
    processedAt: { type: Date, default: null },
    error: { type: String, default: '', maxlength: 2000 }
  },
  { timestamps: true }
);

integrationEventSchema.pre('validate', function sanitizeEvent(next) {
  this.rawPayload = sanitize(this.rawPayload || {});
  this.mappedData = sanitize(this.mappedData || {});
  this.error = String(this.error || '').slice(0, 2000);
  next();
});

integrationEventSchema.index(
  { integrationId: 1, externalEventId: 1 },
  { unique: true }
);
integrationEventSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const IntegrationEvent = mongoose.model('IntegrationEvent', integrationEventSchema);
