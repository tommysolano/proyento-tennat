import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';
import {
  isSafeMarketingKey,
  safePublicUrl,
  sanitizePlainText
} from '../modules/marketing/marketingSecurity.js';

export const FORM_TYPES = [
  'lead_capture',
  'contact_update',
  'survey',
  'booking_request',
  'custom'
];
export const FORM_STATUSES = ['draft', 'published', 'paused', 'archived'];
export const FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'date',
  'select',
  'multiselect',
  'checkbox',
  'radio',
  'boolean',
  'hidden',
  'consent'
];

const fieldSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      validate: { validator: isSafeMarketingKey, message: 'key de campo invalida' }
    },
    label: { type: String, required: true, trim: true, maxlength: 160 },
    type: { type: String, enum: FORM_FIELD_TYPES, required: true },
    required: { type: Boolean, default: false },
    placeholder: { type: String, default: '', maxlength: 300 },
    helpText: { type: String, default: '', maxlength: 1000 },
    options: {
      type: [String],
      default: [],
      validate: {
        validator: (items) => items.length <= 100,
        message: 'Un campo admite maximo 100 opciones'
      }
    },
    defaultValue: { type: mongoose.Schema.Types.Mixed, default: null },
    order: { type: Number, min: 0, default: 0 },
    hidden: { type: Boolean, default: false },
    validation: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { _id: true }
);

const mappingSchema = new mongoose.Schema(
  {
    formFieldKey: { type: String, required: true },
    targetEntity: { type: String, enum: ['contact', 'opportunity'], required: true },
    targetField: { type: String, default: '' },
    customFieldKey: { type: String, default: '' }
  },
  { _id: true }
);

const formSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    type: { type: String, enum: FORM_TYPES, default: 'lead_capture' },
    status: { type: String, enum: FORM_STATUSES, default: 'draft' },
    fields: {
      type: [fieldSchema],
      default: [],
      validate: {
        validator: (items) => items.length <= 50,
        message: 'Un formulario admite maximo 50 campos'
      }
    },
    settings: {
      allowMultipleSubmissions: { type: Boolean, default: true },
      duplicateStrategy: {
        type: String,
        enum: ['create_new', 'update_existing', 'ignore_duplicate'],
        default: 'update_existing'
      },
      createContact: { type: Boolean, default: true },
      updateExistingContact: { type: Boolean, default: true },
      defaultContactStatus: { type: String, default: 'nuevo' },
      defaultLifecycleStage: { type: String, default: 'lead' },
      assignTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      addTags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
      createOpportunity: { type: Boolean, default: false },
      pipelineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pipeline', default: null },
      stageId: { type: mongoose.Schema.Types.ObjectId, ref: 'PipelineStage', default: null },
      bookingLinkId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookingLink', default: null },
      successMessage: {
        type: String,
        default: 'Gracias. Tu informacion fue recibida.',
        maxlength: 1000
      },
      redirectUrl: { type: String, default: '', maxlength: 1000 },
      notifyUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      spamProtection: { type: Boolean, default: true },
      honeypotField: { type: String, default: 'website', maxlength: 64 },
      minimumSubmitTimeMs: { type: Number, min: 0, max: 600000, default: 1500 },
      requireConsent: { type: Boolean, default: false },
      fieldMappings: { type: [mappingSchema], default: [] }
    },
    styling: {
      primaryColor: { type: String, default: '#0e7490', match: /^#[0-9a-fA-F]{6}$/ },
      backgroundColor: { type: String, default: '#ffffff', match: /^#[0-9a-fA-F]{6}$/ },
      buttonLabel: { type: String, default: 'Enviar', maxlength: 80 }
    },
    integrations: { type: mongoose.Schema.Types.Mixed, default: {}, select: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

formSchema.pre('validate', function normalizeForm(next) {
  this.description = sanitizePlainText(this.description, 2000);
  this.settings.successMessage = sanitizePlainText(this.settings.successMessage, 1000);
  this.settings.redirectUrl = safePublicUrl(this.settings.redirectUrl);
  this.metadata = sanitize(this.metadata || {});
  const seen = new Set();
  for (const field of this.fields || []) {
    if (seen.has(field.key)) return next(new Error(`Campo duplicado: ${field.key}`));
    seen.add(field.key);
    field.label = sanitizePlainText(field.label, 160);
    field.placeholder = sanitizePlainText(field.placeholder, 300);
    field.helpText = sanitizePlainText(field.helpText, 1000);
    field.options = field.options.map((item) => sanitizePlainText(item, 300)).filter(Boolean);
    field.validation = sanitize(field.validation || {});
  }
  next();
});

formSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const Form = mongoose.model('Form', formSchema);
