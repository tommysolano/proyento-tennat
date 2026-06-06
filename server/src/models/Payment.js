import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
      index: true
    },
    payerType: { type: String, enum: ['distributor', 'company'], required: true },
    payerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'USD', uppercase: true },
    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed', 'refunded'],
      default: 'succeeded'
    },
    method: { type: String, default: 'manual' },
    paymentProvider: { type: String, default: 'manual' },
    providerPaymentId: { type: String, default: '' },
    paidAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export const Payment = mongoose.model('Payment', paymentSchema);
