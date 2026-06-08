import mongoose from 'mongoose';
import { sanitize } from '../utils/sanitize.js';
import { sanitizeReputationText } from '../modules/reputation/reputationSecurity.js';

export const SATISFACTION_SURVEY_TYPES = ['nps', 'csat', 'custom'];
export const SATISFACTION_SURVEY_STATUSES = ['draft', 'published', 'paused', 'archived'];
export const SATISFACTION_QUESTION_TYPES = [
  'nps', 'csat', 'text', 'textarea', 'select', 'radio', 'checkbox', 'number'
];

const questionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, lowercase: true, trim: true, match: /^[a-z][a-z0-9_]{0,63}$/ },
    label: { type: String, required: true, maxlength: 240 },
    type: { type: String, enum: SATISFACTION_QUESTION_TYPES, required: true },
    required: { type: Boolean, default: false },
    options: { type: [String], default: [] },
    order: { type: Number, min: 0, default: 0 }
  },
  { _id: true }
);

const satisfactionSurveySchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    name: { type: String, required: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    },
    type: { type: String, enum: SATISFACTION_SURVEY_TYPES, default: 'nps' },
    status: { type: String, enum: SATISFACTION_SURVEY_STATUSES, default: 'draft' },
    questions: { type: [questionSchema], default: [], validate: [(items) => items.length <= 50, 'Maximo 50 preguntas'] },
    settings: {
      title: { type: String, default: '', maxlength: 180 },
      description: { type: String, default: '', maxlength: 2000 },
      successMessage: { type: String, default: 'Gracias por tu respuesta.', maxlength: 1000 },
      requireContact: { type: Boolean, default: false },
      lowNpsThreshold: { type: Number, min: 0, max: 10, default: 6 }
    },
    styling: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    publishedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

satisfactionSurveySchema.pre('validate', function sanitizeSurvey(next) {
  this.name = sanitizeReputationText(this.name, 120);
  this.settings.title = sanitizeReputationText(this.settings.title, 180);
  this.settings.description = sanitizeReputationText(this.settings.description, 2000);
  this.settings.successMessage = sanitizeReputationText(this.settings.successMessage, 1000);
  const seen = new Set();
  for (const question of this.questions || []) {
    if (seen.has(question.key)) return next(new Error(`Pregunta duplicada: ${question.key}`));
    seen.add(question.key);
    question.label = sanitizeReputationText(question.label, 240);
    question.options = question.options.map((item) => sanitizeReputationText(item, 300)).filter(Boolean);
  }
  this.styling = sanitize(this.styling || {});
  this.metadata = sanitize(this.metadata || {});
  next();
});
satisfactionSurveySchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const SatisfactionSurvey = mongoose.model(
  'SatisfactionSurvey',
  satisfactionSurveySchema
);
