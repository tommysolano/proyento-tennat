import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'conversation_assigned',
  'new_message',
  'internal_note',
  'conversation_closed',
  'message_failed'
];

const notificationSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '', trim: true },
    relatedType: { type: String, default: '', trim: true },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    readAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ companyId: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
