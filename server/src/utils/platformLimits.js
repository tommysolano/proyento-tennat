import { Company } from '../models/Company.js';
import { Contact } from '../models/Contact.js';
import { ModuleEntitlement } from '../models/ModuleEntitlement.js';
import { PlatformSubscription } from '../models/PlatformSubscription.js';
import { User } from '../models/User.js';

async function currentUsage(distributorId, metric) {
  if (metric === 'companies') return Company.countDocuments({ distributorId });
  if (metric === 'users') return User.countDocuments({ distributorId });
  if (metric === 'contacts') {
    const companyIds = await Company.find({ distributorId }).distinct('_id');
    return Contact.countDocuments({ companyId: { $in: companyIds } });
  }
  if (metric === 'modules') {
    return ModuleEntitlement.countDocuments({
      scopeType: 'distributor',
      scopeId: distributorId,
      enabled: true
    });
  }
  return 0;
}

export async function checkPlatformLimit(distributorId, metric) {
  if (!distributorId) {
    throw Object.assign(new Error('distributorId es requerido para validar limites'), {
      status: 400
    });
  }

  const subscription = await PlatformSubscription.findOne({ distributorId })
    .sort({ createdAt: -1 })
    .populate('platformPlanId');

  if (!subscription) {
    if (process.env.NODE_ENV === 'production') {
      throw Object.assign(
        new Error('El distribuidor no tiene una suscripcion de plataforma'),
        { status: 403 }
      );
    }
    console.warn(`[limits] ${distributorId} no tiene PlatformSubscription; permitido en desarrollo`);
    return { allowed: true, warning: 'missing_subscription' };
  }

  if (!['trial', 'active', 'past_due'].includes(subscription.status)) {
    throw Object.assign(
      new Error(`La suscripcion de plataforma esta ${subscription.status}`),
      { status: 403 }
    );
  }

  const limit = subscription.platformPlanId?.limits?.[metric];
  if (limit === undefined || limit === null) {
    return { allowed: true, warning: 'limit_not_configured' };
  }

  const usage = await currentUsage(distributorId, metric);
  if (usage >= limit) {
    throw Object.assign(
      new Error(`Limite de ${metric} alcanzado (${usage}/${limit})`),
      { status: 403 }
    );
  }

  return { allowed: true, usage, limit, remaining: limit - usage };
}
