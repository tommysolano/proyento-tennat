import mongoose from 'mongoose';

export const ROUTING_STRATEGIES = [
  'unassigned',
  'contact_owner',
  'round_robin',
  'least_open_conversations'
];

const routingRuleSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distributor',
      default: null
    },
    name: { type: String, required: true, trim: true },
    channel: { type: String, default: 'whatsapp_cloud', trim: true },
    enabled: { type: Boolean, default: true },
    strategy: { type: String, enum: ROUTING_STRATEGIES, required: true },
    targetUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    targetSupervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    conditions: { type: mongoose.Schema.Types.Mixed, default: {} },
    priority: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

routingRuleSchema.index({ companyId: 1, channel: 1, enabled: 1, priority: -1 });

export const RoutingRule = mongoose.model('RoutingRule', routingRuleSchema);
