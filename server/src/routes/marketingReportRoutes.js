import { Router } from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Contact } from '../models/Contact.js';
import { ConversionEvent } from '../models/ConversionEvent.js';
import { IntegrationEvent } from '../models/IntegrationEvent.js';
import { Opportunity } from '../models/Opportunity.js';

const router = Router();

function grouped(Model, companyId, group, match = {}) {
  return Model.aggregate([
    { $match: { companyId, ...match } },
    { $group: { _id: group, total: { $sum: 1 } } },
    { $sort: { total: -1 } },
    { $limit: 100 }
  ]);
}

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN', 'ADMIN', 'SUPERVISOR'));
router.use(requireModule('forms'));
router.use(
  requireAnyPermission(
    'marketing_reports:read',
    'marketing_reports:read_team',
    'marketing_reports:read_all'
  )
);

router.get('/overview', async (req, res, next) => {
  try {
    const rawCompanyId = req.user.role === 'SUPERADMIN' && req.query.companyId
      ? req.query.companyId
      : req.user.companyId;
    if (!mongoose.isValidObjectId(rawCompanyId)) {
      return res.status(400).json({ message: 'companyId es requerido' });
    }
    const companyId = new mongoose.Types.ObjectId(rawCompanyId);
    const [
      contactsByCampaign,
      opportunitiesByCampaign,
      conversionsByLanding,
      conversionsByForm,
      conversionsByFunnel,
      productComparison,
      channels,
      sourceMedium,
      integrationErrors
    ] = await Promise.all([
      grouped(Contact, companyId, {
        campaignId: '$attribution.campaignId',
        campaignName: '$attribution.campaignName'
      }),
      grouped(Opportunity, companyId, {
        campaignId: '$attribution.campaignId',
        campaignName: '$attribution.campaignName'
      }),
      grouped(ConversionEvent, companyId, '$landingPageId', {
        type: { $ne: 'page_view' },
        landingPageId: { $ne: null }
      }),
      grouped(ConversionEvent, companyId, '$formId', {
        type: { $ne: 'page_view' },
        formId: { $ne: null }
      }),
      grouped(ConversionEvent, companyId, '$funnelId', {
        type: { $ne: 'page_view' },
        funnelId: { $ne: null }
      }),
      grouped(Contact, companyId, {
        consulted: '$attribution.consultedProduct',
        purchased: '$attribution.purchasedProduct'
      }, {
        $or: [
          { 'attribution.consultedProduct': { $ne: '' } },
          { 'attribution.purchasedProduct': { $ne: '' } }
        ]
      }),
      grouped(Contact, companyId, {
        $ifNull: ['$attribution.entryChannel', '$attribution.channel']
      }),
      grouped(Contact, companyId, {
        source: '$attribution.source',
        medium: '$attribution.medium'
      }),
      grouped(IntegrationEvent, companyId, '$integrationId', { status: 'failed' })
    ]);
    res.json({
      contactsByCampaign,
      opportunitiesByCampaign,
      conversionsByLanding,
      conversionsByForm,
      conversionsByFunnel,
      productComparison,
      channels,
      sourceMedium,
      integrationErrors
    });
  } catch (error) {
    next(error);
  }
});

export default router;
