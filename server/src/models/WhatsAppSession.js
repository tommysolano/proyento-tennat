import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { decryptSecret, encryptSecret } from '../utils/credentialCrypto.js';
import { normalizeOptionalObjectId } from '../utils/validation.js';
import { sanitizePlainText } from '../modules/marketing/marketingSecurity.js';

export const WHATSAPP_SESSION_STATUSES = [
  'disconnected',
  'initializing',
  'qr_pending',
  'authenticating',
  'connected',
  'reconnecting',
  'degraded',
  'failed',
  'logged_out'
];

const whatsappSessionSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null,
      set: normalizeOptionalObjectId
    },
    integrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChannelConfig',
      required: true
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    status: {
      type: String,
      enum: WHATSAPP_SESSION_STATUSES,
      default: 'disconnected'
    },
    internalId: {
      type: String,
      required: true,
      unique: true,
      default: randomUUID,
      select: false
    },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    qrGeneratedAt: { type: Date, default: null },
    qrExpiresAt: { type: Date, default: null },
    connectedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: null },
    lastError: { type: String, trim: true, maxlength: 1000, default: '' },
    providerVersion: { type: String, trim: true, maxlength: 80, default: '' },
    authState: {
      type: mongoose.Schema.Types.Mixed,
      default: '',
      select: false
    },
    authStateConfigured: { type: Boolean, default: false },
    encryptedConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: '',
      select: false
    },
    enabled: { type: Boolean, default: true },
    reconnectAttempts: { type: Number, min: 0, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    disconnectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      set: normalizeOptionalObjectId
    },
    authDeletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      set: normalizeOptionalObjectId
    },
    runtimeLease: {
      owner: { type: String, trim: true, maxlength: 160, default: '' },
      expiresAt: { type: Date, default: null }
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (document, value) => {
        delete value.internalId;
        delete value.authState;
        delete value.encryptedConfig;
        delete value.runtimeLease;
        return value;
      }
    }
  }
);

whatsappSessionSchema.pre('validate', function sanitizeSession(next) {
  this.name = sanitizePlainText(this.name, 120);
  this.phone = sanitizePlainText(this.phone, 40);
  this.lastError = sanitizePlainText(this.lastError, 1000);
  this.providerVersion = sanitizePlainText(this.providerVersion, 80);
  next();
});

whatsappSessionSchema.methods.setSerializedAuthState = function setSerializedAuthState(value) {
  this.authState = value ? encryptSecret(value) : '';
  this.authStateConfigured = Boolean(value);
  this.markModified('authState');
  return this;
};

whatsappSessionSchema.methods.getSerializedAuthState = function getSerializedAuthState() {
  return decryptSecret(this.authState);
};

whatsappSessionSchema.methods.setEncryptedConfig = function setEncryptedConfig(value = {}) {
  this.encryptedConfig = encryptSecret(JSON.stringify(value || {}));
  this.markModified('encryptedConfig');
  return this;
};

whatsappSessionSchema.methods.getEncryptedConfig = function getEncryptedConfig() {
  const value = decryptSecret(this.encryptedConfig);
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

whatsappSessionSchema.index(
  { companyId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);
whatsappSessionSchema.index({ companyId: 1, status: 1, updatedAt: -1 });
whatsappSessionSchema.index({ companyId: 1, integrationId: 1 }, { unique: true });
whatsappSessionSchema.index({ enabled: 1, status: 1, 'runtimeLease.expiresAt': 1 });

export const WhatsAppSession = mongoose.model(
  'WhatsAppSession',
  whatsappSessionSchema
);
