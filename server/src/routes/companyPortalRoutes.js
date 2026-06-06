import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Company, Invoice, Payment } from '../models/index.js';
import { recordActivity } from '../utils/activity.js';
import { refreshCompanyOnboarding } from '../utils/onboarding.js';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN'));

router.get(
  '/billing/invoices',
  requirePermission('company_billing:read'),
  requireModule('billing'),
  async (req, res, next) => {
    try {
      const invoices = await Invoice.find({
        issuerType: 'distributor',
        customerType: 'company',
        customerId: req.user.companyId
      })
        .sort({ createdAt: -1 })
        .limit(250)
        .lean();
      const invoiceIds = invoices.map((invoice) => invoice._id);
      const payments = await Payment.find({
        invoiceId: { $in: invoiceIds },
        payerType: 'company',
        payerId: req.user.companyId
      })
        .sort({ createdAt: -1 })
        .lean();
      const paymentsByInvoice = new Map();
      payments.forEach((payment) => {
        const key = payment.invoiceId.toString();
        const current = paymentsByInvoice.get(key) || [];
        current.push(payment);
        paymentsByInvoice.set(key, current);
      });
      res.json(
        invoices.map((invoice) => ({
          ...invoice,
          payments: paymentsByInvoice.get(invoice._id.toString()) || []
        }))
      );
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/billing/payments',
  requirePermission('company_billing:read'),
  requireModule('billing'),
  async (req, res, next) => {
    try {
      res.json(
        await Payment.find({
          payerType: 'company',
          payerId: req.user.companyId
        })
          .populate('invoiceId', 'number total status dueDate')
          .sort({ createdAt: -1 })
          .limit(250)
      );
    } catch (error) {
      next(error);
    }
  }
);

router.get('/settings', requirePermission('company_settings:read'), async (req, res, next) => {
  try {
    const company = await Company.findById(req.user.companyId)
      .select('name taxId industry status settings onboarding distributorId')
      .populate('distributorId', 'name branding');
    res.json(company);
  } catch (error) {
    next(error);
  }
});

router.get('/onboarding', requirePermission('company_onboarding:update'), async (req, res, next) => {
  try {
    res.json(await refreshCompanyOnboarding(req.user.companyId));
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/onboarding',
  requirePermission('company_onboarding:update'),
  async (req, res, next) => {
    try {
      const company = await Company.findById(req.user.companyId);
      if (!company) return res.status(404).json({ message: 'Empresa no encontrada' });
      if (typeof req.body.profile !== 'boolean') {
        return res.status(400).json({ message: 'profile debe ser boolean' });
      }
      company.onboarding.steps.profile = req.body.profile;
      await company.save();
      const onboarding = await refreshCompanyOnboarding(company._id);
      await recordActivity({
        user: req.user,
        type: 'onboarding_updated',
        companyId: company._id,
        summary: 'Onboarding de empresa actualizado',
        metadata: { profile: req.body.profile }
      });
      res.json(onboarding);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
