import { MODULE_REGISTRY, getRegisteredModule } from './moduleRegistry.js';
import { Company } from '../../models/Company.js';
import { Distributor } from '../../models/Distributor.js';
import { ModuleEntitlement } from '../../models/ModuleEntitlement.js';
import { PlatformPlan } from '../../models/PlatformPlan.js';
import { PlatformSubscription } from '../../models/PlatformSubscription.js';
import { Subscription } from '../../models/Subscription.js';

const ACTIVE_SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due'];
const REGISTERED_MODULE_KEYS = new Set(MODULE_REGISTRY.map((module) => module.key));

/** Mapa moduleKey -> enabled a partir de una lista de entitlements. */
function entitlementMap(entitlements) {
  return new Map(entitlements.map((item) => [item.moduleKey, item.enabled]));
}

/**
 * Reduce una cadena de "links" a un resumen: estado final, el eslabon que dejo
 * el estado final (origin) y, si esta deshabilitado, el eslabon que lo bloquea.
 * `verdict`: 'on' | 'off' | 'unchanged' | 'info'.
 */
function summarizeChain(chain) {
  let enabled = false;
  let origin = 'not_enabled';
  let blockedBy = null;
  for (const link of chain) {
    if (link.verdict === 'on') {
      enabled = true;
      origin = link.layer;
      blockedBy = null;
    } else if (link.verdict === 'off') {
      enabled = false;
      origin = link.layer;
      blockedBy = link.layer;
    }
  }
  return { enabled, origin, blockedBy };
}

// ---------- Distribuidor ----------

async function loadDistributorContext(distributorId) {
  const [distributor, subscription, directEntitlements] = await Promise.all([
    Distributor.findById(distributorId).select('settings.enabledModules').lean(),
    PlatformSubscription.findOne({
      distributorId,
      status: { $in: ACTIVE_SUBSCRIPTION_STATUSES }
    })
      .sort({ createdAt: -1 })
      .populate('platformPlanId', 'includedModules name')
      .lean(),
    ModuleEntitlement.find({ scopeType: 'distributor', scopeId: distributorId }).lean()
  ]);
  if (!distributor) return null;

  const platformPlanId = subscription?.platformPlanId?._id;
  const [planEntitlements, subscriptionEntitlements] = await Promise.all([
    platformPlanId
      ? ModuleEntitlement.find({ scopeType: 'platform_plan', scopeId: platformPlanId }).lean()
      : [],
    subscription?._id
      ? ModuleEntitlement.find({ scopeType: 'platform_subscription', scopeId: subscription._id }).lean()
      : []
  ]);

  return {
    platformPlanIncluded: new Set(subscription?.platformPlanId?.includedModules || []),
    distributorSettings: new Set(distributor.settings?.enabledModules || []),
    planEntitlements: entitlementMap(planEntitlements),
    subscriptionEntitlements: entitlementMap(subscriptionEntitlements),
    directEntitlements: entitlementMap(directEntitlements)
  };
}

function distributorChain(moduleKey, ctx) {
  const chain = [];
  const registered = getRegisteredModule(moduleKey);
  chain.push({
    layer: 'registry_default',
    label: `Default del registro: ${registered?.enabledByDefault ? 'activo' : 'inactivo'}`,
    verdict: 'info',
    note: 'Informativo: la base real la definen el plan de plataforma y los ajustes del distribuidor.'
  });

  if (moduleKey === 'core') {
    chain.push({ layer: 'core', label: 'Modulo core (siempre activo)', verdict: 'on' });
    return chain;
  }

  if (ctx.platformPlanIncluded.has(moduleKey)) {
    chain.push({ layer: 'platform_plan', label: 'Incluido en el plan de plataforma', verdict: 'on' });
  } else {
    chain.push({ layer: 'platform_plan', label: 'No incluido en el plan de plataforma', verdict: 'unchanged' });
  }
  if (ctx.distributorSettings.has(moduleKey)) {
    chain.push({ layer: 'distributor_settings', label: 'Habilitado en ajustes del distribuidor', verdict: 'on' });
  }

  const overrides = [
    ['platform_plan_override', 'Override del plan de plataforma', ctx.planEntitlements],
    ['platform_subscription_override', 'Override de la suscripcion de plataforma', ctx.subscriptionEntitlements],
    ['distributor_override', 'Override directo del distribuidor', ctx.directEntitlements]
  ];
  for (const [layer, label, map] of overrides) {
    if (!map.has(moduleKey)) continue;
    const enabled = map.get(moduleKey);
    chain.push({ layer, label: `${label}: ${enabled ? 'activado' : 'desactivado'}`, verdict: enabled ? 'on' : 'off' });
  }
  return chain;
}

