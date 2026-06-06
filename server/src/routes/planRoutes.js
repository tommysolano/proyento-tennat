import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Plan } from '../models/Plan.js';
import { cleanString } from '../utils/validation.js';

const router = Router();
const BILLING_CYCLES = ['monthly', 'quarterly', 'yearly'];
const PLAN_STATUSES = ['active', 'inactive', 'draft'];
const LIMIT_FIELDS = ['users', 'contacts', 'channels'];

function planScope(user) {
  return { distributorId: user.distributorId };
}

function planPayload(body, partial = false) {
  const data = {};

  if (!partial || 'name' in body) {
    const name = cleanString(body.name);
    if (!name) throw Object.assign(new Error('name es requerido'), { status: 400 });
    data.name = name;
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

  return data;
}

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
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

router.get('/:id', async (req, res, next) => {
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
    await plan.populate('distributorId', 'name');
    res.status(201).json(plan);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', roleMiddleware('DISTRIBUTOR'), async (req, res, next) => {
  try {
    const plan = await Plan.findOneAndUpdate(
      { _id: req.params.id, distributorId: req.user.distributorId },
      planPayload(req.body, true),
      { new: true, runValidators: true }
    ).populate('distributorId', 'name');
    if (!plan) return res.status(404).json({ message: 'Plan no encontrado' });
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', roleMiddleware('DISTRIBUTOR'), async (req, res, next) => {
  try {
    const plan = await Plan.findOneAndDelete({
      _id: req.params.id,
      distributorId: req.user.distributorId
    });
    if (!plan) return res.status(404).json({ message: 'Plan no encontrado' });
    res.json({ message: 'Plan eliminado' });
  } catch (error) {
    next(error);
  }
});

export default router;
