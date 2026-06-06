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
        'plan_created',
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
        'impersonation_started'
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
