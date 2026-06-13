import mongoose from 'mongoose';
import { marketingAttributionSchema } from '../modules/marketing/marketingAttribution.js';
import { normalizeOptionalObjectId } from '../utils/validation.js';

export const CONTACT_STATUSES = [
  'nuevo',
  'contactado',
  'interesado',
  'no_interesado',
  'seguimiento',
  'cliente',
  'perdido',
  'cerrado'
];
export const CONTACT_LIFECYCLE_STAGES = ['lead', 'prospect', 'customer', 'lost'];
export const CRM_PRIORITIES = ['low', 'medium', 'high'];

const contactNoteSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const contactSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    fullName: { type: String, trim: true, default: '' },
    phone: {
      type: String,
      trim: true
    },
    secondaryPhone: { type: String, trim: true, default: '' },
    email: {
      type: String,
      lowercase: true,
      trim: true
    },
    source: {
      type: String,
      default: 'Carga manual'
    },
    status: {
      type: String,
      enum: CONTACT_STATUSES,
      default: 'nuevo'
    },
    lifecycleStage: {
      type: String,
      enum: CONTACT_LIFECYCLE_STAGES,
      default: 'lead'
    },
    priority: {
      type: String,
      enum: CRM_PRIORITIES,
      default: 'medium'
    },
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
    lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CrmList' }],
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    lastContactAt: {
      type: Date,
      default: null
    },
    nextFollowUpAt: {
      type: Date,
      default: null
    },
    followUpStatus: {
      type: String,
      enum: ['pending', 'done', 'cancelled'],
      default: 'pending'
    },
    companyName: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
    communicationPreferences: {
      globalDnd: { type: Boolean, default: false },
      globalDndReason: { type: String, trim: true, maxlength: 1000, default: '' },
      globalDndUpdatedAt: { type: Date, default: null },
      globalDndUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        set: normalizeOptionalObjectId
      },
      preferredChannel: {
        type: String,
        enum: ['', 'whatsapp', 'sms', 'email', 'call', 'facebook_messenger', 'instagram_dm', 'other'],
        default: ''
      },
      allowedChannels: {
        type: [String],
        enum: ['whatsapp', 'sms', 'email', 'call', 'facebook_messenger', 'instagram_dm', 'other'],
        default: []
      },
      language: { type: String, trim: true, maxlength: 20, default: '' },
      preferredStartTime: { type: String, trim: true, maxlength: 5, default: '' },
      preferredEndTime: { type: String, trim: true, maxlength: 5, default: '' },
      doNotCall: { type: Boolean, default: false },
      doNotWhatsApp: { type: Boolean, default: false },
      doNotSms: { type: Boolean, default: false },
      doNotEmail: { type: Boolean, default: false }
    },
    attribution: { type: marketingAttributionSchema, default: () => ({}) },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    archivedAt: { type: Date, default: null },
    notes: {
      type: [contactNoteSchema],
      default: []
    }
  },
  { timestamps: true }
);

contactSchema.pre('validate', function normalizeNames(next) {
  const composed = [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
  if (!this.name && composed) this.name = composed;
  if (!this.fullName) this.fullName = this.name || composed;
  if (!this.firstName && this.name) this.firstName = this.name.split(/\s+/)[0];
  next();
});

contactSchema.index({ companyId: 1, assignedTo: 1, status: 1 });
contactSchema.index({ companyId: 1, tags: 1 });
contactSchema.index({ companyId: 1, lists: 1 });
contactSchema.index({ companyId: 1, nextFollowUpAt: 1 });
contactSchema.index({ companyId: 1, email: 1 });
contactSchema.index({ companyId: 1, phone: 1 });
contactSchema.index({ companyId: 1, 'communicationPreferences.globalDnd': 1 });
contactSchema.index({ companyId: 1, 'communicationPreferences.preferredChannel': 1 });
contactSchema.index({ companyId: 1, 'attribution.campaignId': 1 });
contactSchema.index({ companyId: 1, 'attribution.externalCampaignId': 1 });
contactSchema.index({ companyId: 1, 'attribution.consultedProduct': 1 });
contactSchema.index({ companyId: 1, 'attribution.purchasedProduct': 1 });

export const Contact = mongoose.model('Contact', contactSchema);
