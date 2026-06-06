import mongoose from 'mongoose';
import { CONVERSATION_CHANNELS } from './Conversation.js';

export const MESSAGE_DIRECTIONS = ['inbound', 'outbound', 'internal'];
export const MESSAGE_TYPES = [
  'text',
  'image',
  'audio',
  'video',
  'document',
  'location',
  'template',
  'system'
];
export const MESSAGE_STATUSES = ['pending', 'sent', 'delivered', 'read', 'failed', 'received'];

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    fileName: { type: String, default: '' },
    caption: { type: String, default: '' },
    externalMediaId: { type: String, default: '' }
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true
    },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
    channel: { type: String, enum: CONVERSATION_CHANNELS, required: true },
    direction: { type: String, enum: MESSAGE_DIRECTIONS, required: true },
    type: { type: String, enum: MESSAGE_TYPES, default: 'text' },
    text: { type: String, trim: true, default: '' },
    media: { type: mediaSchema, default: () => ({}) },
    status: { type: String, enum: MESSAGE_STATUSES, required: true },
    externalMessageId: { type: String, trim: true, default: '' },
    provider: { type: String, trim: true, default: 'internal' },
    providerPayload: { type: mongoose.Schema.Types.Mixed, default: {}, select: false },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    error: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (document, value) => {
        delete value.providerPayload;
        return value;
      }
    }
  }
);

messageSchema.index({ companyId: 1, conversationId: 1, createdAt: 1 });
messageSchema.index(
  { companyId: 1, provider: 1, externalMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { externalMessageId: { $type: 'string', $gt: '' } }
  }
);

export const Message = mongoose.model('Message', messageSchema);
