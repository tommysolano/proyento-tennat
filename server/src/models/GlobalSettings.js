import mongoose from 'mongoose';

const globalSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },
    platformName: { type: String, default: 'TenantDesk' },
    defaultCurrency: { type: String, default: 'USD' },
    defaultTaxRate: { type: Number, default: 0 },
    supportEmail: { type: String, default: '' },
    billingSettings: {
      invoicePrefix: { type: String, default: 'PLAT' },
      paymentTermsDays: { type: Number, default: 15 }
    }
  },
  { timestamps: true }
);

export const GlobalSettings = mongoose.model('GlobalSettings', globalSettingsSchema);
