import mongoose from 'mongoose';

const lineItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    moduleKey: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { _id: true }
);

const invoiceSchema = new mongoose.Schema(
  {
    issuerType: { type: String, enum: ['platform', 'distributor'], required: true },
    issuerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    customerType: { type: String, enum: ['distributor', 'company'], required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    subscriptionType: { type: String, enum: ['platform', 'company'], required: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    number: { type: String, required: true, trim: true },
    currency: { type: String, default: 'USD', uppercase: true },
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['draft', 'open', 'paid', 'overdue', 'void', 'uncollectible'],
      default: 'open'
    },
    dueDate: { type: Date, required: true },
    paidAt: { type: Date, default: null },
    lineItems: { type: [lineItemSchema], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

invoiceSchema.index({ customerType: 1, customerId: 1, createdAt: -1 });
invoiceSchema.index({ issuerType: 1, issuerId: 1, number: 1 }, { unique: true });

export const Invoice = mongoose.model('Invoice', invoiceSchema);
