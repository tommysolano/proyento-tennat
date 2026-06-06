import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import {
  Company,
  Contact,
  Distributor,
  Invoice,
  Payment,
  Plan,
  Subscription,
  User
} from '../models/index.js';
import { recordActivity } from '../utils/activity.js';
import {
  refreshCompanyOnboarding,
  refreshDistributorOnboarding
} from '../utils/onboarding.js';
import { cleanString, isValidObjectId } from '../utils/validation.js';

const router = Router();
const INVOICE_STATUSES = ['draft', 'open', 'paid', 'overdue', 'void', 'uncollectible'];
const PAYMENT_STATUSES = ['pending', 'succeeded', 'failed', 'refunded'];
const SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'cancelled', 'suspended'];
const CURRENT_SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'suspended'];
const DOMAIN_PATTERN = /^(?=.{3,253}$)(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function numberValue(value, field, { min = 0, integer = false } = {}) {
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error(`${field} debe ser una fecha valida`), { status: 400 });
  }
  return date;
}

async function ownedCompany(distributorId, companyId) {
  if (!isValidObjectId(companyId)) {
    throw Object.assign(new Error('companyId invalido'), { status: 400 });
  }
  const company = await Company.findOne({ _id: companyId, distributorId });
  if (!company) {
    throw Object.assign(new Error('Empresa no encontrada para este distribuidor'), {
      status: 404
    });
  }
  return company;
}

async function ownedPlan(distributorId, planId) {
  if (!isValidObjectId(planId)) {
    throw Object.assign(new Error('planId invalido'), { status: 400 });
  }
  const plan = await Plan.findOne({ _id: planId, distributorId });
  if (!plan) {
    throw Object.assign(new Error('Plan no encontrado para este distribuidor'), {
      status: 404
    });
  }
  return plan;
}

