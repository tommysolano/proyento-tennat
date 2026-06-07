import { Router } from 'express';
import { MODULE_REGISTRY, getRegisteredModule } from '../core/modules/moduleRegistry.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import {
  ActivityLog,
  Company,
  Distributor,
  Invoice,
  ModuleEntitlement,
  Payment,
  PlatformPlan,
  PlatformSubscription,
  UsageRecord,
  User
} from '../models/index.js';
import { recordActivity } from '../utils/activity.js';
import { cleanString, EMAIL_PATTERN, isValidObjectId } from '../utils/validation.js';

const router = Router();
const DISTRIBUTOR_STATUSES = ['active', 'suspended', 'cancelled', 'trial'];
const PLAN_STATUSES = ['active', 'inactive', 'archived'];
const SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'cancelled', 'suspended'];
const INVOICE_STATUSES = ['draft', 'open', 'paid', 'overdue', 'void', 'uncollectible'];
const PAYMENT_STATUSES = ['pending', 'succeeded', 'failed', 'refunded'];
const ACTIVE_SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'suspended'];
const LIMIT_FIELDS = [
  'companies',
  'users',
  'contacts',
  'modules',
  'storageMb',
  'messages',
  'whatsappMessages',
  'mediaStorageMb',
  'mediaFiles',
  'conversations'
];

function numberValue(value, field, { integer = false, min = 0 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || (integer && !Number.isInteger(parsed))) {
    throw Object.assign(new Error(`${field} debe ser numerico y mayor o igual a ${min}`), {
      status: 400
    });
  }
  return parsed;
}

function dateValue(value, field, { nullable = true } = {}) {
  if ((value === null || value === '') && nullable) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw Object.assign(new Error(`${field} debe ser una fecha valida`), { status: 400 });
  }
  return parsed;
}

function platformPlanPayload(body, partial = false) {
  const data = {};

  if (!partial || 'name' in body) {
    data.name = cleanString(body.name);
    if (!data.name) throw Object.assign(new Error('name es requerido'), { status: 400 });
  }
  if (!partial || 'code' in body) {
    data.code = cleanString(body.code).toLowerCase();
    if (!data.code) throw Object.assign(new Error('code es requerido'), { status: 400 });
  }
  if (!partial || 'price' in body) data.price = numberValue(body.price, 'price');
  if ('description' in body) data.description = cleanString(body.description);
  if ('currency' in body) data.currency = cleanString(body.currency).toUpperCase() || 'USD';
  if ('billingCycle' in body) {
    if (!['monthly', 'yearly'].includes(body.billingCycle)) {
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
        data.limits[field] = numberValue(body.limits[field], `limits.${field}`, {
          integer: true
        });
      }
    }
  }
  if ('includedModules' in body) {
    if (!Array.isArray(body.includedModules)) {
      throw Object.assign(new Error('includedModules debe ser una lista'), { status: 400 });
    }
    const modules = [...new Set(body.includedModules.map(cleanString).filter(Boolean))];
    const invalidModule = modules.find((key) => !getRegisteredModule(key));
    if (invalidModule) {
      throw Object.assign(new Error(`Modulo no registrado: ${invalidModule}`), { status: 400 });
    }
    data.includedModules = modules;
  }
  if ('metadata' in body) data.metadata = body.metadata || {};

  return data;
}

function subscriptionPayload(body) {
  const data = {};
  if ('status' in body) {
    if (!SUBSCRIPTION_STATUSES.includes(body.status)) {
      throw Object.assign(new Error('status de suscripcion invalido'), { status: 400 });
    }
    data.status = body.status;
  }
  for (const field of [
    'startsAt',
    'endsAt',
    'trialEndsAt',
    'currentPeriodStart',
    'currentPeriodEnd'
  ]) {
    if (field in body) data[field] = dateValue(body[field], field);
  }
  if ('cancelAtPeriodEnd' in body) data.cancelAtPeriodEnd = Boolean(body.cancelAtPeriodEnd);
  for (const field of ['paymentProvider', 'providerCustomerId', 'providerSubscriptionId']) {
    if (field in body) data[field] = cleanString(body[field]);
  }
  if ('metadata' in body) data.metadata = body.metadata || {};
  return data;
}

