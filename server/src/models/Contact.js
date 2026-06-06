import mongoose from 'mongoose';

export const CONTACT_STATUSES = [
  'nuevo',
  'contactado',
  'interesado',
  'no_interesado',
  'seguimiento',
  'cerrado'
];

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
    phone: {
      type: String,
      required: true,
      trim: true
    },
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
    lastContactAt: {
      type: Date,
      default: null
    },
    nextFollowUpAt: {
      type: Date,
      default: null
    },
    notes: {
      type: [contactNoteSchema],
      default: []
    }
  },
  { timestamps: true }
);

export const Contact = mongoose.model('Contact', contactSchema);
