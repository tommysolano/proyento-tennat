import mongoose from 'mongoose';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const availabilityRuleSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    calendarId: { type: mongoose.Schema.Types.ObjectId, ref: 'Calendar', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    startTime: { type: String, required: true, match: TIME_PATTERN },
    endTime: { type: String, required: true, match: TIME_PATTERN },
    timezone: { type: String, required: true, default: 'America/Guayaquil' },
    enabled: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

availabilityRuleSchema.pre('validate', function validateRange(next) {
  if (this.startTime && this.endTime && this.startTime >= this.endTime) {
    return next(new Error('endTime debe ser posterior a startTime'));
  }
  next();
});

availabilityRuleSchema.index({
  companyId: 1,
  calendarId: 1,
  userId: 1,
  dayOfWeek: 1,
  enabled: 1
});

export const AvailabilityRule = mongoose.model(
  'AvailabilityRule',
  availabilityRuleSchema
);
