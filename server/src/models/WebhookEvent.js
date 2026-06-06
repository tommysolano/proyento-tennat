import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, trim: true },
    eventId: { type: String, required: true, trim: true },
    channelConfigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChannelConfig',
      required: true
    },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    type: { type: String, required: true, trim: true },
    payloadHash: { type: String, required: true },
    processedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['received', 'processing', 'processed', 'failed', 'duplicate'],
      default: 'received'
    },
    error: { type: String, default: '' }
  },
  { timestamps: true }
);

webhookEventSchema.index(
  { provider: 1, channelConfigId: 1, eventId: 1 },
  { unique: true }
);

export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
