import { RoutingRule } from '../../models/RoutingRule.js';
import { User } from '../../models/User.js';

export class RoutingService {
  static async resolve({ companyId, channel, contact }) {
    const rule = await RoutingRule.findOne({
      companyId,
      channel,
      enabled: true
    }).sort({ priority: -1, createdAt: 1 });

    if (!rule) return contact.assignedTo || null;
    if (rule.strategy === 'unassigned') return null;
    if (rule.strategy === 'contact_owner') return contact.assignedTo || null;
    if (!['round_robin', 'least_open_conversations'].includes(rule.strategy)) {
      return null;
    }

    const users = await User.find({
      _id: { $in: rule.targetUserIds },
      companyId,
      role: { $in: ['SUPERVISOR', 'CALLCENTER'] },
      status: 'active'
    })
      .select('_id')
      .sort({ _id: 1 });
    if (!users.length) return null;

    const lastId = String(rule.metadata?.lastAssignedUserId || '');
    const lastIndex = users.findIndex((user) => String(user._id) === lastId);
    const next = users[(lastIndex + 1) % users.length];
    rule.metadata = {
      ...(rule.metadata || {}),
      lastAssignedUserId: next._id,
      lastAssignedAt: new Date()
    };
    rule.markModified('metadata');
    await rule.save();
    return next._id;
  }
}
