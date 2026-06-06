import { getRegisteredModule } from '../core/modules/moduleRegistry.js';
import { ModuleEntitlement } from '../models/ModuleEntitlement.js';
import { PlatformSubscription } from '../models/PlatformSubscription.js';

async function explicitEntitlement(scopeType, scopeId, moduleKey) {
  if (!scopeId) return null;
  return ModuleEntitlement.findOne({ scopeType, scopeId, moduleKey }).lean();
}

export function requireModule(moduleKey) {
  return async (req, res, next) => {
    try {
      const registeredModule = getRegisteredModule(moduleKey);
      if (!registeredModule) {
        return res.status(500).json({ message: `Modulo no registrado: ${moduleKey}` });
      }

      if (req.user?.role === 'SUPERADMIN') return next();

      const distributorId = req.user?.distributorId;
      if (!distributorId) {
        return registeredModule.enabledByDefault
          ? next()
          : res.status(403).json({ message: `El modulo ${moduleKey} no esta habilitado` });
      }

      const distributorEntitlement = await explicitEntitlement(
        'distributor',
        distributorId,
        moduleKey
      );
      if (distributorEntitlement) {
        return distributorEntitlement.enabled
          ? next()
          : res.status(403).json({ message: `El modulo ${moduleKey} esta desactivado` });
      }

      const subscription = await PlatformSubscription.findOne({
        distributorId,
        status: { $in: ['trial', 'active', 'past_due'] }
      })
        .sort({ createdAt: -1 })
        .populate('platformPlanId', 'includedModules')
        .lean();

      if (subscription) {
        const subscriptionEntitlement = await explicitEntitlement(
          'platform_subscription',
          subscription._id,
          moduleKey
        );
        if (subscriptionEntitlement) {
          return subscriptionEntitlement.enabled
            ? next()
            : res.status(403).json({ message: `El modulo ${moduleKey} esta desactivado` });
        }

        const planEntitlement = await explicitEntitlement(
          'platform_plan',
          subscription.platformPlanId?._id,
          moduleKey
        );
        if (planEntitlement) {
          return planEntitlement.enabled
            ? next()
            : res.status(403).json({ message: `El modulo ${moduleKey} esta desactivado` });
        }

        if (subscription.platformPlanId?.includedModules?.includes(moduleKey)) return next();
      }

      if (registeredModule.enabledByDefault) return next();
      return res.status(403).json({ message: `El modulo ${moduleKey} no esta habilitado` });
    } catch (error) {
      next(error);
    }
  };
}
