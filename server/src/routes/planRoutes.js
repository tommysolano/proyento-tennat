import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Plan } from '../models/Plan.js';
import { recordActivity } from '../utils/activity.js';
import { cleanString } from '../utils/validation.js';
import { refreshDistributorOnboarding } from '../utils/onboarding.js';

const router = Router();
const BILLING_CYCLES = ['monthly', 'yearly'];
const PLAN_STATUSES = ['active', 'inactive', 'archived'];
const LIMIT_FIELDS = [
  'users',
  'contacts',
  'messages',
  'storageMb',
  'whatsappMessages',
  'mediaStorageMb',
  'mediaFiles',
  'conversations',
  'calendars',
  'appointments',
  'bookingLinks',
  'workflows',
  'workflowRunsPerMonth',
  'workflowActionsPerMonth',
  'forms',
  'formSubmissionsPerMonth',
  'landingPages',
  'funnels',
  'funnelSteps',
  'pageViewsPerMonth',
  'reviewRequestsPerMonth',
  'reviews',
  'reviewWidgets',
  'surveys',
  'surveyResponsesPerMonth',
  'coupons',
  'couponRedemptionsPerMonth',
  'referralPrograms',
  'referralsPerMonth',
  'modules'
];

function planScope(user) {
  if (user.role === 'SUPERADMIN') return {};
  return { distributorId: user.distributorId };
}

function codeFromName(name) {
  return cleanString(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function planPayload(body, partial = false) {
  const data = {};
  let parsedName;

  if (!partial || 'name' in body) {
    parsedName = cleanString(body.name);
    if (!parsedName) throw Object.assign(new Error('name es requerido'), { status: 400 });
    data.name = parsedName;
  }

  if (!partial || 'code' in body) {
    const code = cleanString(body.code).toLowerCase() || codeFromName(parsedName);
    if (!code) throw Object.assign(new Error('code es requerido'), { status: 400 });
    data.code = code;
  }

  if (!partial || 'price' in body) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
      throw Object.assign(new Error('price debe ser numerico y mayor o igual a 0'), { status: 400 });
    }
    data.price = price;
  }

  if ('description' in body) {
    if (typeof body.description !== 'string') {
      throw Object.assign(new Error('description debe ser un string'), { status: 400 });
    }
    data.description = cleanString(body.description);
  }

  if ('currency' in body) {
    data.currency = cleanString(body.currency).toUpperCase() || 'USD';
  }

  if ('billingCycle' in body) {
    if (!BILLING_CYCLES.includes(body.billingCycle)) {
      throw Object.assign(new Error('billingCycle invalido'), { status: 400 });
    }
    data.billingCycle = body.billingCycle;
  }

  if ('status' in body) {
    if (!PLAN_STATUSES.includes(body.status)) {
      throw Object.assign(new Error('status de plan invalido'), { status: 400 });
    }
    data.status = body.status;
  }

  if ('limits' in body) {
    if (!body.limits || typeof body.limits !== 'object' || Array.isArray(body.limits)) {
      throw Object.assign(new Error('limits debe ser un objeto'), { status: 400 });
    }

    data.limits = {};
    for (const field of LIMIT_FIELDS) {
      if (field in body.limits) {
        const value = Number(body.limits[field]);
        if (!Number.isInteger(value) || value < 0) {
          throw Object.assign(new Error(`limits.${field} debe ser un entero no negativo`), {
            status: 400
          });
        }
        data.limits[field] = value;
      }
    }
  }

  if ('features' in body) {
    if (!Array.isArray(body.features) || body.features.some((item) => typeof item !== 'string')) {
      throw Object.assign(new Error('features debe ser una lista de strings'), { status: 400 });
    }
    data.features = body.features.map(cleanString).filter(Boolean);
  }

  if ('includedModules' in body) {
    if (
      !Array.isArray(body.includedModules) ||
      body.includedModules.some((item) => typeof item !== 'string')
    ) {
      throw Object.assign(new Error('includedModules debe ser una lista de strings'), {
        status: 400
      });
    }
    data.includedModules = [...new Set(body.includedModules.map(cleanString).filter(Boolean))];
  }

  if ('metadata' in body) data.metadata = body.metadata || {};

  return data;
}

router.use(authMiddleware);

router.get('/', roleMiddleware('DISTRIBUTOR', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const plans = await Plan.find(planScope(req.user))
      .populate('distributorId', 'name')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(plans);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', roleMiddleware('DISTRIBUTOR', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const plan = await Plan.findOne({ _id: req.params.id, ...planScope(req.user) })
      .populate('distributorId', 'name');
    if (!plan) return res.status(404).json({ message: 'Plan no encontrado' });
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

router.post('/', roleMiddleware('DISTRIBUTOR'), async (req, res, next) => {
  try {
    if (!req.user.distributorId) {
      return res.status(403).json({ message: 'El distribuidor autenticado no tiene distributorId' });
    }

    const plan = await Plan.create({
      ...planPayload(req.body),
      distributorId: req.user.distributorId
    });
    await recordActivity({
      user: req.user,
      type: 'plan_created',
      summary: `Plan creado: ${plan.name}`,
      metadata: { planId: plan._id, price: plan.price, billingCycle: plan.billingCycle }
    });
    await refreshDistributorOnboarding(req.user.distributorId);
    await plan.populate('distributorId', 'name');
    res.status(201).json(plan);
  } catch (error) {
    next(error);
  }
});

async function updatePlan(req, res, next) {
  try {
    const plan = await Plan.findOneAndUpdate(
      { _id: req.params.id, distributorId: req.user.distributorId },
      planPayload(req.body, true),
      { new: true, runValidators: true }
    ).populate('distributorId', 'name');
    if (!plan) return res.status(404).json({ message: 'Plan no encontrado' });
    await recordActivity({
      user: req.user,
      type: 'plan_updated',
      summary: `Plan actualizado: ${plan.name}`,
      metadata: { planId: plan._id, status: plan.status, code: plan.code }
    });
    res.json(plan);
  } catch (error) {
    next(error);
  }
}

router.patch('/:id', roleMiddleware('DISTRIBUTOR'), updatePlan);
router.put('/:id', roleMiddleware('DISTRIBUTOR'), updatePlan);

router.delete('/:id', roleMiddleware('DISTRIBUTOR'), async (req, res, next) => {
  try {
    const plan = await Plan.findOneAndUpdate(
      { _id: req.params.id, distributorId: req.user.distributorId },
      { status: 'archived' },
      { new: true }
    );
    if (!plan) return res.status(404).json({ message: 'Plan no encontrado' });
    await recordActivity({
      user: req.user,
      type: 'plan_updated',
      summary: `Plan archivado: ${plan.name}`,
      metadata: { planId: plan._id, status: plan.status }
    });
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

export default router;
