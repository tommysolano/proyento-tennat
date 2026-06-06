import mongoose from 'mongoose';

const distributorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    ownerName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      default: '',
      trim: true
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'cancelled', 'trial'],
      default: 'trial'
    },
    region: {
      type: String,
      default: 'LatAm'
    },
    branding: {
      logoUrl: { type: String, default: '' },
      faviconUrl: { type: String, default: '' },
      primaryColor: { type: String, default: '#0e7490' },
      secondaryColor: { type: String, default: '#0f172a' },
      accentColor: { type: String, default: '#06b6d4' },
      loginBackgroundUrl: { type: String, default: '' },
      companyName: { type: String, default: '' },
      supportEmail: { type: String, default: '' },
      supportPhone: { type: String, default: '' }
    },
    customDomain: {
      domain: { type: String, default: '', lowercase: true, trim: true },
      status: {
        type: String,
        enum: ['not_configured', 'pending_verification', 'verified', 'failed'],
        default: 'not_configured'
      },
      verificationToken: { type: String, default: '' },
      verifiedAt: { type: Date, default: null }
    },
    settings: {
      defaultCurrency: { type: String, default: 'USD' },
      defaultLocale: { type: String, default: 'es-EC' },
      defaultTimezone: { type: String, default: 'America/Guayaquil' },
      termsUrl: { type: String, default: '' },
      privacyUrl: { type: String, default: '' },
      enabledModules: { type: [String], default: [] }
    },
    billingSettings: {
      currency: { type: String, default: 'USD', uppercase: true },
      taxRate: { type: Number, default: 0, min: 0 },
      invoicePrefix: { type: String, default: 'FAC', uppercase: true, trim: true },
      invoiceNextNumber: { type: Number, default: 1, min: 1 },
      paymentInstructions: { type: String, default: '' },
      termsAndConditions: { type: String, default: '' },
      gracePeriodDays: { type: Number, default: 0, min: 0 }
    },
    onboarding: {
      completed: { type: Boolean, default: false },
      steps: {
        profile: { type: Boolean, default: false },
        branding: { type: Boolean, default: false },
        firstPlan: { type: Boolean, default: false },
        firstCompany: { type: Boolean, default: false },
        firstAdmin: { type: Boolean, default: false },
        firstSubscription: { type: Boolean, default: false }
      }
    }
  },
  { timestamps: true }
);

export const Distributor = mongoose.model('Distributor', distributorSchema);
