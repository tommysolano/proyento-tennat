import { getRegisteredModule } from '../core/modules/moduleRegistry.js';
import { ModuleEntitlement } from '../models/ModuleEntitlement.js';
import { PlatformSubscription } from '../models/PlatformSubscription.js';
import { Subscription } from '../models/Subscription.js';

async function explicitEntitlement(scopeType, scopeId, moduleKey) {
  if (!scopeId) return null;
  return ModuleEntitlement.findOne({ scopeType, scopeId, moduleKey }).lean();
}

export async function checkModuleAccess(moduleKey, user) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({
          enabled: false,
          status: this.statusCode,
          message: payload?.message || `El modulo ${moduleKey} no esta habilitado`
        });
      }
    };
    const next = (error) => {
      if (error) reject(error);
      else resolve({ enabled: true, status: 200, message: '' });
    };
    requireModule(moduleKey)({ user }, response, next).catch(reject);
  });
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
      const companyId = req.user?.companyId;
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
        if (!distributorEntitlement.enabled) {
          return res.status(403).json({ message: `El modulo ${moduleKey} esta desactivado` });
        }
      }

      let enabled = Boolean(distributorEntitlement?.enabled);
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
          if (!subscriptionEntitlement.enabled) {
            return res.status(403).json({ message: `El modulo ${moduleKey} esta desactivado` });
          }
          enabled = true;
        }

        const planEntitlement = await explicitEntitlement(
          'platform_plan',
          subscription.platformPlanId?._id,
          moduleKey
        );
        if (planEntitlement) {
          if (!planEntitlement.enabled) {
            return res.status(403).json({ message: `El modulo ${moduleKey} esta desactivado` });
          }
          enabled = true;
        }

        if (subscription.platformPlanId?.includedModules?.includes(moduleKey)) enabled = true;
      }

      const companyEntitlement = await explicitEntitlement('company', companyId, moduleKey);
      if (companyEntitlement) {
        if (!companyEntitlement.enabled) {
          return res.status(403).json({ message: `El modulo ${moduleKey} esta desactivado para la empresa` });
        }
        enabled = true;
      }

      if (companyId) {
        const companySubscription = await Subscription.findOne({
          companyId,
          status: { $in: ['trial', 'active', 'past_due'] }
        })
          .sort({ createdAt: -1 })
          .populate('planId', 'includedModules')
          .lean();
        if (companySubscription) {
          const entitlement = await explicitEntitlement(
            'company_subscription',
            companySubscription._id,
            moduleKey
          );
          if (entitlement) {
            if (!entitlement.enabled) {
              return res.status(403).json({ message: `El modulo ${moduleKey} esta desactivado para la suscripcion` });
            }
            enabled = true;
          }
          if (companySubscription.planId?.includedModules?.includes(moduleKey)) enabled = true;
        }
      }

      if (enabled || registeredModule.enabledByDefault) return next();
      return res.status(403).json({ message: `El modulo ${moduleKey} no esta habilitado` });
    } catch (error) {
      next(error);
    }
  };
}
