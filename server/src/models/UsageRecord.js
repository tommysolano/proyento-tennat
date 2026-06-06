import mongoose from 'mongoose';

const usageRecordSchema = new mongoose.Schema(
  {
    scopeType: { type: String, enum: ['distributor', 'company'], required: true },
    scopeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    metric: {
      type: String,
      enum: [
        'companies',
        'users',
        'contacts',
        'messages',
        'storage',
        'modules',
        'whatsapp_messages',
        'ai_tokens'
      ],
      required: true
    },
    quantity: { type: Number, required: true, min: 0 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

usageRecordSchema.index({ scopeType: 1, scopeId: 1, metric: 1, periodStart: -1 });

export const UsageRecord = mongoose.model('UsageRecord', usageRecordSchema);
