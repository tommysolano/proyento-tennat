import mongoose from 'mongoose';
import { CRM_PRIORITIES } from './Contact.js';

export const CONVERSATION_CHANNELS = [
  'internal',
  'whatsapp_cloud',
  'whatsapp_qr',
  'facebook_messenger',
  'instagram_dm',
  'email',
  'sms',
  // Legacy aliases remain valid for existing Phase 1 data.
  'whatsapp',
  'facebook',
  'messenger',
  'phone'
];
export const CONVERSATION_STATUSES = ['open', 'pending', 'resolved', 'closed', 'archived'];

const conversationSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
    channel: { type: String, enum: CONVERSATION_CHANNELS, default: 'internal' },
    provider: { type: String, trim: true, default: 'internal' },
    channelConfigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChannelConfig',
      default: null
    },
    externalConversationId: { type: String, trim: true, default: '' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: CONVERSATION_STATUSES, default: 'open' },
    priority: { type: String, enum: CRM_PRIORITIES, default: 'medium' },
    unreadCount: { type: Number, min: 0, default: 0 },
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: null },
    lastInboundAt: { type: Date, default: null },
    lastOutboundAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    archivedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

conversationSchema.index({ companyId: 1, assignedTo: 1, status: 1, lastMessageAt: -1 });
conversationSchema.index({ companyId: 1, contactId: 1, channel: 1 });
conversationSchema.index({ companyId: 1, provider: 1, channelConfigId: 1, lastMessageAt: -1 });
conversationSchema.index(
  { channelConfigId: 1, externalConversationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      channelConfigId: { $type: 'objectId' },
      externalConversationId: { $type: 'string', $gt: '' }
    }
  }
);

conversationSchema.pre('validate', function setConversationProvider(next) {
  if (
    !this.provider ||
    (
      this.provider === 'internal' &&
      this.channel !== 'internal' &&
      !this.isModified('provider')
    )
  ) {
    this.provider = this.channel || 'internal';
  }
  next();
});

export const Conversation = mongoose.model('Conversation', conversationSchema);
