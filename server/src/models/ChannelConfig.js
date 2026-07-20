import mongoose from 'mongoose';
import {
  decryptSecret,
  decryptSecretMap,
  encryptSecret,
  encryptSecretMap
} from '../utils/credentialCrypto.js';

export const CHANNEL_CONFIG_CHANNELS = [
  'whatsapp_cloud',
  'whatsapp_qr',
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
    webhookSecret: { type: mongoose.Schema.Types.Mixed, default: '', select: false },
    verifyToken: { type: mongoose.Schema.Types.Mixed, default: '', select: false },
    phoneNumberId: { type: String, trim: true, default: '' },
    externalBusinessId: { type: String, trim: true, default: '' },
    externalAccountId: { type: String, trim: true, default: '' },
    // Numero E.164 que el usuario declara (lo que se muestra en la UI).
    displayPhone: { type: String, trim: true, default: '' },
    // Numero real que reporta WhatsApp al vincular por QR (Baileys).
    connectedPhone: { type: String, trim: true, default: '' },
    // Numero por defecto de la empresa: el que usan campanas/workflows y el
    // fallback de envio cuando la conversacion no fija otro. Maximo uno activo
    // por empresa (lo garantiza el gateway al marcarlo).
    isDefault: { type: Boolean, default: false },
    // Salud del numero (solo Cloud API, poblada por webhook o refresco manual).
    qualityRating: {
      type: String,
      enum: ['GREEN', 'YELLOW', 'RED', 'UNKNOWN'],
      default: 'UNKNOWN'
    },
    messagingLimit: { type: String, trim: true, default: '' },
    qualityUpdatedAt: { type: Date, default: null },
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
// Acelera getDefaultAccount (el numero por defecto de cada empresa).
channelConfigSchema.index({ companyId: 1, isDefault: 1 });

channelConfigSchema.pre('save', function encryptStoredSecrets(next) {
  try {
    const credentials = this.credentials || {};
    this.credentials = Object.fromEntries(
      Object.entries(credentials).map(([key, value]) => [key, encryptSecret(value)])
    );
    if (this.verifyToken) this.verifyToken = encryptSecret(this.verifyToken);
    if (this.webhookSecret) this.webhookSecret = encryptSecret(this.webhookSecret);
    if (Object.keys(credentials).length) this.markModified('credentials');
    next();
  } catch (error) {
    next(error);
  }
});

channelConfigSchema.methods.toSafeObject = function toSafeObject() {
  const value = this.toObject();
  const credentials = this.credentials || {};
  delete value.credentials;
  delete value.verifyToken;
  delete value.webhookSecret;
  value.accessTokenConfigured = Boolean(credentials.accessToken);
  value.verifyTokenConfigured = Boolean(this.verifyToken);
  value.webhookSecretConfigured = Boolean(this.webhookSecret);
  value.appSecretConfigured = Boolean(credentials.appSecret || this.webhookSecret);
  return value;
};

channelConfigSchema.methods.setSecrets = function setSecrets(values = {}) {
  const credentials = { ...(this.credentials || {}) };
  for (const [key, value] of Object.entries(values.credentials || {})) {
    if (value !== undefined && value !== null && value !== '') {
      credentials[key] = encryptSecret(value);
    }
  }
  this.credentials = credentials;
  this.markModified('credentials');

  if (values.verifyToken) this.verifyToken = encryptSecret(values.verifyToken);
  if (values.webhookSecret) this.webhookSecret = encryptSecret(values.webhookSecret);
  if (values.appSecret) {
    this.credentials = {
      ...(this.credentials || {}),
      appSecret: encryptSecret(values.appSecret)
    };
    this.markModified('credentials');
  }
  return this;
};

channelConfigSchema.methods.getDecryptedCredentials = function getDecryptedCredentials() {
  return decryptSecretMap(this.credentials || {});
};

channelConfigSchema.methods.getDecryptedVerifyToken = function getDecryptedVerifyToken() {
  return decryptSecret(this.verifyToken);
};

channelConfigSchema.methods.getDecryptedAppSecret = function getDecryptedAppSecret() {
  const credentials = decryptSecretMap(this.credentials || {});
  return credentials.appSecret || decryptSecret(this.webhookSecret);
};

channelConfigSchema.statics.encryptCredentials = encryptSecretMap;

export const ChannelConfig = mongoose.model('ChannelConfig', channelConfigSchema);
