import { Router } from 'express';
import { assertDistributorModulesAuthorized } from '../core/modules/moduleAccess.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Company } from '../models/Company.js';
import { Plan } from '../models/Plan.js';
import { Subscription } from '../models/Subscription.js';
import { recordActivity } from '../utils/activity.js';
import { assertActivePlan, buildSubscriptionTerms } from '../utils/billing.js';
import { isValidObjectId } from '../utils/validation.js';
import { refreshDistributorOnboarding } from '../utils/onboarding.js';

const router = Router();
const SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'cancelled', 'suspended'];
const CURRENT_SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'suspended'];

function subscriptionScope(user) {
  if (user.role === 'DISTRIBUTOR') return { distributorId: user.distributorId };
  return { companyId: user.companyId };
}

function populateSubscription(query) {
  return query
    .populate('companyId', 'name status')
    .populate(
      'planId',
      'name code price currency billingCycle status limits includedModules features'
    )
    .populate('distributorId', 'name');
}

async function validateTenantReferences(companyId, planId, distributorId) {
  if (!isValidObjectId(companyId) || !isValidObjectId(planId)) {
    throw Object.assign(new Error('companyId y planId validos son requeridos'), { status: 400 });
  }

  const [company, plan] = await Promise.all([
    Company.findOne({ _id: companyId, distributorId }),
    Plan.findOne({ _id: planId, distributorId })
  ]);

  if (!company) {
    throw Object.assign(new Error('La empresa no pertenece al distribuidor autenticado'), {
      status: 400
    });
  }
  if (!plan) {
    throw Object.assign(new Error('El plan no pertenece al distribuidor autenticado'), {
      status: 400
    });
  }
  await assertDistributorModulesAuthorized(distributorId, plan.includedModules);

  return { company, plan };
}

router.use(authMiddleware);

router.get('/', roleMiddleware('DISTRIBUTOR', 'ADMIN'), async (req, res, next) => {
  try {
    const subscriptions = await populateSubscription(
      Subscription.find(subscriptionScope(req.user)).sort({ createdAt: -1 }).limit(100)
    );
    res.json(subscriptions);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', roleMiddleware('DISTRIBUTOR', 'ADMIN'), async (req, res, next) => {
  try {
    const subscription = await populateSubscription(
      Subscription.findOne({ _id: req.params.id, ...subscriptionScope(req.user) })
    );
    if (!subscription) {
      return res.status(404).json({ message: 'Suscripcion no encontrada' });
    }
    res.json(subscription);
  } catch (error) {
    next(error);
  }
});

router.post('/', roleMiddleware('DISTRIBUTOR'), async (req, res, next) => {
  try {
    if (!req.user.distributorId) {
      return res.status(403).json({ message: 'El distribuidor autenticado no tiene distributorId' });
    }

    const { company, plan } = await validateTenantReferences(
      req.body.companyId,
      req.body.planId,
      req.user.distributorId
    );
    assertActivePlan(plan);

    if ('status' in req.body && !SUBSCRIPTION_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ message: 'status de suscripcion invalido' });
    }

    // Upsert: asignar un plan a una empresa que ya tiene una suscripcion vigente
    // actualiza la existente en vez de bloquear con un 409. Mismo criterio que el
    // cambio de plan del distribuidor: el distribuidor debe poder cambiar la
    // suscripcion de cualquiera de sus empresas.
    const existingSubscription = await Subscription.findOne({
      companyId: req.body.companyId,
      distributorId: req.user.distributorId,
      status: { $in: CURRENT_SUBSCRIPTION_STATUSES }
    }).sort({ createdAt: -1 });

    let subscription = existingSubscription;
    if (subscription) {
      subscription.planId = plan._id;
      Object.assign(
        subscription,
        buildSubscriptionTerms(req.body, plan, { current: subscription, defaultStatus: 'active' })
      );
      await subscription.save();
    } else {
      subscription = await Subscription.create({
        companyId: company._id,
        planId: plan._id,
        distributorId: req.user.distributorId,
        ...buildSubscriptionTerms(req.body, plan, { defaultStatus: 'active' })
      });
    }
    await recordActivity({
      user: req.user,
      type: existingSubscription ? 'subscription_updated' : 'subscription_created',
      companyId: subscription.companyId,
      summary: existingSubscription ? 'Suscripcion actualizada' : 'Suscripcion creada',
      metadata: {
        subscriptionId: subscription._id,
        companyId: subscription.companyId,
        planId: subscription.planId,
        status: subscription.status
      }
    });
    await refreshDistributorOnboarding(req.user.distributorId);
    await subscription.populate([
      { path: 'companyId', select: 'name status' },
      {
        path: 'planId',
        select: 'name code price currency billingCycle status limits includedModules features'
      },
      { path: 'distributorId', select: 'name' }
    ]);
    res.status(existingSubscription ? 200 : 201).json(subscription);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', roleMiddleware('DISTRIBUTOR'), async (req, res, next) => {
  try {
    const current = await Subscription.findOne({
      _id: req.params.id,
      distributorId: req.user.distributorId
    });
    if (!current) return res.status(404).json({ message: 'Suscripcion no encontrada' });

    const companyId = req.body.companyId || current.companyId;
    const planId = req.body.planId || current.planId;
    const { plan } = await validateTenantReferences(companyId, planId, req.user.distributorId);
    if (String(planId) !== String(current.planId)) assertActivePlan(plan);

    if ('status' in req.body && !SUBSCRIPTION_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ message: 'status de suscripcion invalido' });
    }

    current.companyId = companyId;
    current.planId = planId;
    const terms = buildSubscriptionTerms(req.body, plan, { current });
    if (CURRENT_SUBSCRIPTION_STATUSES.includes(terms.status)) {
      const duplicate = await Subscription.exists({
        _id: { $ne: current._id },
        companyId,
        distributorId: req.user.distributorId,
        status: { $in: CURRENT_SUBSCRIPTION_STATUSES }
      });
      if (duplicate) {
        return res.status(409).json({
          message: 'La empresa ya tiene otra suscripcion activa o en prueba'
        });
      }
    }

    Object.assign(current, terms);
    await current.save();
    await recordActivity({
      user: req.user,
      type: 'subscription_updated',
      companyId: current.companyId,
      summary: 'Suscripcion actualizada',
      metadata: {
        subscriptionId: current._id,
        planId: current.planId,
        status: current.status
      }
    });
    await current.populate([
      { path: 'companyId', select: 'name status' },
      {
        path: 'planId',
        select: 'name code price currency billingCycle status limits includedModules features'
      },
      { path: 'distributorId', select: 'name' }
    ]);
    res.json(current);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', roleMiddleware('DISTRIBUTOR'), async (req, res, next) => {
  try {
    const subscription = await Subscription.findOneAndDelete({
      _id: req.params.id,
      distributorId: req.user.distributorId
    });
    if (!subscription) {
      return res.status(404).json({ message: 'Suscripcion no encontrada' });
    }
    res.json({ message: 'Suscripcion eliminada' });
  } catch (error) {
    next(error);
  }
});

export default router;
