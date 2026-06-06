import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Company } from '../models/Company.js';
import { Plan } from '../models/Plan.js';
import { Subscription } from '../models/Subscription.js';
import { recordActivity } from '../utils/activity.js';
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

function subscriptionDates(body) {
  const data = {};

  for (const field of [
    'startsAt',
    'endsAt',
    'trialEndsAt',
    'currentPeriodStart',
    'currentPeriodEnd'
  ]) {
    if (field in body) {
      if (body[field] === null && field === 'endsAt') {
        data[field] = null;
        continue;
      }

      const date = new Date(body[field]);
      if (Number.isNaN(date.getTime())) {
        throw Object.assign(new Error(`${field} debe ser una fecha valida`), { status: 400 });
      }
      data[field] = date;
    }
  }

  if ('cancelAtPeriodEnd' in body) data.cancelAtPeriodEnd = Boolean(body.cancelAtPeriodEnd);
  for (const field of ['paymentProvider', 'providerCustomerId', 'providerSubscriptionId']) {
    if (field in body) data[field] = typeof body[field] === 'string' ? body[field].trim() : '';
  }
  if ('metadata' in body) data.metadata = body.metadata || {};

  return data;
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

    await validateTenantReferences(
      req.body.companyId,
      req.body.planId,
      req.user.distributorId
    );

    const existingSubscription = await Subscription.findOne({
      companyId: req.body.companyId,
      distributorId: req.user.distributorId,
      status: { $in: CURRENT_SUBSCRIPTION_STATUSES }
    });
    if (existingSubscription) {
      return res.status(409).json({
        message: 'La empresa ya tiene una suscripcion activa o en prueba'
      });
    }

    if ('status' in req.body && !SUBSCRIPTION_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ message: 'status de suscripcion invalido' });
    }

    const subscription = await Subscription.create({
      companyId: req.body.companyId,
      planId: req.body.planId,
      distributorId: req.user.distributorId,
      status: req.body.status || 'active',
      ...subscriptionDates(req.body)
    });
    await recordActivity({
      user: req.user,
      type: 'subscription_created',
      companyId: subscription.companyId,
      summary: 'Suscripcion creada',
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
    res.status(201).json(subscription);
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
    await validateTenantReferences(companyId, planId, req.user.distributorId);

    if ('status' in req.body && !SUBSCRIPTION_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ message: 'status de suscripcion invalido' });
    }

    current.companyId = companyId;
    current.planId = planId;
    if ('status' in req.body) current.status = req.body.status;

    if (CURRENT_SUBSCRIPTION_STATUSES.includes(current.status)) {
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

    Object.assign(current, subscriptionDates(req.body));
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
