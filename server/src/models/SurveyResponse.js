import mongoose from 'mongoose';
import { sanitizeReputationValue } from '../modules/reputation/reputationSecurity.js';

export const SURVEY_RESPONSE_STATUSES = ['received', 'processed', 'spam', 'ignored'];

const surveyResponseSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    surveyId: { type: mongoose.Schema.Types.ObjectId, ref: 'SatisfactionSurvey', required: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    reviewRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReviewRequest', default: null },
    values: { type: mongoose.Schema.Types.Mixed, default: {} },
    npsScore: { type: Number, min: 0, max: 10, default: null },
    csatScore: { type: Number, min: 1, max: 5, default: null },
    status: { type: String, enum: SURVEY_RESPONSE_STATUSES, default: 'received' },
    ipHash: { type: String, required: true, select: false },
    userAgent: { type: String, default: '', maxlength: 300 },
    referrer: { type: String, default: '', maxlength: 1000 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

surveyResponseSchema.pre('validate', function sanitizeResponse(next) {
  this.values = sanitizeReputationValue(this.values || {});
  this.metadata = sanitizeReputationValue(this.metadata || {});
  next();
});
surveyResponseSchema.index({ companyId: 1, surveyId: 1, createdAt: -1 });
surveyResponseSchema.index({ surveyId: 1, ipHash: 1, createdAt: -1 });

export const SurveyResponse = mongoose.model('SurveyResponse', surveyResponseSchema);
