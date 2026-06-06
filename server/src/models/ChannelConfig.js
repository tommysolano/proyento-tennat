import mongoose from 'mongoose';

export const CHANNEL_CONFIG_CHANNELS = [
  'whatsapp_cloud',
  'facebook_messenger',
  'instagram_dm',
  'email',
  'sms',
  // Legacy aliases.
  'whatsapp_cloud_api',
  'facebook',
  'messenger'
];
export const CHANNEL_CONFIG_STATUSES = [
  'not_configured',
  'pending',
  'connected',
  'error',
  'disabled',
  // Legacy alias.
  'draft'
];

const channelConfigSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    channel: { type: String, enum: CHANNEL_CONFIG_CHANNELS, required: true },
    displayName: { type: String, required: true, trim: true },
    credentials: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      select: false
    },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    webhookSecret: { type: String, default: '', select: false },
    verifyToken: { type: String, default: '', select: false },
    phoneNumberId: { type: String, trim: true, default: '' },
    externalBusinessId: { type: String, trim: true, default: '' },
    externalAccountId: { type: String, trim: true, default: '' },
    status: { type: String, enum: CHANNEL_CONFIG_STATUSES, default: 'not_configured' },
    lastConnectedAt: { type: Date, default: null },
    lastWebhookAt: { type: Date, default: null },
    error: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (document, value) => {
        delete value.credentials;
        delete value.verifyToken;
        delete value.webhookSecret;
        return value;
      }
    }
  }
);

channelConfigSchema.index({ companyId: 1, channel: 1, displayName: 1 });
channelConfigSchema.index({ companyId: 1, phoneNumberId: 1 });

channelConfigSchema.methods.toSafeObject = function toSafeObject() {
  const value = this.toObject();
  const credentials = this.credentials || {};
  delete value.credentials;
  delete value.verifyToken;
  delete value.webhookSecret;
  value.accessTokenConfigured = Boolean(credentials.accessToken);
  value.verifyTokenConfigured = Boolean(this.verifyToken);
  value.webhookSecretConfigured = Boolean(this.webhookSecret);
  return value;
};

export const ChannelConfig = mongoose.model('ChannelConfig', channelConfigSchema);
