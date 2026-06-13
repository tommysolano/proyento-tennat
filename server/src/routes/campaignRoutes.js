import mongoose from 'mongoose';
import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { checkModuleAccess, requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Campaign, CAMPAIGN_STATUSES } from '../models/Campaign.js';
import { Company } from '../models/Company.js';
import { Form } from '../models/Form.js';
import { Funnel } from '../models/Funnel.js';
import { LandingPage } from '../models/LandingPage.js';
import { User } from '../models/User.js';
import { recordActivity } from '../utils/activity.js';
import { sanitize } from '../utils/sanitize.js';
import { cleanString, isValidObjectId } from '../utils/validation.js';
import {
  safePublicUrl,
  sanitizeMarketingValue,
  sanitizePlainText
} from '../modules/marketing/marketingSecurity.js';

const router = Router();
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

async function companyScope(req, requestedCompanyId = '') {
  if (req.user.role === 'ADMIN' || req.user.role === 'SUPERVISOR') {
    return req.user.companyId;
  }
  const companyId = cleanString(requestedCompanyId || req.query.companyId);
  if (!isValidObjectId(companyId)) throw badRequest('companyId es requerido');
  const filter = { _id: companyId };
  if (req.user.role === 'DISTRIBUTOR') filter.distributorId = req.user.distributorId;
  const company = await Company.findOne(filter).select('_id distributorId');
  if (!company) throw Object.assign(new Error('Empresa fuera del alcance'), { status: 403 });
  const access = await checkModuleAccess('forms', {
    role: 'ADMIN',
    companyId: company._id,
    distributorId: company.distributorId
  });
  if (!access.enabled) throw Object.assign(new Error(access.message), { status: 403 });
  return company._id;
}

