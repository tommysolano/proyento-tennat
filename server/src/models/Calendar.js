import mongoose from 'mongoose';

export const CALENDAR_TYPES = ['personal', 'team', 'service'];
export const CALENDAR_STATUSES = ['active', 'inactive', 'archived'];
export const CALENDAR_CONFIGURATION_PROFILES = [
  'medicine',
  'automotive_service',
  'electronics_service',
  'sports_courts',
  'online_classes'
];
export const LOCATION_TYPES = [
  'none',
  'phone',
  'in_person',
  'google_meet_placeholder',
  'zoom_placeholder',
  'custom_url',
  'video',
  'custom'
];

const calendarSettingsSchema = new mongoose.Schema(
  {
    appointmentDurationMinutes: { type: Number, min: 5, max: 1440, default: 30 },
    bufferBeforeMinutes: { type: Number, min: 0, max: 720, default: 0 },
    bufferAfterMinutes: { type: Number, min: 0, max: 720, default: 0 },
    minNoticeMinutes: { type: Number, min: 0, max: 43200, default: 60 },
    maxDaysInAdvance: { type: Number, min: 1, max: 730, default: 60 },
    reminderMinutesBefore: { type: Number, min: 0, max: 43200, default: 60 },
    slotIntervalMinutes: { type: Number, min: 5, max: 1440, default: 30 },
    capacityPerSlot: { type: Number, min: 1, max: 100, default: 1 },
    allowReschedule: { type: Boolean, default: true },
    allowCancel: { type: Boolean, default: true },
    cancellationMinNoticeMinutes: { type: Number, min: 0, max: 43200, default: 0 },
    rescheduleMinNoticeMinutes: { type: Number, min: 0, max: 43200, default: 0 },
    requireContact: { type: Boolean, default: true },
    preventOverlaps: { type: Boolean, default: true },
    initialAppointmentStatus: {
      type: String,
      enum: ['scheduled', 'confirmed'],
      default: 'scheduled'
    },
    locationType: { type: String, enum: LOCATION_TYPES, default: 'none' },
    locationValue: { type: String, trim: true, default: '' },
    internalNotesTemplate: { type: String, trim: true, maxlength: 2000, default: '' },
    clientFields: {
      type: [
        new mongoose.Schema(
          {
            key: {
              type: String,
              required: true,
              trim: true,
              match: /^[a-z][a-zA-Z0-9]{1,63}$/
            },
            label: { type: String, required: true, trim: true, maxlength: 120 },
            type: {
              type: String,
              enum: ['text', 'textarea', 'number', 'email', 'tel'],
              default: 'text'
            },
            required: { type: Boolean, default: false },
            enabled: { type: Boolean, default: true }
          },
          { _id: false }
        ),
      ],
      default: []
    }
  },
  { _id: false }
);

const calendarSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, trim: true, default: '' },
    type: { type: String, enum: CALENDAR_TYPES, default: 'personal' },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    teamUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    timezone: { type: String, required: true, default: 'America/Guayaquil' },
    color: { type: String, trim: true, default: '#2563eb' },
    status: { type: String, enum: CALENDAR_STATUSES, default: 'active' },
    configurationProfile: {
      type: String,
      enum: CALENDAR_CONFIGURATION_PROFILES,
      default: null
    },
    settings: { type: calendarSettingsSchema, default: () => ({}) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

calendarSchema.index({ companyId: 1, slug: 1 }, { unique: true });
calendarSchema.index({ companyId: 1, status: 1, ownerUserId: 1 });
calendarSchema.index({ companyId: 1, status: 1, teamUserIds: 1 });

export const Calendar = mongoose.model('Calendar', calendarSchema);