export async function traceDistributorModules(distributorId) {
  if (!distributorId) return { authorized: new Set(), modules: [] };
  const ctx = await loadDistributorContext(distributorId);
  if (!ctx) return { authorized: new Set(), modules: [] };

  const modules = MODULE_REGISTRY.map((registered) => {
    const chain = distributorChain(registered.key, ctx);
    const summary = summarizeChain(chain);
    const enabled = registered.key === 'core' ? true : summary.enabled;
    return { key: registered.key, name: registered.name, enabled, origin: summary.origin, blockedBy: enabled ? null : summary.blockedBy, chain };
  });
  const authorized = new Set(modules.filter((module) => module.enabled).map((module) => module.key));
  authorized.add('core');
  return { authorized, modules };
}

export async function getDistributorAuthorizedModules(distributorId) {
  const { authorized } = await traceDistributorModules(distributorId);
  return [...authorized].filter((moduleKey) => REGISTERED_MODULE_KEYS.has(moduleKey));
}

// ---------- Empresa ----------

function companyChain(moduleKey, ctx, distributorEnabled) {
  const chain = [];
  const inPlan = moduleKey === 'core' || ctx.companyPlanIncluded.has(moduleKey);
  chain.push({
    layer: 'company_plan',
    label: inPlan ? 'Incluido en el plan comercial' : 'No incluido en el plan comercial',
    verdict: inPlan ? 'on' : 'off'
  });

  if (inPlan) {
    if (moduleKey !== 'core' && !distributorEnabled) {
      chain.push({ layer: 'distributor_gate', label: 'Bloqueado: la plataforma/distribuidor no autoriza este modulo', verdict: 'off' });
    } else {
      chain.push({ layer: 'distributor_gate', label: 'Autorizado por la plataforma/distribuidor', verdict: 'on' });
    }
  }

  const restrictive = [
    ['company_subscription_override', 'Override de la suscripcion de la empresa', ctx.companySubscriptionEntitlements],
    ['company_override', 'Override directo de la empresa', ctx.companyEntitlements]
  ];
  for (const [layer, label, map] of restrictive) {
    if (!map.has(moduleKey)) continue;
    if (map.get(moduleKey) === false) {
      chain.push({ layer, label: `${label}: desactivado`, verdict: 'off' });
    } else {
      chain.push({ layer, label: `${label}: sin restriccion (no puede habilitar mas alla del plan)`, verdict: 'unchanged' });
    }
  }
  return chain;
}

