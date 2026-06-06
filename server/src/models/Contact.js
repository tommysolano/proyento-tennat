import mongoose from 'mongoose';

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
contactSchema.index({ companyId: 1, nextFollowUpAt: 1 });
contactSchema.index({ companyId: 1, email: 1 });
contactSchema.index({ companyId: 1, phone: 1 });

export const Contact = mongoose.model('Contact', contactSchema);
