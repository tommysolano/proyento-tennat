import mongoose from 'mongoose';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const AVAILABILITY_EXCEPTION_TYPES = ['unavailable', 'available_override'];

const availabilityExceptionSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    calendarId: { type: mongoose.Schema.Types.ObjectId, ref: 'Calendar', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    date: {
      type: String,
      required: true,
      validate: {
        validator(value) {
          if (!DATE_PATTERN.test(value)) return false;
          const [year, month, day] = value.split('-').map(Number);
          return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
        },
        message: 'date debe ser una fecha YYYY-MM-DD valida'
      }
    },
    type: {
      type: String,
      enum: AVAILABILITY_EXCEPTION_TYPES,
      default: 'unavailable'
    },
    startTime: {
      type: String,
      default: '',
      validate: {
        validator: (value) => !value || TIME_PATTERN.test(value),
        message: 'startTime invalido'
      }
    },
    endTime: {
      type: String,
      default: '',
      validate: {
        validator: (value) => !value || TIME_PATTERN.test(value),
        message: 'endTime invalido'
      }
    },
    reason: { type: String, trim: true, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

availabilityExceptionSchema.pre('validate', function validateRange(next) {
  if (Boolean(this.startTime) !== Boolean(this.endTime)) {
    return next(new Error('startTime y endTime deben enviarse juntos'));
  }
  if (this.startTime && this.startTime >= this.endTime) {
    return next(new Error('endTime debe ser posterior a startTime'));
  }
  next();
});

availabilityExceptionSchema.index({
  companyId: 1,
  calendarId: 1,
  userId: 1,
  date: 1
});

export const AvailabilityException = mongoose.model(
  'AvailabilityException',
  availabilityExceptionSchema
);