export async function traceCompanyModules(companyId) {
  if (!companyId) return { authorized: new Set(), modules: [], distributorId: null };
  const company = await Company.findById(companyId).select('distributorId').lean();
  if (!company) return { authorized: new Set(), modules: [], distributorId: null };

  const distributorTrace = await traceDistributorModules(company.distributorId);
  const distributorEnabled = distributorTrace.authorized;
  const distributorChainByKey = new Map(distributorTrace.modules.map((module) => [module.key, module.chain]));

  const [subscription, companyEntitlements] = await Promise.all([
    Subscription.findOne({ companyId, status: { $in: ACTIVE_SUBSCRIPTION_STATUSES } })
      .sort({ createdAt: -1 })
      .populate('planId', 'includedModules name')
      .lean(),
    ModuleEntitlement.find({ scopeType: 'company', scopeId: companyId }).lean()
  ]);
  const companySubscriptionEntitlements = subscription?._id
    ? await ModuleEntitlement.find({ scopeType: 'company_subscription', scopeId: subscription._id }).lean()
    : [];

  const ctx = {
    companyPlanIncluded: new Set(subscription?.planId?.includedModules || []),
    companySubscriptionEntitlements: entitlementMap(companySubscriptionEntitlements),
    companyEntitlements: entitlementMap(companyEntitlements)
  };

  const modules = MODULE_REGISTRY.map((registered) => {
    const distEnabled = distributorEnabled.has(registered.key);
    const ownChain = companyChain(registered.key, ctx, distEnabled);
    // La cadena completa muestra primero la resolucion del distribuidor y luego
    // la de la empresa, para que el diagnostico sea la verdad de punta a punta.
    const chain = [...(distributorChainByKey.get(registered.key) || []), ...ownChain];
    const summary = summarizeChain(ownChain);
    const enabled = registered.key === 'core' ? true : summary.enabled;
    return {
      key: registered.key,
      name: registered.name,
      enabled,
      origin: summary.origin,
      blockedBy: enabled ? null : summary.blockedBy,
      chain
    };
  });
  const authorized = new Set(modules.filter((module) => module.enabled).map((module) => module.key));
  authorized.add('core');
  return { authorized, modules, distributorId: company.distributorId };
}

export async function getCompanyAuthorizedModules(companyId) {
  const { authorized } = await traceCompanyModules(companyId);
  return [...authorized].filter((moduleKey) => REGISTERED_MODULE_KEYS.has(moduleKey));
}

// ---------- Plan de plataforma (para la matriz del SUPERADMIN) ----------

export async function tracePlatformPlanModules(platformPlanId) {
  if (!platformPlanId) return { authorized: new Set(), modules: [] };
  const [plan, entitlements] = await Promise.all([
    PlatformPlan.findById(platformPlanId).select('includedModules name').lean(),
    ModuleEntitlement.find({ scopeType: 'platform_plan', scopeId: platformPlanId }).lean()
  ]);
  if (!plan) return { authorized: new Set(), modules: [] };
  const included = new Set(plan.includedModules || []);
  const overrides = entitlementMap(entitlements);

  const modules = MODULE_REGISTRY.map((registered) => {
    const chain = [];
    const base = registered.key === 'core' || included.has(registered.key);
    chain.push({
      layer: 'platform_plan',
      label: base ? 'Incluido en el plan de plataforma' : 'No incluido en el plan de plataforma',
      verdict: base ? 'on' : 'off'
    });
    if (overrides.has(registered.key)) {
      const enabled = overrides.get(registered.key);
      chain.push({ layer: 'platform_plan_override', label: `Override: ${enabled ? 'activado' : 'desactivado'}`, verdict: enabled ? 'on' : 'off' });
    }
    const summary = summarizeChain(chain);
    const enabled = registered.key === 'core' ? true : summary.enabled;
    return { key: registered.key, name: registered.name, enabled, origin: summary.origin, blockedBy: enabled ? null : summary.blockedBy, chain };
  });
  const authorized = new Set(modules.filter((module) => module.enabled).map((module) => module.key));
  authorized.add('core');
  return { authorized, modules };
}

/**
 * Traza efectiva por alcance, reutilizada por la matriz y el diagnostico. La
 * verdad es la misma que consume requireModule (getXAuthorizedModules delegan
 * en estas funciones).
 */
export async function traceScopeModules(scopeType, scopeId) {
  if (scopeType === 'distributor') return traceDistributorModules(scopeId);
  if (scopeType === 'company') return traceCompanyModules(scopeId);
  if (scopeType === 'platform_plan') return tracePlatformPlanModules(scopeId);
  return { authorized: new Set(), modules: [] };
}

/** Diagnostico de un modulo concreto en un alcance: cadena + eslabon bloqueante. */
export async function explainModuleForScope(scopeType, scopeId, moduleKey) {
  const { modules } = await traceScopeModules(scopeType, scopeId);
  const found = modules.find((module) => module.key === moduleKey);
  if (!found) {
    return { moduleKey, enabled: false, origin: 'unknown', blockedBy: null, chain: [], found: false };
  }
  return { ...found, moduleKey, found: true };
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
