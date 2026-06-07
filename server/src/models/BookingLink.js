import mongoose from 'mongoose';

const bookingLinkSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    calendarId: { type: mongoose.Schema.Types.ObjectId, ref: 'Calendar', required: true },
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
    thankYouMessage: {
      type: String,
      trim: true,
      default: 'Tu cita fue registrada correctamente.'
    },
    redirectUrl: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

bookingLinkSchema.index({ companyId: 1, calendarId: 1, status: 1 });
bookingLinkSchema.index({ slug: 1, publicEnabled: 1, status: 1 });

export const BookingLink = mongoose.model('BookingLink', bookingLinkSchema);