function dateValue(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${field} debe ser una fecha valida`);
  return date;
}

async function referenceIds(Model, values, companyId, field) {
  if (values === undefined) return undefined;
  if (!Array.isArray(values)) throw badRequest(`${field} debe ser un arreglo`);
  const ids = [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
  if (ids.some((id) => !isValidObjectId(id))) throw badRequest(`${field} contiene IDs invalidos`);
  const count = await Model.countDocuments({ _id: { $in: ids }, companyId });
  if (count !== ids.length) throw badRequest(`${field} contiene recursos de otra empresa`);
  return ids;
}

async function campaignPayload(body, companyId) {
  const data = {};
  if ('name' in body) {
    data.name = sanitizePlainText(body.name, 160);
    if (!data.name) throw badRequest('name es requerido');
  }
  for (const field of ['description', 'channel', 'source']) {
    if (field in body) data[field] = sanitizePlainText(body[field], field === 'description' ? 3000 : 120);
  }
  if ('status' in body) {
    if (!CAMPAIGN_STATUSES.includes(body.status)) throw badRequest('status de campana invalido');
    data.status = body.status;
  }
  if ('startsAt' in body) data.startsAt = dateValue(body.startsAt, 'startsAt');
  if ('endsAt' in body) data.endsAt = dateValue(body.endsAt, 'endsAt');
  if (data.startsAt && data.endsAt && data.endsAt < data.startsAt) {
    throw badRequest('endsAt no puede ser anterior a startsAt');
  }
  if ('budget' in body) {
    const amount = Number(body.budget?.amount || 0);
    if (!Number.isFinite(amount) || amount < 0) throw badRequest('budget.amount invalido');
    data.budget = {
      amount,
      currency: cleanString(body.budget?.currency || 'USD').toUpperCase().slice(0, 3)
    };
  }
  if ('externalIds' in body) data.externalIds = sanitizeMarketingValue(body.externalIds || {});
  if ('referenceUrl' in body) data.referenceUrl = safePublicUrl(body.referenceUrl);
  if ('metadata' in body) data.metadata = sanitize(body.metadata || {});
  if ('assignedTo' in body) {
    if (body.assignedTo === null || cleanString(body.assignedTo) === '') data.assignedTo = null;
    else {
      if (!isValidObjectId(body.assignedTo)) throw badRequest('assignedTo invalido');
      const user = await User.exists({
        _id: body.assignedTo,
        companyId,
        status: 'active'
      });
      if (!user) throw badRequest('assignedTo no pertenece a la empresa');
      data.assignedTo = body.assignedTo;
    }
  }
  data.formIds = await referenceIds(Form, body.formIds, companyId, 'formIds');
  data.landingPageIds = await referenceIds(
    LandingPage,
    body.landingPageIds,
    companyId,
    'landingPageIds'
  );
  data.funnelIds = await referenceIds(Funnel, body.funnelIds, companyId, 'funnelIds');
  for (const key of ['formIds', 'landingPageIds', 'funnelIds']) {
    if (data[key] === undefined) delete data[key];
  }
  return data;
}

async function assertAssociationModules(companyId, distributorId, data) {
  const required = [];
  if (data.landingPageIds?.length) required.push('landing_pages');
  if (data.funnelIds?.length) required.push('funnels');
  for (const moduleKey of required) {
    const access = await checkModuleAccess(moduleKey, {
      role: 'ADMIN',
      companyId,
      distributorId
    });
    if (!access.enabled) throw Object.assign(new Error(access.message), { status: 403 });
  }
}

async function syncAssociations(campaign, previous = {}) {
  const specs = [
    [Form, 'formIds'],
    [LandingPage, 'landingPageIds'],
    [Funnel, 'funnelIds']
  ];
  for (const [Model, field] of specs) {
    const currentIds = (campaign[field] || []).map(String);
    const previousIds = (previous[field] || []).map(String);
    const removed = previousIds.filter((id) => !currentIds.includes(id));
    if (removed.length) {
      await Model.updateMany(
        {
          _id: { $in: removed },
          companyId: campaign.companyId,
          'attribution.campaignId': campaign._id
        },
        {
          $set: {
            'attribution.campaignId': null,
            'attribution.campaignName': ''
          }
        }
      );
    }
    if (currentIds.length) {
      await Campaign.updateMany(
        {
          _id: { $ne: campaign._id },
          companyId: campaign.companyId,
          [field]: { $in: currentIds }
        },
        { $pull: { [field]: { $in: currentIds } } }
      );
      await Model.updateMany(
        { _id: { $in: currentIds }, companyId: campaign.companyId },
        {
          $set: {
            'attribution.campaignId': campaign._id,
            'attribution.campaignName': campaign.name
          }
        }
      );
    }
  }
}

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN', 'DISTRIBUTOR', 'ADMIN', 'SUPERVISOR'));
router.use(requireModule('forms'));

router.get(
  '/',
  requireAnyPermission(
    'campaigns:manage',
    'campaigns:read',
    'campaigns:read_team',
    'campaigns:read_distributor',
    'campaigns:read_all'
  ),
  async (req, res, next) => {
    try {
      const companyId = await companyScope(req);
      const filter = { companyId };
      if (req.query.status) filter.status = req.query.status;
      if (req.query.channel) filter.channel = cleanString(req.query.channel);
      res.json(
        await Campaign.find(filter)
          .populate('assignedTo', 'name email role')
          .sort({ createdAt: -1 })
          .limit(500)
      );
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  roleMiddleware('SUPERADMIN', 'DISTRIBUTOR', 'ADMIN'),
  requireAnyPermission('campaigns:manage', 'campaigns:manage_distributor'),
  async (req, res, next) => {
    try {
      const companyId = await companyScope(req, req.body.companyId);
      const company = await Company.findById(companyId).select('distributorId');
      const data = await campaignPayload(req.body, companyId);
      if (!data.name) throw badRequest('name es requerido');
      await assertAssociationModules(companyId, company.distributorId, data);
      const campaign = await Campaign.create({
        ...data,
        companyId,
        distributorId: company.distributorId,
        createdBy: req.user._id,
        updatedBy: req.user._id
      });
      await syncAssociations(campaign);
      await recordActivity({
        user: req.user,
        type: 'campaign_created',
        summary: `Campana creada: ${campaign.name}`,
        companyId,
        distributorId: company.distributorId,
        metadata: { campaignId: campaign._id, companyId }
      });
      res.status(201).json(campaign);
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id',
  roleMiddleware('SUPERADMIN', 'DISTRIBUTOR', 'ADMIN'),
  requireAnyPermission('campaigns:manage', 'campaigns:manage_distributor'),
  async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) throw badRequest('id de campana invalido');
      const companyId = await companyScope(req, req.body.companyId);
      const campaign = await Campaign.findOne({ _id: req.params.id, companyId });
      if (!campaign) return res.status(404).json({ message: 'Campana no encontrada' });
      const previous = {
        formIds: campaign.formIds,
        landingPageIds: campaign.landingPageIds,
        funnelIds: campaign.funnelIds
      };
      const data = await campaignPayload(req.body, companyId);
      await assertAssociationModules(companyId, campaign.distributorId, data);
      Object.assign(campaign, data, {
        updatedBy: req.user._id
      });
      await campaign.save();
      await syncAssociations(campaign, previous);
      await recordActivity({
        user: req.user,
        type: 'campaign_updated',
        summary: `Campana actualizada: ${campaign.name}`,
        companyId: campaign.companyId,
        distributorId: campaign.distributorId,
        metadata: { campaignId: campaign._id, fields: Object.keys(req.body) }
      });
      res.json(campaign);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
