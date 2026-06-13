import mongoose from 'mongoose';
import { CONSENT_CHANNELS } from './ContactConsent.js';
import { normalizeOptionalObjectId } from '../utils/validation.js';

export const DEFAULT_OPT_OUT_KEYWORDS = [
  'SALIR',
  'STOP',
  'CANCELAR',
  'NO ENVIAR',
  'BAJA'
];
export const DEFAULT_GLOBAL_OPT_OUT_KEYWORDS = [
  'SALIR TODO',
  'BAJA TOTAL',
  'NO CONTACTAR'
];

const communicationSettingsSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true
    },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null,
      set: normalizeOptionalObjectId
    },
    timezone: { type: String, trim: true, default: 'UTC', maxlength: 100 },
    quietHours: {
      enabled: { type: Boolean, default: false },
      startTime: { type: String, default: '20:00', match: /^\d{2}:\d{2}$/ },
      endTime: { type: String, default: '08:00', match: /^\d{2}:\d{2}$/ },
      days: {
        type: [Number],
        default: [0, 1, 2, 3, 4, 5, 6],
        validate: (values) => values.every((value) => Number.isInteger(value) && value >= 0 && value <= 6)
      },
      channels: {
        type: [String],
        enum: CONSENT_CHANNELS,
        default: ['whatsapp', 'sms', 'email', 'call']
      },
      allowTransactional: { type: Boolean, default: true },
      action: { type: String, enum: ['block', 'schedule'], default: 'schedule' }
    },
    optOutKeywords: { type: [String], default: DEFAULT_OPT_OUT_KEYWORDS },
    globalOptOutKeywords: {
      type: [String],
      default: DEFAULT_GLOBAL_OPT_OUT_KEYWORDS
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      set: normalizeOptionalObjectId
    }
  },
  { timestamps: true }
);

export const CommunicationSettings = mongoose.model(
  'CommunicationSettings',
  communicationSettingsSchema
);
