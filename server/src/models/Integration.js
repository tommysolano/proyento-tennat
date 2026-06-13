import mongoose from 'mongoose';
import {
  decryptSecret,
  decryptSecretMap,
  encryptSecret,
  encryptSecretMap
} from '../utils/credentialCrypto.js';
import { sanitize } from '../utils/sanitize.js';
import { normalizeOptionalObjectId } from '../utils/validation.js';
import { sanitizePlainText } from '../modules/marketing/marketingSecurity.js';

export const INTEGRATION_PROVIDERS = [
  'inbound_webhook',
  'pixel_tag',
  'external_form',
  'external_crm',
  'external_ecommerce',
  'other'
];
export const INTEGRATION_STATUSES = ['draft', 'active', 'paused', 'error', 'disabled'];
export const INTEGRATION_ENTITIES = [
  'contact',
  'opportunity',
  'formSubmission',
  'marketingAttribution',
  'communicationConsent'
];
export const INTEGRATION_TRANSFORMS = [
  'none',
  'trim',
  'lowercase',
  'uppercase',
  'number',
  'date',
  'boolean'
];

const mappingSchema = new mongoose.Schema(
  {
    externalField: { type: String, required: true, trim: true, maxlength: 200 },
    internalEntity: { type: String, enum: INTEGRATION_ENTITIES, required: true },
    internalField: { type: String, required: true, trim: true, maxlength: 200 },
    transform: { type: String, enum: INTEGRATION_TRANSFORMS, default: 'none' },
    required: { type: Boolean, default: false },
    defaultValue: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { _id: true }
);

const integrationSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    provider: { type: String, enum: INTEGRATION_PROVIDERS, required: true },
    status: { type: String, enum: INTEGRATION_STATUSES, default: 'draft' },
    description: { type: String, default: '', trim: true, maxlength: 3000 },
    credentials: { type: mongoose.Schema.Types.Mixed, default: {}, select: false },
    webhookSecret: { type: mongoose.Schema.Types.Mixed, default: '', select: false },
    settings: {
      createContact: { type: Boolean, default: true },
      updateExistingContact: { type: Boolean, default: true },
      createOpportunity: { type: Boolean, default: false },
      campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign',
        default: null,
        set: normalizeOptionalObjectId
      },
      formId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Form',
        default: null,
        set: normalizeOptionalObjectId
      },
      pipelineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Pipeline',
        default: null,
        set: normalizeOptionalObjectId
      },
      stageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PipelineStage',
        default: null,
        set: normalizeOptionalObjectId
      }
    },
    mappings: { type: [mappingSchema], default: [] },
    notifyUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      set: normalizeOptionalObjectId
    }],
    lastSyncAt: { type: Date, default: null },
    lastEventAt: { type: Date, default: null },
    lastError: { type: String, default: '', maxlength: 2000 },
    lastErrorAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (document, value) => {
        delete value.credentials;
        delete value.webhookSecret;
        return value;
      }
    }
  }
);

integrationSchema.pre('validate', function sanitizeIntegration(next) {
  this.name = sanitizePlainText(this.name, 160);
  this.description = sanitizePlainText(this.description, 3000);
  this.lastError = sanitizePlainText(this.lastError, 2000);
  this.metadata = sanitize(this.metadata || {});
  next();
});

integrationSchema.pre('save', function encryptStoredSecrets(next) {
  try {
    this.credentials = encryptSecretMap(this.credentials || {});
    if (this.webhookSecret) this.webhookSecret = encryptSecret(this.webhookSecret);
    if (Object.keys(this.credentials || {}).length) this.markModified('credentials');
    next();
  } catch (error) {
    next(error);
  }
});

integrationSchema.methods.setSecrets = function setSecrets(values = {}) {
  const credentials = { ...(this.credentials || {}) };
  for (const [key, value] of Object.entries(values.credentials || {})) {
    if (value !== undefined && value !== null && value !== '') {
      credentials[key] = encryptSecret(value);
    }
  }
  this.credentials = credentials;
  this.markModified('credentials');
  if (values.webhookSecret) this.webhookSecret = encryptSecret(values.webhookSecret);
  return this;
};

integrationSchema.methods.getDecryptedCredentials = function getDecryptedCredentials() {
  return decryptSecretMap(this.credentials || {});
};

integrationSchema.methods.getDecryptedWebhookSecret = function getDecryptedWebhookSecret() {
  return decryptSecret(this.webhookSecret);
};

integrationSchema.methods.toSafeObject = function toSafeObject() {
  const value = this.toObject();
  delete value.credentials;
  delete value.webhookSecret;
  value.credentialsConfigured = Object.keys(this.credentials || {}).length > 0;
  value.webhookSecretConfigured = Boolean(this.webhookSecret);
  return value;
};

integrationSchema.index({ companyId: 1, status: 1, createdAt: -1 });
integrationSchema.index({ companyId: 1, provider: 1, name: 1 });

export const Integration = mongoose.model('Integration', integrationSchema);