function parseLineItems(lineItems) {
  if (!Array.isArray(lineItems) || !lineItems.length) {
    throw Object.assign(new Error('lineItems debe contener al menos un item'), { status: 400 });
  }

  return lineItems.map((item, index) => {
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
}

async function nextInvoiceNumber(distributorId) {
  await Distributor.updateOne(
    { _id: distributorId, 'billingSettings.invoiceNextNumber': { $exists: false } },
    {
      $set: {
        'billingSettings.invoiceNextNumber': 1,
        'billingSettings.invoicePrefix': 'FAC'
      }
    }
  );
  const distributor = await Distributor.findOneAndUpdate(
    { _id: distributorId },
    { $inc: { 'billingSettings.invoiceNextNumber': 1 } },
    { new: true }
  ).select('billingSettings');
  const sequence = Math.max((distributor.billingSettings?.invoiceNextNumber || 2) - 1, 1);
  const prefix = cleanString(distributor.billingSettings?.invoicePrefix).toUpperCase() || 'FAC';
  return `${prefix}-${String(sequence).padStart(6, '0')}`;
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
    if (field in body) data[field] = dateValue(body[field], field);
  }
  if ('cancelAtPeriodEnd' in body) data.cancelAtPeriodEnd = Boolean(body.cancelAtPeriodEnd);
  if ('metadata' in body) data.metadata = body.metadata || {};
  return data;
}

router.use(authMiddleware);
router.use(roleMiddleware('DISTRIBUTOR'));

router.get(
  '/billing/overview',
  requirePermission('distributor_billing:manage'),
  requireModule('billing'),
  async (req, res, next) => {
    try {
      const distributorId = req.user.distributorId;
      const companyIds = await Company.find({ distributorId }).distinct('_id');
      const [
        activeCompanies,
        suspendedCompanies,
        activeSubscriptions,
        pastDueSubscriptions,
        pendingInvoices,
        paidInvoices,
        subscriptions,
        recentPayments,
        popularPlans
      ] = await Promise.all([
        Company.countDocuments({ distributorId, status: { $in: ['active', 'trial'] } }),
        Company.countDocuments({ distributorId, status: 'suspended' }),
        Subscription.countDocuments({ distributorId, status: { $in: ['active', 'trial'] } }),
        Subscription.countDocuments({ distributorId, status: 'past_due' }),
        Invoice.countDocuments({
          issuerType: 'distributor',
          issuerId: distributorId,
          status: { $in: ['open', 'overdue'] }
        }),
        Invoice.countDocuments({
          issuerType: 'distributor',
          issuerId: distributorId,
          status: 'paid'
        }),
        Subscription.find({ distributorId, status: { $in: ['active', 'trial'] } })
          .populate('planId', 'price billingCycle')
          .lean(),
        Payment.find({
          payerType: 'company',
          payerId: { $in: companyIds }
        })
          .populate('invoiceId', 'number status')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
        Subscription.aggregate([
          { $match: { distributorId, status: { $in: ['active', 'trial', 'past_due'] } } },
          { $group: { _id: '$planId', subscriptions: { $sum: 1 } } },
          { $sort: { subscriptions: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: 'plans',
              localField: '_id',
              foreignField: '_id',
              as: 'plan'
            }
          },
          { $unwind: '$plan' },
          { $project: { _id: 0, planId: '$_id', name: '$plan.name', subscriptions: 1 } }
        ])
      ]);

      const expectedMonthlyRevenue = subscriptions.reduce((sum, subscription) => {
        const price = subscription.planId?.price || 0;
        return sum + (subscription.planId?.billingCycle === 'yearly' ? price / 12 : price);
      }, 0);

      res.json({
        expectedMonthlyRevenue: Math.round(expectedMonthlyRevenue * 100) / 100,
        activeCompanies,
        suspendedCompanies,
        activeSubscriptions,
        pastDueSubscriptions,
        pendingInvoices,
        paidInvoices,
        recentPayments,
        popularPlans
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/companies', requirePermission('companies:manage'), async (req, res, next) => {
  try {
    const distributorId = req.user.distributorId;
    const companies = await Company.find({ distributorId })
      .populate('adminId', 'name email status')
      .sort({ createdAt: -1 })
      .lean();
    const companyIds = companies.map((company) => company._id);
    const [subscriptions, pendingInvoices, payments] = await Promise.all([
      Subscription.find({
        distributorId,
        companyId: { $in: companyIds },
        status: { $in: CURRENT_SUBSCRIPTION_STATUSES }
      })
        .sort({ createdAt: -1 })
        .populate('planId', 'name code price currency billingCycle')
        .lean(),
      Invoice.aggregate([
        {
          $match: {
            issuerType: 'distributor',
            issuerId: distributorId,
            customerId: { $in: companyIds },
            status: { $in: ['open', 'overdue'] }
          }
        },
        { $group: { _id: '$customerId', count: { $sum: 1 }, total: { $sum: '$total' } } }
      ]),
      Payment.find({ payerType: 'company', payerId: { $in: companyIds }, status: 'succeeded' })
        .sort({ paidAt: -1, createdAt: -1 })
        .lean()
    ]);

    const subscriptionByCompany = new Map();
    subscriptions.forEach((subscription) => {
      const key = subscription.companyId.toString();
      if (!subscriptionByCompany.has(key)) subscriptionByCompany.set(key, subscription);
    });
    const pendingByCompany = new Map(
      pendingInvoices.map((item) => [item._id.toString(), item])
    );
    const paymentByCompany = new Map();
    payments.forEach((payment) => {
      const key = payment.payerId.toString();
      if (!paymentByCompany.has(key)) paymentByCompany.set(key, payment);
    });

    res.json(
      companies.map((company) => ({
        ...company,
        subscription: subscriptionByCompany.get(company._id.toString()) || null,
        pendingInvoices: pendingByCompany.get(company._id.toString()) || {
          count: 0,
          total: 0
        },
        lastPayment: paymentByCompany.get(company._id.toString()) || null
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.get(
  '/companies/:id/detail',
  requirePermission('companies:manage'),
  async (req, res, next) => {
    try {
      const company = await ownedCompany(req.user.distributorId, req.params.id);
      await refreshCompanyOnboarding(company._id);
      const [users, subscription, invoices, contactsTotal] = await Promise.all([
        User.find({ companyId: company._id }).select('name email role status supervisorId').lean(),
        Subscription.findOne({
          companyId: company._id,
          distributorId: req.user.distributorId
        })
          .sort({ createdAt: -1 })
          .populate(
            'planId',
            'name code price currency billingCycle limits includedModules features status'
          )
          .lean(),
        Invoice.find({
          issuerType: 'distributor',
          issuerId: req.user.distributorId,
          customerType: 'company',
          customerId: company._id
        })
          .sort({ createdAt: -1 })
          .lean(),
        Contact.countDocuments({ companyId: company._id })
      ]);
      const invoiceIds = invoices.map((invoice) => invoice._id);
      const payments = await Payment.find({
        invoiceId: { $in: invoiceIds },
        payerType: 'company',
        payerId: company._id
      })
        .populate('invoiceId', 'number total status')
        .sort({ createdAt: -1 })
        .lean();
      res.json({
        company: await Company.findById(company._id).lean(),
        users,
        subscription,
        invoices,
        payments,
        contactsTotal,
        activeModules: subscription?.planId?.includedModules || []
      });
    } catch (error) {
      next(error);
    }
  }
);

async function setCompanyStatus(req, res, next, status) {
  try {
    const company = await ownedCompany(req.user.distributorId, req.params.id);
    const previousStatus = company.status;
    company.status = status;
    await company.save();
    await recordActivity({
      user: req.user,
      type: status === 'suspended' ? 'company_suspended' : 'company_reactivated',
      companyId: company._id,
      summary: `Empresa ${status === 'suspended' ? 'suspendida' : 'reactivada'}: ${company.name}`,
      metadata: { previousStatus, status }
    });
    res.json(company);
  } catch (error) {
    next(error);
  }
}

router.post(
  '/companies/:id/suspend',
  requirePermission('companies:suspend'),
  (req, res, next) => setCompanyStatus(req, res, next, 'suspended')
);
router.post(
  '/companies/:id/reactivate',
  requirePermission('companies:suspend'),
  (req, res, next) => setCompanyStatus(req, res, next, 'active')
);

router.put(
  '/companies/:id/subscription',
  requirePermission('company_subscriptions:manage'),
  async (req, res, next) => {
    try {
      const distributorId = req.user.distributorId;
      const [company, plan] = await Promise.all([
        ownedCompany(distributorId, req.params.id),
        ownedPlan(distributorId, req.body.planId)
      ]);
      const status = req.body.status || 'active';
      if (!SUBSCRIPTION_STATUSES.includes(status)) {
        return res.status(400).json({ message: 'status de suscripcion invalido' });
      }

      let subscription = await Subscription.findOne({
        companyId: company._id,
        distributorId,
        status: { $in: CURRENT_SUBSCRIPTION_STATUSES }
      }).sort({ createdAt: -1 });
      const activityType = subscription ? 'subscription_updated' : 'subscription_created';

      if (subscription) {
        subscription.planId = plan._id;
        subscription.status = status;
        Object.assign(subscription, subscriptionDates(req.body));
        await subscription.save();
      } else {
        subscription = await Subscription.create({
          companyId: company._id,
          planId: plan._id,
          distributorId,
          status,
          paymentProvider: 'manual',
          ...subscriptionDates(req.body)
        });
      }

      await recordActivity({
        user: req.user,
        type: activityType,
        companyId: company._id,
        summary: `Suscripcion ${
          activityType === 'subscription_created' ? 'creada' : 'actualizada'
        } para ${company.name}`,
        metadata: {
          subscriptionId: subscription._id,
          planId: plan._id,
          status: subscription.status
        }
      });
      await refreshDistributorOnboarding(distributorId);
      await subscription.populate('planId', 'name code price currency billingCycle status');
      res.json(subscription);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/invoices',
  requirePermission('company_invoices:manage'),
  requireModule('billing'),
  async (req, res, next) => {
    try {
      const filter = {
        issuerType: 'distributor',
        issuerId: req.user.distributorId,
        customerType: 'company'
      };
      if (req.query.status) {
        if (!INVOICE_STATUSES.includes(req.query.status)) {
          return res.status(400).json({ message: 'Filtro de status invalido' });
        }
        filter.status = req.query.status;
      }
      if (req.query.companyId) {
        await ownedCompany(req.user.distributorId, req.query.companyId);
        filter.customerId = req.query.companyId;
      }
      res.json(await Invoice.find(filter).sort({ createdAt: -1 }).limit(500));
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/invoices',
  requirePermission('company_invoices:manage'),
  requireModule('billing'),
  async (req, res, next) => {
    try {
      const distributorId = req.user.distributorId;
      const company = await ownedCompany(distributorId, req.body.companyId);
      let subscriptionId = null;
      if (req.body.subscriptionId) {
        const subscription = await Subscription.findOne({
          _id: req.body.subscriptionId,
          companyId: company._id,
          distributorId
        });
        if (!subscription) {
          return res.status(400).json({ message: 'La suscripcion no pertenece a la empresa' });
        }
        subscriptionId = subscription._id;
      }

      const distributor = await Distributor.findById(distributorId).select('billingSettings');
      const lineItems = parseLineItems(req.body.lineItems);
      const subtotal =
        Math.round(lineItems.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
      const taxRate =
        'taxRate' in req.body
          ? numberValue(req.body.taxRate, 'taxRate')
          : distributor.billingSettings?.taxRate || 0;
      const tax = Math.round(subtotal * (taxRate / 100) * 100) / 100;
      const total = Math.round((subtotal + tax) * 100) / 100;
      const status = req.body.status || 'open';
      if (!['draft', 'open'].includes(status)) {
        return res.status(400).json({ message: 'Una factura nueva debe ser draft u open' });
      }

      const invoice = await Invoice.create({
        issuerType: 'distributor',
        issuerId: distributorId,
        customerType: 'company',
        customerId: company._id,
        subscriptionType: 'company',
        subscriptionId,
        number: await nextInvoiceNumber(distributorId),
        currency:
          cleanString(req.body.currency).toUpperCase() ||
          distributor.billingSettings?.currency ||
          'USD',
        subtotal,
        tax,
        total,
        status,
        dueDate: dateValue(req.body.dueDate, 'dueDate', { nullable: false }),
        lineItems,
        metadata: { ...(req.body.metadata || {}), taxRate }
      });
      await recordActivity({
        user: req.user,
        type: 'company_invoice_created',
        companyId: company._id,
        summary: `Factura ${invoice.number} creada para ${company.name}`,
        metadata: { invoiceId: invoice._id, total, currency: invoice.currency }
      });
      res.status(201).json(invoice);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/invoices/:id',
  requirePermission('company_invoices:manage'),
  requireModule('billing'),
  async (req, res, next) => {
    try {
      const invoice = await Invoice.findOne({
        _id: req.params.id,
        issuerType: 'distributor',
        issuerId: req.user.distributorId,
        customerType: 'company'
      });
      if (!invoice) return res.status(404).json({ message: 'Factura no encontrada' });
      const payments = await Payment.find({
        invoiceId: invoice._id,
        payerType: 'company',
        payerId: invoice.customerId
      }).sort({ createdAt: -1 });
      res.json({ invoice, payments });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/invoices/:id',
  requirePermission('company_invoices:manage'),
  requireModule('billing'),
  async (req, res, next) => {
    try {
      const invoice = await Invoice.findOne({
        _id: req.params.id,
        issuerType: 'distributor',
        issuerId: req.user.distributorId,
        customerType: 'company'
      });
      if (!invoice) return res.status(404).json({ message: 'Factura no encontrada' });
      if ('status' in req.body) {
        if (!['draft', 'open', 'overdue', 'void', 'uncollectible'].includes(req.body.status)) {
          return res.status(400).json({ message: 'Cambio de status de factura invalido' });
        }
        invoice.status = req.body.status;
      }
      if ('dueDate' in req.body) {
        invoice.dueDate = dateValue(req.body.dueDate, 'dueDate', { nullable: false });
      }
      if ('metadata' in req.body) invoice.metadata = req.body.metadata || {};
      await invoice.save();
      await recordActivity({
        user: req.user,
        type: 'company_invoice_updated',
        companyId: invoice.customerId,
        summary: `Factura ${invoice.number} actualizada`,
        metadata: { invoiceId: invoice._id, status: invoice.status }
      });
      res.json(invoice);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/payments',
  requirePermission('company_payments:manage'),
  requireModule('billing'),
  async (req, res, next) => {
    try {
      const companyIds = await Company.find({
        distributorId: req.user.distributorId
      }).distinct('_id');
      const filter = { payerType: 'company', payerId: { $in: companyIds } };
      if (req.query.companyId) {
        await ownedCompany(req.user.distributorId, req.query.companyId);
        filter.payerId = req.query.companyId;
      }
      if (req.query.status) {
        if (!PAYMENT_STATUSES.includes(req.query.status)) {
          return res.status(400).json({ message: 'Filtro de status invalido' });
        }
        filter.status = req.query.status;
      }
      res.json(
        await Payment.find(filter)
          .populate('invoiceId', 'number total status customerId')
          .sort({ createdAt: -1 })
          .limit(500)
      );
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/payments',
  requirePermission('company_payments:manage'),
  requireModule('billing'),
  async (req, res, next) => {
    try {
      if (!isValidObjectId(req.body.invoiceId)) {
        return res.status(400).json({ message: 'invoiceId valido es requerido' });
      }
      const invoice = await Invoice.findOne({
        _id: req.body.invoiceId,
        issuerType: 'distributor',
        issuerId: req.user.distributorId,
        customerType: 'company'
      });
      if (!invoice) return res.status(404).json({ message: 'Factura no encontrada' });
      await ownedCompany(req.user.distributorId, invoice.customerId);
      const status = req.body.status || 'succeeded';
      if (!PAYMENT_STATUSES.includes(status)) {
        return res.status(400).json({ message: 'status de pago invalido' });
      }
      const currency = cleanString(req.body.currency).toUpperCase() || invoice.currency;
      if (currency !== invoice.currency) {
        return res.status(400).json({
          message: 'La moneda del pago debe coincidir con la moneda de la factura'
        });
      }
      const payment = await Payment.create({
        invoiceId: invoice._id,
        payerType: 'company',
        payerId: invoice.customerId,
        amount: numberValue(req.body.amount, 'amount', { min: 0.01 }),
        currency,
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
        const totals = await Payment.aggregate([
          { $match: { invoiceId: invoice._id, status: 'succeeded' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        if ((totals[0]?.total || 0) >= invoice.total) {
          invoice.status = 'paid';
          invoice.paidAt = payment.paidAt;
          await invoice.save();
        }
      }

      await recordActivity({
        user: req.user,
        type: 'company_payment_recorded',
        companyId: invoice.customerId,
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
  }
);

router.get(
  '/payments/:id',
  requirePermission('company_payments:manage'),
  requireModule('billing'),
  async (req, res, next) => {
    try {
      const companyIds = await Company.find({
        distributorId: req.user.distributorId
      }).distinct('_id');
      const payment = await Payment.findOne({
        _id: req.params.id,
        payerType: 'company',
        payerId: { $in: companyIds }
      }).populate('invoiceId', 'number total status customerId');
      if (!payment) return res.status(404).json({ message: 'Pago no encontrado' });
      res.json(payment);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/settings', requirePermission('distributor_settings:manage'), async (req, res, next) => {
  try {
    const distributor = await Distributor.findById(req.user.distributorId).select(
      'name ownerName email phone region status branding customDomain settings billingSettings onboarding'
    );
    res.json(distributor);
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/settings',
  requirePermission('distributor_settings:manage'),
  async (req, res, next) => {
    try {
      const distributor = await Distributor.findById(req.user.distributorId);
      if (!distributor) return res.status(404).json({ message: 'Distribuidor no encontrado' });

      for (const field of ['name', 'ownerName', 'phone', 'region']) {
        if (field in req.body) distributor[field] = cleanString(req.body[field]);
      }
      const settings = req.body.settings || {};
      for (const field of [
        'defaultCurrency',
        'defaultLocale',
        'defaultTimezone',
        'termsUrl',
        'privacyUrl'
      ]) {
        if (field in settings) distributor.settings[field] = cleanString(settings[field]);
      }
      const billing = req.body.billingSettings || {};
      for (const field of ['currency', 'invoicePrefix', 'paymentInstructions', 'termsAndConditions']) {
        if (field in billing) distributor.billingSettings[field] = cleanString(billing[field]);
      }
      if ('taxRate' in billing) {
        distributor.billingSettings.taxRate = numberValue(billing.taxRate, 'taxRate');
      }
      if ('gracePeriodDays' in billing) {
        distributor.billingSettings.gracePeriodDays = numberValue(
          billing.gracePeriodDays,
          'gracePeriodDays',
          { integer: true }
        );
      }
      await distributor.save();
      await refreshDistributorOnboarding(distributor._id);
      await recordActivity({
        user: req.user,
        type: 'distributor_settings_updated',
        summary: 'Configuracion comercial del distribuidor actualizada',
        metadata: { distributorId: distributor._id }
      });
      res.json(distributor);
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/branding',
  requirePermission('distributor_branding:manage'),
  async (req, res, next) => {
    try {
      const distributor = await Distributor.findById(req.user.distributorId);
      if (!distributor) return res.status(404).json({ message: 'Distribuidor no encontrado' });
      const branding = req.body.branding || {};
      for (const field of [
        'logoUrl',
        'faviconUrl',
        'loginBackgroundUrl',
        'companyName',
        'supportEmail',
        'supportPhone'
      ]) {
        if (field in branding) distributor.branding[field] = cleanString(branding[field]);
      }
      for (const field of ['primaryColor', 'secondaryColor', 'accentColor']) {
        if (field in branding) {
          const color = cleanString(branding[field]);
          if (!COLOR_PATTERN.test(color)) {
            return res.status(400).json({ message: `${field} debe ser un color hexadecimal` });
          }
          distributor.branding[field] = color;
        }
      }

      if ('domain' in (req.body.customDomain || {})) {
        const domain = cleanString(req.body.customDomain.domain).toLowerCase();
        if (domain && !DOMAIN_PATTERN.test(domain)) {
          return res.status(400).json({ message: 'Dominio personalizado invalido' });
        }
        if (!domain) {
          distributor.customDomain = {
            domain: '',
            status: 'not_configured',
            verificationToken: '',
            verifiedAt: null
          };
        } else if (domain !== distributor.customDomain?.domain) {
          const domainOwner = await Distributor.exists({
            _id: { $ne: distributor._id },
            'customDomain.domain': domain
          });
          if (domainOwner) {
            return res.status(409).json({
              message: 'El dominio personalizado ya esta registrado'
            });
          }
          distributor.customDomain = {
            domain,
            status: 'pending_verification',
            verificationToken: randomBytes(18).toString('hex'),
            verifiedAt: null
          };
        }
      }

      await distributor.save();
      await refreshDistributorOnboarding(distributor._id);
      await recordActivity({
        user: req.user,
        type: 'distributor_branding_updated',
        summary: 'Branding del distribuidor actualizado',
        metadata: {
          distributorId: distributor._id,
          customDomainStatus: distributor.customDomain?.status
        }
      });
      res.json(distributor);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/onboarding', async (req, res, next) => {
  try {
    const onboarding = await refreshDistributorOnboarding(req.user.distributorId);
    res.json(onboarding);
  } catch (error) {
    next(error);
  }
});

export default router;
