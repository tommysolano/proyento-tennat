import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { checkModuleAccess, requireModule } from '../middleware/moduleMiddleware.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Campaign } from '../models/Campaign.js';
import { Company } from '../models/Company.js';
import {
  Integration,
  INTEGRATION_PROVIDERS,
  INTEGRATION_STATUSES
} from '../models/Integration.js';
import { IntegrationEvent } from '../models/IntegrationEvent.js';
import { Form } from '../models/Form.js';
import { Pipeline } from '../models/Pipeline.js';
import { PipelineStage } from '../models/PipelineStage.js';
import { User } from '../models/User.js';
import { IntegrationService } from '../modules/integrations/IntegrationService.js';
import { sanitize } from '../utils/sanitize.js';
import { cleanString, isValidObjectId, normalizeOptionalObjectId } from '../utils/validation.js';
import { sanitizePlainText } from '../modules/marketing/marketingSecurity.js';
import { recordActivity } from '../utils/activity.js';

const router = Router();
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

function safeCredentials(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw badRequest('credentials debe ser un objeto');
  }
  const entries = Object.entries(input);
  if (entries.length > 20) throw badRequest('credentials admite maximo 20 campos');
  const result = {};
  for (const [key, value] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) {
      throw badRequest('credentials contiene una key invalida');
    }
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'object') throw badRequest('credentials solo admite valores simples');
    result[key] = String(value).slice(0, 5000);
  }
  return result;
}

async function targetCompany(req, requested = '') {
  if (req.user.role === 'ADMIN' || req.user.role === 'SUPERVISOR') {
    return Company.findById(req.user.companyId).select('_id distributorId');
  }
  const companyId = cleanString(requested || req.query.companyId);
  if (!isValidObjectId(companyId)) throw badRequest('companyId es requerido');
  const filter = { _id: companyId };
  if (req.user.role === 'DISTRIBUTOR') filter.distributorId = req.user.distributorId;
  const company = await Company.findOne(filter).select('_id distributorId');
  if (!company) throw Object.assign(new Error('Empresa fuera del alcance'), { status: 403 });
  return company;
}

async function assertCompanyModule(company) {
  const access = await checkModuleAccess('integrations', {
    role: 'ADMIN',
    companyId: company._id,
    distributorId: company.distributorId
  });
  if (!access.enabled) throw Object.assign(new Error(access.message), { status: 403 });
}

async function assertRelatedModules(company, settings = {}) {
  const required = new Set();
  if (settings.createContact || settings.updateExistingContact) {
    required.add('crm');
    required.add('contacts');
  }
  if (settings.createOpportunity) {
    required.add('crm');
    required.add('contacts');
    required.add('opportunities');
  }
  if (settings.formId || settings.campaignId) required.add('forms');
  for (const moduleKey of required) {
    const access = await checkModuleAccess(moduleKey, {
      role: 'ADMIN',
      companyId: company._id,
      distributorId: company.distributorId
    });
    if (!access.enabled) throw Object.assign(new Error(access.message), { status: 403 });
  }
}

async function optionalReference(Model, id, companyId, field, extra = {}) {
  const normalized = normalizeOptionalObjectId(id);
  if (normalized === undefined) return undefined;
  if (normalized === null) return null;
  if (!isValidObjectId(normalized)) throw badRequest(`${field} invalido`);
  const item = await Model.findOne({ _id: normalized, companyId, ...extra }).select('_id');
  if (!item) throw badRequest(`${field} no pertenece a la empresa`);
  return item._id;
}

async function integrationPayload(body, companyId) {
  const data = {};
  if ('name' in body) {
    data.name = sanitizePlainText(body.name, 160);
    if (!data.name) throw badRequest('name es requerido');
  }
  if ('provider' in body) {
    if (!INTEGRATION_PROVIDERS.includes(body.provider)) throw badRequest('provider invalido');
    data.provider = body.provider;
  }
  if ('status' in body) {
    if (!INTEGRATION_STATUSES.includes(body.status)) throw badRequest('status invalido');
    data.status = body.status;
  }
  if ('description' in body) data.description = sanitizePlainText(body.description, 3000);
  if ('metadata' in body) data.metadata = sanitize(body.metadata || {});
  if ('mappings' in body) data.mappings = IntegrationService.validateMappings(body.mappings);
  if ('notifyUsers' in body) {
    if (!Array.isArray(body.notifyUsers)) throw badRequest('notifyUsers debe ser un arreglo');
    const ids = [...new Set(body.notifyUsers.map((id) => cleanString(String(id))).filter(Boolean))];
    if (ids.some((id) => !isValidObjectId(id))) throw badRequest('notifyUsers contiene IDs invalidos');
    const count = await User.countDocuments({ _id: { $in: ids }, companyId, status: 'active' });
    if (count !== ids.length) throw badRequest('notifyUsers contiene usuarios de otra empresa');
    data.notifyUsers = ids;
  }
  if ('settings' in body) {
    const settings = body.settings || {};
    data.settings = {
      createContact: settings.createContact !== false,
      updateExistingContact: settings.updateExistingContact !== false,
      createOpportunity: Boolean(settings.createOpportunity),
      campaignId: await optionalReference(Campaign, settings.campaignId, companyId, 'campaignId'),
      formId: await optionalReference(Form, settings.formId, companyId, 'formId'),
      pipelineId: await optionalReference(Pipeline, settings.pipelineId, companyId, 'pipelineId', { status: 'active' }),
      stageId: await optionalReference(PipelineStage, settings.stageId, companyId, 'stageId', { status: 'active' })
    };
    if (data.settings.createOpportunity) {
      if (!data.settings.pipelineId || !data.settings.stageId) {
        throw badRequest('pipelineId y stageId son requeridos para crear oportunidades');
      }
      const stage = await PipelineStage.exists({
        _id: data.settings.stageId,
        companyId,
        pipelineId: data.settings.pipelineId,
        status: 'active'
      });
      if (!stage) throw badRequest('stageId no pertenece al pipeline');
    }
  }
  return data;
}

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN', 'DISTRIBUTOR', 'ADMIN', 'SUPERVISOR'));
router.use(requireModule('integrations'));