function invoicePayload(body, partial = false) {
  const data = {};

  if (!partial || 'status' in body) {
    const status = body.status || 'open';
    if (!INVOICE_STATUSES.includes(status)) {
      throw Object.assign(new Error('status de factura invalido'), { status: 400 });
    }
    data.status = status;
  }
  if (!partial || 'dueDate' in body) {
    data.dueDate = body.dueDate
      ? dateValue(body.dueDate, 'dueDate', { nullable: false })
      : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
  }
  if ('currency' in body || !partial) {
    data.currency = cleanString(body.currency).toUpperCase() || 'USD';
  }
  if ('lineItems' in body || !partial) {
    if (!Array.isArray(body.lineItems) || !body.lineItems.length) {
      throw Object.assign(new Error('lineItems debe contener al menos un item'), { status: 400 });
    }
    data.lineItems = body.lineItems.map((item, index) => {
      const description = cleanString(item.description);
      if (!description) {
        throw Object.assign(new Error(`lineItems.${index}.description es requerido`), {
          status: 400
        });
      }
      const quantity = numberValue(item.quantity ?? 1, `lineItems.${index}.quantity`);
      const unitPrice = numberValue(item.unitPrice, `lineItems.${index}.unitPrice`);
      return {
        description,
        quantity,
        unitPrice,
        total: Math.round(quantity * unitPrice * 100) / 100,
        moduleKey: cleanString(item.moduleKey),
        metadata: item.metadata || {}
      };
    });
    data.subtotal =
      Math.round(data.lineItems.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
    data.tax = numberValue(body.tax ?? 0, 'tax');
    data.total = Math.round((data.subtotal + data.tax) * 100) / 100;
  }
  if ('metadata' in body) data.metadata = body.metadata || {};
  return data;
}

function generatedInvoiceNumber() {
  const date = new Date();
  const month = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return `PLAT-${month}-${Date.now().toString().slice(-7)}`;
}

function populateSubscription(query) {
  return query
    .populate('distributorId', 'name slug email status')
    .populate('platformPlanId', 'name code price currency billingCycle limits includedModules status');
}

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN'));

router.get('/overview', requirePermission('platform:manage'), async (req, res, next) => {
  try {
    const [
      distributorsTotal,
      distributorsActive,
      distributorsSuspended,
      activeSubscriptions,
      pendingInvoices,
      subscriptions
    ] = await Promise.all([
      Distributor.countDocuments(),
      Distributor.countDocuments({ status: 'active' }),
      Distributor.countDocuments({ status: 'suspended' }),
      PlatformSubscription.countDocuments({ status: 'active' }),
      Invoice.countDocuments({
        issuerType: 'platform',
        customerType: 'distributor',
        status: { $in: ['open', 'overdue'] }
      }),
      PlatformSubscription.find({ status: { $in: ['active', 'past_due'] } })
        .populate('platformPlanId', 'price billingCycle')
        .lean()
    ]);

    const expectedMonthlyRevenue = subscriptions.reduce((sum, subscription) => {
      const price = subscription.platformPlanId?.price || 0;
      return sum + (subscription.platformPlanId?.billingCycle === 'yearly' ? price / 12 : price);
    }, 0);

    res.json({
      distributorsTotal,
      distributorsActive,
      distributorsSuspended,
      expectedMonthlyRevenue: Math.round(expectedMonthlyRevenue * 100) / 100,
      activeSubscriptions,
      pendingInvoices,
      registeredModules: MODULE_REGISTRY.length
    });
  } catch (error) {
    next(error);
  }
});

router.get('/distributors', requirePermission('distributors:manage'), async (req, res, next) => {
  try {
    const distributors = await Distributor.find().sort({ createdAt: -1 }).limit(250).lean();
    const ownerUsers = await User.find({
      role: 'DISTRIBUTOR',
      distributorId: { $in: distributors.map((item) => item._id) }
    })
      .select('name email status distributorId')
      .lean();
    const usersByDistributor = new Map(
      ownerUsers.map((user) => [user.distributorId.toString(), user])
    );
    res.json(
      distributors.map((distributor) => ({
        ...distributor,
        ownerUser: usersByDistributor.get(distributor._id.toString()) || null
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.post('/distributors', requirePermission('distributors:manage'), async (req, res, next) => {
  let distributor;
  let ownerUser;
  try {
    const name = cleanString(req.body.name);
    const slug = cleanString(req.body.slug).toLowerCase();
    const ownerName = cleanString(req.body.ownerName);
    const email = cleanString(req.body.email).toLowerCase();
    const userData = req.body.ownerUser || {};
    const userName = cleanString(userData.name) || ownerName;
    const userEmail = cleanString(userData.email).toLowerCase() || email;
    const password = typeof userData.password === 'string' ? userData.password : '';

    if (!name || !slug || !ownerName) {
      return res.status(400).json({ message: 'name, slug y ownerName son requeridos' });
    }
    if (!EMAIL_PATTERN.test(email) || !EMAIL_PATTERN.test(userEmail)) {
      return res.status(400).json({ message: 'Emails validos son requeridos' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'password debe tener al menos 8 caracteres' });
    }
    if (await Distributor.exists({ $or: [{ slug }, { email }] })) {
      return res.status(409).json({ message: 'El slug o email del distribuidor ya existe' });
    }
    if (await User.exists({ email: userEmail })) {
      return res.status(409).json({ message: 'El email del usuario ya esta registrado' });
    }

    const status = req.body.status || 'trial';
    if (!DISTRIBUTOR_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'status de distribuidor invalido' });
    }

    distributor = await Distributor.create({
      name,
      slug,
      ownerName,
      email,
      phone: cleanString(req.body.phone),
      region: cleanString(req.body.region) || 'LatAm',
      status,
      branding: req.body.branding || {},
      settings: req.body.settings || {}
    });
    ownerUser = await User.create({
      name: userName,
      email: userEmail,
      password,
      role: 'DISTRIBUTOR',
      distributorId: distributor._id,
      status: 'active'
    });

    await recordActivity({
      user: req.user,
      type: 'distributor_created',
      distributorId: distributor._id,
      summary: `Distribuidor creado: ${distributor.name}`,
      metadata: { distributorId: distributor._id, ownerUserId: ownerUser._id }
    });

    res.status(201).json({ distributor, ownerUser });
  } catch (error) {
    if (ownerUser?._id) await User.deleteOne({ _id: ownerUser._id }).catch(() => {});
    if (distributor?._id) await Distributor.deleteOne({ _id: distributor._id }).catch(() => {});
    next(error);
  }
});

router.get('/distributors/:id', requirePermission('distributors:manage'), async (req, res, next) => {
  try {
    const distributor = await Distributor.findById(req.params.id);
    if (!distributor) return res.status(404).json({ message: 'Distribuidor no encontrado' });
    const [users, subscription, invoices, usage] = await Promise.all([
      User.find({ distributorId: distributor._id }).select('name email role status companyId'),
      populateSubscription(
        PlatformSubscription.findOne({ distributorId: distributor._id }).sort({ createdAt: -1 })
      ),
      Invoice.find({ customerType: 'distributor', customerId: distributor._id })
        .sort({ createdAt: -1 })
        .limit(20),
      UsageRecord.find({ scopeType: 'distributor', scopeId: distributor._id })
        .sort({ periodEnd: -1 })
        .limit(50)
    ]);
    res.json({ distributor, users, subscription, invoices, usage });
  } catch (error) {
    next(error);
  }
});

async function updateDistributor(req, res, next) {
  try {
    const distributor = await Distributor.findById(req.params.id);
    if (!distributor) return res.status(404).json({ message: 'Distribuidor no encontrado' });
    const previousStatus = distributor.status;

    for (const field of ['name', 'ownerName', 'phone', 'region']) {
      if (field in req.body) distributor[field] = cleanString(req.body[field]);
    }
    if ('slug' in req.body) distributor.slug = cleanString(req.body.slug).toLowerCase();
    if ('email' in req.body) {
      const email = cleanString(req.body.email).toLowerCase();
      if (!EMAIL_PATTERN.test(email)) {
        return res.status(400).json({ message: 'email invalido' });
      }
      distributor.email = email;
    }
    if ('status' in req.body) {
      if (!DISTRIBUTOR_STATUSES.includes(req.body.status)) {
        return res.status(400).json({ message: 'status de distribuidor invalido' });
      }
      distributor.status = req.body.status;
    }
    if ('branding' in req.body) distributor.branding = req.body.branding || {};
    if ('settings' in req.body) distributor.settings = req.body.settings || {};
    await distributor.save();

    let type = 'distributor_updated';
    if (distributor.status === 'suspended' && previousStatus !== 'suspended') {
      type = 'distributor_suspended';
    } else if (
      ['active', 'trial'].includes(distributor.status) &&
      previousStatus === 'suspended'
    ) {
      type = 'distributor_reactivated';
    }
    await recordActivity({
      user: req.user,
      type,
      distributorId: distributor._id,
      summary: `Distribuidor actualizado: ${distributor.name}`,
      metadata: { previousStatus, status: distributor.status }
    });
    res.json(distributor);
  } catch (error) {
    next(error);
  }
}

router.patch('/distributors/:id', requirePermission('distributors:manage'), updateDistributor);
router.put('/distributors/:id', requirePermission('distributors:manage'), updateDistributor);

router.get('/platform-plans', requirePermission('platform_plans:manage'), async (req, res, next) => {
  try {
    res.json(await PlatformPlan.find().sort({ createdAt: -1 }).limit(250));
  } catch (error) {
    next(error);
  }
});

router.post('/platform-plans', requirePermission('platform_plans:manage'), async (req, res, next) => {
  try {
    const plan = await PlatformPlan.create(platformPlanPayload(req.body));
    await recordActivity({
      user: req.user,
      type: 'platform_plan_created',
      summary: `Plan de plataforma creado: ${plan.name}`,
      metadata: { platformPlanId: plan._id, code: plan.code }
    });
    res.status(201).json(plan);
  } catch (error) {
    next(error);
  }
});

async function updatePlatformPlan(req, res, next) {
  try {
    const plan = await PlatformPlan.findByIdAndUpdate(
      req.params.id,
      platformPlanPayload(req.body, true),
      { new: true, runValidators: true }
    );
    if (!plan) return res.status(404).json({ message: 'Plan de plataforma no encontrado' });
    await recordActivity({
      user: req.user,
      type: 'platform_plan_updated',
      summary: `Plan de plataforma actualizado: ${plan.name}`,
      metadata: { platformPlanId: plan._id, status: plan.status }
    });
    res.json(plan);
  } catch (error) {
    next(error);
  }
}

router.patch('/platform-plans/:id', requirePermission('platform_plans:manage'), updatePlatformPlan);
router.put('/platform-plans/:id', requirePermission('platform_plans:manage'), updatePlatformPlan);

router.get(
  '/platform-subscriptions',
  requirePermission('platform_subscriptions:manage'),
  async (req, res, next) => {
    try {
      res.json(
        await populateSubscription(
          PlatformSubscription.find().sort({ createdAt: -1 }).limit(250)
        )
      );
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/platform-subscriptions',
  requirePermission('platform_subscriptions:manage'),
  async (req, res, next) => {
    try {
      if (!isValidObjectId(req.body.distributorId) || !isValidObjectId(req.body.platformPlanId)) {
        return res.status(400).json({
          message: 'distributorId y platformPlanId validos son requeridos'
        });
      }
      const [distributor, plan, existing] = await Promise.all([
        Distributor.findById(req.body.distributorId),
        PlatformPlan.findById(req.body.platformPlanId),
        PlatformSubscription.findOne({
          distributorId: req.body.distributorId,
          status: { $in: ACTIVE_SUBSCRIPTION_STATUSES }
        })
      ]);
      if (!distributor || !plan) {
        return res.status(400).json({ message: 'Distribuidor o plan no encontrado' });
      }
      if (existing) {
        return res.status(409).json({
          message: 'El distribuidor ya tiene una suscripcion de plataforma vigente'
        });
      }

      const subscription = await PlatformSubscription.create({
        distributorId: distributor._id,
        platformPlanId: plan._id,
        status: req.body.status || 'trial',
        ...subscriptionPayload(req.body)
      });
      await recordActivity({
        user: req.user,
        type: 'platform_subscription_created',
        distributorId: distributor._id,
        summary: `Suscripcion de plataforma creada para ${distributor.name}`,
        metadata: { platformSubscriptionId: subscription._id, platformPlanId: plan._id }
      });
      res.status(201).json(await populateSubscription(PlatformSubscription.findById(subscription._id)));
    } catch (error) {
      next(error);
    }
  }
);

async function updatePlatformSubscription(req, res, next) {
  try {
    const subscription = await PlatformSubscription.findById(req.params.id);
    if (!subscription) {
      return res.status(404).json({ message: 'Suscripcion de plataforma no encontrada' });
    }
    if ('platformPlanId' in req.body) {
      if (!isValidObjectId(req.body.platformPlanId)) {
        return res.status(400).json({ message: 'platformPlanId invalido' });
      }
      const plan = await PlatformPlan.findById(req.body.platformPlanId);
      if (!plan) return res.status(400).json({ message: 'Plan de plataforma no encontrado' });
      subscription.platformPlanId = plan._id;
    }
    Object.assign(subscription, subscriptionPayload(req.body));
    if (ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
      const duplicate = await PlatformSubscription.exists({
        _id: { $ne: subscription._id },
        distributorId: subscription.distributorId,
        status: { $in: ACTIVE_SUBSCRIPTION_STATUSES }
      });
      if (duplicate) {
        return res.status(409).json({
          message: 'El distribuidor ya tiene otra suscripcion de plataforma vigente'
        });
      }
    }
    await subscription.save();
    await recordActivity({
      user: req.user,
      type: 'platform_subscription_updated',
      distributorId: subscription.distributorId,
      summary: 'Suscripcion de plataforma actualizada',
      metadata: {
        platformSubscriptionId: subscription._id,
        platformPlanId: subscription.platformPlanId,
        status: subscription.status
      }
    });
    res.json(await populateSubscription(PlatformSubscription.findById(subscription._id)));
  } catch (error) {
    next(error);
  }
}

router.patch(
  '/platform-subscriptions/:id',
  requirePermission('platform_subscriptions:manage'),
  updatePlatformSubscription
);
router.put(
  '/platform-subscriptions/:id',
  requirePermission('platform_subscriptions:manage'),
  updatePlatformSubscription
);

router.get('/invoices', requirePermission('platform_billing:manage'), async (req, res, next) => {
  try {
    const filter = req.query.scope === 'all' ? {} : { issuerType: 'platform' };
    res.json(
      await Invoice.find(filter).sort({ createdAt: -1 }).limit(500)
    );
  } catch (error) {
    next(error);
  }
});

router.post('/invoices', requirePermission('platform_billing:manage'), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.body.distributorId)) {
      return res.status(400).json({ message: 'distributorId valido es requerido' });
    }
    const distributor = await Distributor.findById(req.body.distributorId);
    if (!distributor) return res.status(404).json({ message: 'Distribuidor no encontrado' });

    let subscriptionId = null;
    if (req.body.subscriptionId) {
      const subscription = await PlatformSubscription.findOne({
        _id: req.body.subscriptionId,
        distributorId: distributor._id
      });
      if (!subscription) {
        return res.status(400).json({ message: 'La suscripcion no pertenece al distribuidor' });
      }
      subscriptionId = subscription._id;
    }

    const invoice = await Invoice.create({
      issuerType: 'platform',
      issuerId: null,
      customerType: 'distributor',
      customerId: distributor._id,
      subscriptionType: 'platform',
      subscriptionId,
      number: cleanString(req.body.number) || generatedInvoiceNumber(),
      ...invoicePayload(req.body)
    });
    await recordActivity({
      user: req.user,
      type: 'invoice_created',
      distributorId: distributor._id,
      summary: `Factura ${invoice.number} creada para ${distributor.name}`,
      metadata: { invoiceId: invoice._id, total: invoice.total, currency: invoice.currency }
    });
    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
});

async function updateInvoice(req, res, next) {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, issuerType: 'platform' });
    if (!invoice) return res.status(404).json({ message: 'Factura no encontrada' });
    Object.assign(invoice, invoicePayload(req.body, true));
    if (invoice.status === 'paid' && !invoice.paidAt) invoice.paidAt = new Date();
    if (invoice.status !== 'paid' && 'status' in req.body) invoice.paidAt = null;
    await invoice.save();
    await recordActivity({
      user: req.user,
      type: 'invoice_updated',
      distributorId: invoice.customerId,
      summary: `Factura ${invoice.number} actualizada`,
      metadata: { invoiceId: invoice._id, status: invoice.status }
    });
    res.json(invoice);
  } catch (error) {
    next(error);
  }
}

router.patch('/invoices/:id', requirePermission('platform_billing:manage'), updateInvoice);
router.put('/invoices/:id', requirePermission('platform_billing:manage'), updateInvoice);

router.get('/payments', requirePermission('platform_billing:manage'), async (req, res, next) => {
  try {
    const filter = req.query.scope === 'all' ? {} : { payerType: 'distributor' };
    res.json(
      await Payment.find(filter)
        .populate('invoiceId', 'number total status customerId')
        .sort({ createdAt: -1 })
        .limit(250)
    );
  } catch (error) {
    next(error);
  }
});

router.post('/payments', requirePermission('platform_billing:manage'), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.body.invoiceId)) {
      return res.status(400).json({ message: 'invoiceId valido es requerido' });
    }
    const invoice = await Invoice.findOne({
      _id: req.body.invoiceId,
      issuerType: 'platform',
      customerType: 'distributor'
    });
    if (!invoice) return res.status(404).json({ message: 'Factura de plataforma no encontrada' });

    const status = req.body.status || 'succeeded';
    if (!PAYMENT_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'status de pago invalido' });
    }
    const payment = await Payment.create({
      invoiceId: invoice._id,
      payerType: 'distributor',
      payerId: invoice.customerId,
      amount: numberValue(req.body.amount, 'amount', { min: 0.01 }),
      currency: cleanString(req.body.currency).toUpperCase() || invoice.currency,
      status,
      method: cleanString(req.body.method) || 'manual',
      paymentProvider: cleanString(req.body.paymentProvider) || 'manual',
      providerPaymentId: cleanString(req.body.providerPaymentId),
      paidAt:
        status === 'succeeded'
          ? req.body.paidAt
            ? dateValue(req.body.paidAt, 'paidAt', { nullable: false })
            : new Date()
          : null,
      metadata: req.body.metadata || {}
    });

    if (status === 'succeeded') {
      const result = await Payment.aggregate([
        { $match: { invoiceId: invoice._id, status: 'succeeded' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      if ((result[0]?.total || 0) >= invoice.total) {
        invoice.status = 'paid';
        invoice.paidAt = payment.paidAt;
        await invoice.save();
      }
    }

    await recordActivity({
      user: req.user,
      type: 'payment_recorded',
      distributorId: invoice.customerId,
      summary: `Pago registrado para factura ${invoice.number}`,
      metadata: {
        paymentId: payment._id,
        invoiceId: invoice._id,
        amount: payment.amount,
        status: payment.status
      }
    });
    res.status(201).json(await payment.populate('invoiceId', 'number total status customerId'));
  } catch (error) {
    next(error);
  }
});

router.get('/modules', requirePermission('modules:manage'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.scopeType) filter.scopeType = req.query.scopeType;
    if (req.query.scopeId) filter.scopeId = req.query.scopeId;
    const entitlements = await ModuleEntitlement.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json({ registry: MODULE_REGISTRY, entitlements });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/modules/entitlements',
  requirePermission('modules:manage'),
  async (req, res, next) => {
    try {
      const scopeType = cleanString(req.body.scopeType);
      const moduleKey = cleanString(req.body.moduleKey).toLowerCase();
      if (!['platform_plan', 'distributor'].includes(scopeType)) {
        return res.status(400).json({
          message: 'En Fase 1 scopeType debe ser platform_plan o distributor'
        });
      }
      if (!isValidObjectId(req.body.scopeId) || !getRegisteredModule(moduleKey)) {
        return res.status(400).json({ message: 'scopeId o moduleKey invalido' });
      }
      if (typeof req.body.enabled !== 'boolean') {
        return res.status(400).json({ message: 'enabled debe ser boolean' });
      }
      const scopeExists =
        scopeType === 'platform_plan'
          ? await PlatformPlan.exists({ _id: req.body.scopeId })
          : await Distributor.exists({ _id: req.body.scopeId });
      if (!scopeExists) return res.status(404).json({ message: 'Scope no encontrado' });

      const entitlement = await ModuleEntitlement.findOneAndUpdate(
        { scopeType, scopeId: req.body.scopeId, moduleKey },
        { enabled: req.body.enabled, limits: req.body.limits || {} },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      await recordActivity({
        user: req.user,
        type: 'module_entitlement_updated',
        distributorId: scopeType === 'distributor' ? req.body.scopeId : null,
        summary: `Modulo ${moduleKey} ${entitlement.enabled ? 'activado' : 'desactivado'}`,
        metadata: {
          entitlementId: entitlement._id,
          scopeType,
          scopeId: req.body.scopeId,
          moduleKey,
          enabled: entitlement.enabled
        }
      });
      res.json(entitlement);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/audit', requirePermission('audit:read_all'), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    res.json(
      await ActivityLog.find()
        .populate('companyId', 'name')
        .populate('distributorId', 'name')
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .limit(limit)
    );
  } catch (error) {
    next(error);
  }
});

router.get('/usage', requirePermission('platform:manage'), async (req, res, next) => {
  try {
    const filter = req.query.distributorId
      ? { scopeType: 'distributor', scopeId: req.query.distributorId }
      : { scopeType: 'distributor' };
    res.json(await UsageRecord.find(filter).sort({ periodEnd: -1 }).limit(500));
  } catch (error) {
    next(error);
  }
});

export default router;
