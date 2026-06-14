import mongoose from 'mongoose';
import { CONVERSATION_CHANNELS } from './Conversation.js';
import { normalizeOptionalObjectId } from '../utils/validation.js';

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
export const MESSAGE_STATUSES = [
  'pending',
  'queued',
  'scheduled',
  'sent',
  'delivered',
  'read',
  'failed',
  'received',
  'skipped',
  'blocked'
];
export const MESSAGE_CATEGORIES = [
  'commercial',
  'transactional',
  'operational',
  'reply'
];

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    filename: { type: String, default: '' },
    fileName: { type: String, default: '' },
    size: { type: Number, min: 0, default: 0 },
    providerMediaId: { type: String, default: '' },
    caption: { type: String, default: '' },
    externalMediaId: { type: String, default: '' },
    storageKey: { type: String, default: '' },
    status: {
      type: String,
      enum: ['none', 'pending', 'available', 'failed', 'unavailable'],
      default: 'none'
    },
    error: { type: String, default: '' }
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
    category: { type: String, enum: MESSAGE_CATEGORIES, default: 'commercial' },
    text: { type: String, trim: true, default: '' },
    media: { type: mediaSchema, default: () => ({}) },
    status: { type: String, enum: MESSAGE_STATUSES, required: true },
    externalMessageId: { type: String, trim: true, default: '' },
    provider: { type: String, trim: true, default: 'internal' },
    providerPayload: { type: mongoose.Schema.Types.Mixed, default: {}, select: false },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    attempts: { type: Number, min: 0, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    scheduledAt: { type: Date, default: null },
    reasonCode: { type: String, trim: true, maxlength: 120, default: '' },
    providerCode: { type: String, trim: true, maxlength: 200, default: '' },
    blockedByRule: { type: String, trim: true, maxlength: 200, default: '' },
    integrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Integration',
      default: null,
      set: normalizeOptionalObjectId
    },
    channelConfigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChannelConfig',
      default: null,
      set: normalizeOptionalObjectId
    },
    errorMessage: { type: String, maxlength: 2000, default: '' },
    error: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (document, value) => {
        delete value.providerPayload;
        if (value.media) {
          const hasStoredContent = Boolean(value.media.storageKey);
          delete value.media.storageKey;
          delete value.media.providerMediaId;
          delete value.media.externalMediaId;
          value.media.storageKeyConfigured = hasStoredContent;
          value.media.providerMediaIdConfigured = Boolean(
            document.media?.providerMediaId || document.media?.externalMediaId
          );
          value.media.contentUrl = hasStoredContent
            ? `/api/messages/${value._id}/media/content`
            : '';
        }
        return value;
      }
    }
  }
);

messageSchema.index({ companyId: 1, conversationId: 1, createdAt: 1 });
messageSchema.index({ companyId: 1, status: 1, channel: 1, createdAt: -1 });
messageSchema.index({ companyId: 1, reasonCode: 1, createdAt: -1 });
messageSchema.index({ companyId: 1, provider: 1, channelConfigId: 1, createdAt: -1 });
messageSchema.index(
  { companyId: 1, provider: 1, channelConfigId: 1, externalMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { externalMessageId: { $type: 'string', $gt: '' } }
  }
);

export const Message = mongoose.model('Message', messageSchema);
