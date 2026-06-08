import mongoose from 'mongoose';

const platformLimitsSchema = new mongoose.Schema(
  {
    companies: { type: Number, default: 1, min: 0 },
    users: { type: Number, default: 5, min: 0 },
    contacts: { type: Number, default: 1000, min: 0 },
    modules: { type: Number, default: 3, min: 0 },
    storageMb: { type: Number, default: 1024, min: 0 },
    messages: { type: Number, default: 0, min: 0 },
    whatsappMessages: { type: Number, default: 0, min: 0 },
    mediaStorageMb: { type: Number, default: 0, min: 0 },
    mediaFiles: { type: Number, default: 0, min: 0 },
    conversations: { type: Number, default: 0, min: 0 },
    calendars: { type: Number, default: 0, min: 0 },
    appointments: { type: Number, default: 0, min: 0 },
    bookingLinks: { type: Number, default: 0, min: 0 },
    workflows: { type: Number, default: 0, min: 0 },
    workflowRunsPerMonth: { type: Number, default: 0, min: 0 },
    workflowActionsPerMonth: { type: Number, default: 0, min: 0 },
    forms: { type: Number, default: 0, min: 0 },
    formSubmissionsPerMonth: { type: Number, default: 0, min: 0 },
    landingPages: { type: Number, default: 0, min: 0 },
    funnels: { type: Number, default: 0, min: 0 },
    funnelSteps: { type: Number, default: 0, min: 0 },
    pageViewsPerMonth: { type: Number, default: 0, min: 0 }
    ,
    reviewRequestsPerMonth: { type: Number, default: 0, min: 0 },
    reviews: { type: Number, default: 0, min: 0 },
    reviewWidgets: { type: Number, default: 0, min: 0 },
    surveys: { type: Number, default: 0, min: 0 },
    surveyResponsesPerMonth: { type: Number, default: 0, min: 0 },
    coupons: { type: Number, default: 0, min: 0 },
    couponRedemptionsPerMonth: { type: Number, default: 0, min: 0 },
    referralPrograms: { type: Number, default: 0, min: 0 },
    referralsPerMonth: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const platformPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '', trim: true },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD', uppercase: true, trim: true },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly'
    },
    limits: { type: platformLimitsSchema, default: () => ({}) },
    includedModules: { type: [String], default: ['core'] },
    status: {
      type: String,
      enum: ['active', 'inactive', 'archived'],
      default: 'active'
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export const PlatformPlan = mongoose.model('PlatformPlan', platformPlanSchema);
