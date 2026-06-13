import mongoose from 'mongoose';
import { marketingAttributionSchema } from '../modules/marketing/marketingAttribution.js';
import { normalizeOptionalObjectId } from '../utils/validation.js';

const consentRequestSchema = new mongoose.Schema(
  {
    channel: {
      type: String,
      enum: ['whatsapp', 'sms', 'email', 'call'],
      required: true
    },
    label: { type: String, required: true, trim: true, maxlength: 500 },
    required: { type: Boolean, default: false },
    version: { type: String, trim: true, maxlength: 100, default: '' }
  },
  { _id: false }
);

const bookingLinkSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    calendarId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Calendar',
      required: true,
      set: normalizeOptionalObjectId
    },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    publicEnabled: { type: Boolean, default: true },
    requireApproval: { type: Boolean, default: false },
    allowedFields: {
      type: [String],
      enum: ['name', 'email', 'phone', 'notes'],
      default: ['name', 'email', 'phone']
    },
    consentRequests: { type: [consentRequestSchema], default: [] },
    thankYouMessage: {
      type: String,
      trim: true,
      default: 'Tu cita fue registrada correctamente.'
    },
    redirectUrl: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    attribution: { type: marketingAttributionSchema, default: () => ({}) },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

bookingLinkSchema.index({ companyId: 1, calendarId: 1, status: 1 });
bookingLinkSchema.index({ slug: 1, publicEnabled: 1, status: 1 });

export const BookingLink = mongoose.model('BookingLink', bookingLinkSchema);
