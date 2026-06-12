import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import {
  Company,
  Contact,
  Invoice,
  Payment,
  PlatformSubscription,
  UsageRecord,
  User
} from '../models/index.js';
import { invoiceBalance } from '../utils/billing.js';

const router = Router();

async function addInvoiceBalances(invoices) {
  const invoiceIds = invoices.map((invoice) => invoice._id);
  if (!invoiceIds.length) return invoices;
  const totals = await Payment.aggregate([
    { $match: { invoiceId: { $in: invoiceIds }, status: 'succeeded' } },
    { $group: { _id: '$invoiceId', total: { $sum: '$amount' } } }
  ]);
  const totalByInvoice = new Map(totals.map((item) => [String(item._id), item.total]));
  return invoices.map((invoice) => ({
    ...invoice,
    ...invoiceBalance(invoice, totalByInvoice.get(String(invoice._id)) || 0)
  }));
}

router.use(authMiddleware);
router.use(roleMiddleware('DISTRIBUTOR'));
router.use(requirePermission('distributor_billing:read'));
router.use(requireModule('billing'));

router.get('/my-platform-subscription', async (req, res, next) => {
  try {
    const subscription = await PlatformSubscription.findOne({
      distributorId: req.user.distributorId
    })
      .sort({ createdAt: -1 })
      .populate(
        'platformPlanId',
        'name code description price currency billingCycle limits includedModules status'
      );
    res.json(subscription);
  } catch (error) {
    next(error);
  }
});

router.get('/my-platform-invoices', async (req, res, next) => {
  try {
    const invoices = await Invoice.find({
        issuerType: 'platform',
        customerType: 'distributor',
        customerId: req.user.distributorId
      })
        .sort({ createdAt: -1 })
        .limit(250)
        .lean();
    res.json(await addInvoiceBalances(invoices));
  } catch (error) {
    next(error);
  }
});

router.get('/my-platform-payments', async (req, res, next) => {
  try {
    res.json(
      await Payment.find({
        payerType: 'distributor',
        payerId: req.user.distributorId
      })
        .populate('invoiceId', 'number total status')
        .sort({ createdAt: -1 })
        .limit(250)
    );
  } catch (error) {
    next(error);
  }
});

router.get('/my-usage', async (req, res, next) => {
  try {
    const companyIds = await Company.find({ distributorId: req.user.distributorId }).distinct('_id');
    const [users, contacts, records] = await Promise.all([
      User.countDocuments({ distributorId: req.user.distributorId }),
      Contact.countDocuments({ companyId: { $in: companyIds } }),
      UsageRecord.find({
        scopeType: 'distributor',
        scopeId: req.user.distributorId
      })
        .sort({ periodEnd: -1 })
        .limit(250)
    ]);
    res.json({
      current: {
        companies: companyIds.length,
        users,
        contacts
      },
      records
    });
  } catch (error) {
    next(error);
  }
});

export default router;
