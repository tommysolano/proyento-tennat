import mongoose from 'mongoose';

export const TEMPLATE_CHANNELS = ['internal', 'whatsapp_cloud', 'email', 'sms'];
export const TEMPLATE_TYPES = [
  'quick_reply',
  'whatsapp_template',
  'email_template',
  'sms_template'
];
export const TEMPLATE_STATUSES = [
  'draft',
  'active',
  'inactive',
  'pending_provider_approval',
  'rejected'
];
export const TEMPLATE_MESSAGE_CATEGORIES = [
  'commercial',
  'transactional',
  'operational',
  'reply'
];

const messageTemplateSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    name: { type: String, required: true, trim: true },
    channel: { type: String, enum: TEMPLATE_CHANNELS, required: true },
    type: { type: String, enum: TEMPLATE_TYPES, default: 'quick_reply' },
    language: { type: String, default: 'es', trim: true },
    category: { type: String, default: 'utility', trim: true },
    messageCategory: {
      type: String,
      enum: TEMPLATE_MESSAGE_CATEGORIES,
      default() {
        return this.type === 'quick_reply' ? 'reply' : 'commercial';
      }
    },
    content: { type: String, required: true, trim: true },
    variables: { type: [String], default: [] },
    status: { type: String, enum: TEMPLATE_STATUSES, default: 'draft' },
    providerTemplateId: { type: String, default: '' },
    providerStatus: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

messageTemplateSchema.index({ companyId: 1, channel: 1, status: 1, name: 1 });

export const MessageTemplate = mongoose.model('MessageTemplate', messageTemplateSchema);
