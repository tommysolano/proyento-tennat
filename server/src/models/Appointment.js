import mongoose from 'mongoose';
import { LOCATION_TYPES } from './Calendar.js';

export const APPOINTMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled'
];
export const APPOINTMENT_SOURCES = [
  'manual',
  'public_booking',
  'crm',
  'inbox',
  'contact',
  'opportunity'
];

const appointmentLocationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: LOCATION_TYPES, default: 'none' },
    value: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const appointmentSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    calendarId: { type: mongoose.Schema.Types.ObjectId, ref: 'Calendar', required: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    opportunityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Opportunity',
      default: null
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    timezone: { type: String, required: true },
    status: { type: String, enum: APPOINTMENT_STATUSES, default: 'scheduled' },
    source: { type: String, enum: APPOINTMENT_SOURCES, default: 'manual' },
    location: { type: appointmentLocationSchema, default: () => ({}) },
    locationType: { type: String, enum: LOCATION_TYPES, default: 'none' },
    locationValue: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, trim: true, default: '' },
    rescheduledFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null
    },
    reminderJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
    reminderAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

appointmentSchema.pre('validate', function validateRange(next) {
  if (this.startAt && this.endAt && this.endAt <= this.startAt) {
    return next(new Error('endAt debe ser posterior a startAt'));
  }
  next();
});

appointmentSchema.index({ companyId: 1, startAt: 1, endAt: 1, status: 1 });
appointmentSchema.index({ companyId: 1, calendarId: 1, startAt: 1, status: 1 });
appointmentSchema.index({ companyId: 1, assignedTo: 1, startAt: 1, status: 1 });
appointmentSchema.index({ companyId: 1, contactId: 1, startAt: -1 });
appointmentSchema.index({ companyId: 1, opportunityId: 1, startAt: -1 });

export const Appointment = mongoose.model('Appointment', appointmentSchema);
