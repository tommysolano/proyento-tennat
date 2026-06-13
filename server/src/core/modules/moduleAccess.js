import { MODULE_REGISTRY } from './moduleRegistry.js';
import { Company } from '../../models/Company.js';
import { Distributor } from '../../models/Distributor.js';
import { ModuleEntitlement } from '../../models/ModuleEntitlement.js';
import { PlatformSubscription } from '../../models/PlatformSubscription.js';
import { Subscription } from '../../models/Subscription.js';

const ACTIVE_SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due'];
const REGISTERED_MODULE_KEYS = new Set(MODULE_REGISTRY.map((module) => module.key));

function applyEntitlements(moduleKeys, entitlements) {
  const result = new Set(moduleKeys);
  for (const entitlement of entitlements) {
    if (entitlement.enabled) result.add(entitlement.moduleKey);
    else result.delete(entitlement.moduleKey);
  }
  return result;
}

function applyRestrictiveEntitlements(moduleKeys, entitlements) {
  const result = new Set(moduleKeys);
  for (const entitlement of entitlements) {
    if (!entitlement.enabled) result.delete(entitlement.moduleKey);
  }
  return result;
}

export async function getDistributorAuthorizedModules(distributorId) {
  if (!distributorId) return [];

  const [distributor, subscription, directEntitlements] = await Promise.all([
    Distributor.findById(distributorId).select('settings.enabledModules').lean(),
    PlatformSubscription.findOne({
      distributorId,
      status: { $in: ACTIVE_SUBSCRIPTION_STATUSES }
    })
      .sort({ createdAt: -1 })
      .populate('platformPlanId', 'includedModules')
      .lean(),
    ModuleEntitlement.find({ scopeType: 'distributor', scopeId: distributorId }).lean()
  ]);

  if (!distributor) return [];

  const platformPlanId = subscription?.platformPlanId?._id;
  const [planEntitlements, subscriptionEntitlements] = await Promise.all([
    platformPlanId
      ? ModuleEntitlement.find({
          scopeType: 'platform_plan',
          scopeId: platformPlanId
        }).lean()
      : [],
    subscription?._id
      ? ModuleEntitlement.find({
          scopeType: 'platform_subscription',
          scopeId: subscription._id
        }).lean()
      : []
  ]);
  const baseModules = [
    'core',
    ...(subscription?.platformPlanId?.includedModules || []),
    ...(distributor.settings?.enabledModules || [])
  ];
  const fromPlan = applyEntitlements(baseModules, planEntitlements);
  const fromSubscription = applyEntitlements(fromPlan, subscriptionEntitlements);
  const authorized = applyEntitlements(fromSubscription, directEntitlements);
  authorized.add('core');
  return [...authorized].filter((moduleKey) => REGISTERED_MODULE_KEYS.has(moduleKey));
}

export async function getCompanyAuthorizedModules(companyId) {
  if (!companyId) return [];

  const company = await Company.findById(companyId)
    .select('distributorId')
    .lean();
  if (!company) return [];

  const distributorModules = new Set(
    await getDistributorAuthorizedModules(company.distributorId)
  );
  const [subscription, companyEntitlements] = await Promise.all([
    Subscription.findOne({
      companyId,
      status: { $in: ACTIVE_SUBSCRIPTION_STATUSES }
    })
      .sort({ createdAt: -1 })
      .populate('planId', 'includedModules')
      .lean(),
    ModuleEntitlement.find({ scopeType: 'company', scopeId: companyId }).lean()
  ]);

  const planModules = new Set([
    'core',
    ...(subscription?.planId?.includedModules || [])
  ]);
  const subscriptionEntitlements = subscription?._id
    ? await ModuleEntitlement.find({
        scopeType: 'company_subscription',
        scopeId: subscription._id
      }).lean()
    : [];
  const allowed = [...planModules].filter((moduleKey) => distributorModules.has(moduleKey));
  const fromSubscription = applyRestrictiveEntitlements(allowed, subscriptionEntitlements);
  const authorized = applyRestrictiveEntitlements(fromSubscription, companyEntitlements);
  authorized.add('core');
  return [...authorized].filter((moduleKey) => REGISTERED_MODULE_KEYS.has(moduleKey));
}

export async function getUserAuthorizedModules(user) {
  if (user?.role === 'SUPERADMIN') return MODULE_REGISTRY.map((module) => module.key);
  if (user?.companyId) return getCompanyAuthorizedModules(user.companyId);
  return getDistributorAuthorizedModules(user?.distributorId);
}

export async function isModuleAuthorizedForDistributor(distributorId, moduleKey) {
  return (await getDistributorAuthorizedModules(distributorId)).includes(moduleKey);
}

export async function assertDistributorModulesAuthorized(distributorId, moduleKeys = []) {
  const authorizedModules = new Set(
    await getDistributorAuthorizedModules(distributorId)
  );
  const unauthorizedModule = moduleKeys.find(
    (moduleKey) => !authorizedModules.has(moduleKey)
  );
  if (unauthorizedModule) {
    throw Object.assign(
      new Error(`El modulo ${unauthorizedModule} ya no esta autorizado para este distribuidor`),
      { status: 403 }
    );
  }
}