router.get(
  '/',
  requireAnyPermission(
    'integrations:manage',
    'integrations:read',
    'integrations:read_team',
    'integrations:read_distributor',
    'integrations:read_all'
  ),
  async (req, res, next) => {
    try {
      const company = await targetCompany(req);
      await assertCompanyModule(company);
      const integrations = await Integration.find({ companyId: company._id })
        .select('+credentials +webhookSecret')
        .populate('notifyUsers', 'name email role')
        .sort({ createdAt: -1 });
      res.json(integrations.map((integration) => integration.toSafeObject()));
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  roleMiddleware('SUPERADMIN', 'DISTRIBUTOR', 'ADMIN'),
  requireAnyPermission('integrations:manage', 'integrations:manage_distributor'),
  async (req, res, next) => {
    try {
      const company = await targetCompany(req, req.body.companyId);
      await assertCompanyModule(company);
      const suppliedSecret = cleanString(req.body.webhookSecret);
      const generatedSecret = suppliedSecret || randomBytes(32).toString('hex');
      const data = await integrationPayload(req.body, company._id);
      if (!data.name) throw badRequest('name es requerido');
      if (!data.provider) throw badRequest('provider es requerido');
      await assertRelatedModules(company, data.settings);
      const integration = new Integration({
        ...data,
        companyId: company._id,
        distributorId: company.distributorId,
        status: req.body.status || 'active',
        createdBy: req.user._id,
        updatedBy: req.user._id
      });
      integration.setSecrets({
        webhookSecret: generatedSecret,
        credentials: safeCredentials(req.body.credentials || {})
      });
      await integration.save();
      await recordActivity({
        user: req.user,
        type: 'integration_created',
        summary: `Integracion creada: ${integration.name}`,
        companyId: integration.companyId,
        distributorId: integration.distributorId,
        metadata: { integrationId: integration._id, provider: integration.provider }
      });
      res.status(201).json({
        ...integration.toSafeObject(),
        ...(suppliedSecret ? {} : { setupSecret: generatedSecret })
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id/events',
  requireAnyPermission(
    'integrations:events',
    'integrations:read_team',
    'integrations:read_distributor',
    'integrations:read_all'
  ),
  async (req, res, next) => {
    try {
      if (!isValidObjectId(req.params.id)) throw badRequest('id de integracion invalido');
      const company = await targetCompany(req);
      const integration = await Integration.findOne({
        _id: req.params.id,
        companyId: company._id
      });
      if (!integration) return res.status(404).json({ message: 'Integracion no encontrada' });
      res.json(
        await IntegrationEvent.find({
          integrationId: integration._id,
          companyId: company._id
        })
          .populate('contactId', 'name email phone')
          .populate('opportunityId', 'title status value')
          .sort({ createdAt: -1 })
          .limit(Math.min(Number(req.query.limit) || 100, 250))
      );
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id',
  roleMiddleware('SUPERADMIN', 'DISTRIBUTOR', 'ADMIN'),
  requireAnyPermission('integrations:manage', 'integrations:manage_distributor'),
  async (req, res, next) => {
    try {
      if (!isValidObjectId(req.params.id)) throw badRequest('id de integracion invalido');
      const company = await targetCompany(req, req.body.companyId);
      await assertCompanyModule(company);
      const integration = await Integration.findOne({
        _id: req.params.id,
        companyId: company._id
      }).select('+credentials +webhookSecret');
      if (!integration) return res.status(404).json({ message: 'Integracion no encontrada' });
      const input = req.body.settings
        ? {
            ...req.body,
            settings: {
              ...integration.settings.toObject(),
              ...req.body.settings
            }
          }
        : req.body;
      const data = await integrationPayload(input, company._id);
      if (data.settings) await assertRelatedModules(company, data.settings);
      Object.assign(integration, data, {
        updatedBy: req.user._id
      });
      if (req.body.webhookSecret || req.body.credentials) {
        integration.setSecrets({
          webhookSecret: cleanString(req.body.webhookSecret),
          credentials: safeCredentials(req.body.credentials || {})
        });
      }
      await integration.save();
      await recordActivity({
        user: req.user,
        type: 'integration_updated',
        summary: `Integracion actualizada: ${integration.name}`,
        companyId: integration.companyId,
        distributorId: integration.distributorId,
        metadata: { integrationId: integration._id, fields: Object.keys(req.body) }
      });
      res.json(integration.toSafeObject());
    } catch (error) {
      next(error);
    }
  }
);

export default router;
