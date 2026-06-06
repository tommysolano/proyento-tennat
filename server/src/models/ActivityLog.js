import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null
    },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      enum: [
        'call',
        'message',
        'note',
        'login',
        'company_created',
        'company_updated',
        'company_suspended',
        'company_reactivated',
        'plan_created',
        'plan_updated',
        'subscription_created',
        'subscription_updated',
        'user_created',
        'contact_created',
        'contact_updated',
        'contact_deleted',
        'contact_assigned',
        'status_change',
        'note_added',
        'follow_up_updated',
        'distributor_created',
        'distributor_updated',
        'distributor_suspended',
        'distributor_reactivated',
        'platform_plan_created',
        'platform_plan_updated',
        'platform_subscription_created',
        'platform_subscription_updated',
        'invoice_created',
        'invoice_updated',
        'payment_recorded',
        'company_invoice_created',
        'company_invoice_updated',
        'company_payment_recorded',
        'distributor_settings_updated',
        'distributor_branding_updated',
        'onboarding_updated',
        'module_entitlement_updated',
        'impersonation_started',
        'impersonation_ended'
      ],
      required: true
    },
    summary: {
      type: String,
      required: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
