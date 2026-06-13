import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Company } from '../models/Company.js';
import { Appointment } from '../models/Appointment.js';
import { Contact } from '../models/Contact.js';
import { Conversation } from '../models/Conversation.js';
import { Opportunity } from '../models/Opportunity.js';
import { Pipeline } from '../models/Pipeline.js';
import { PipelineStage } from '../models/PipelineStage.js';
import { Tag } from '../models/Tag.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { Workflow } from '../models/Workflow.js';
import { tagScopeFilter } from '../utils/crmOrganization.js';
import { WorkflowRun } from '../models/WorkflowRun.js';
import { workflowCatalog } from '../modules/workflows/workflowCatalog.js';
import { WorkflowService } from '../modules/workflows/WorkflowService.js';
import { validateWorkflowDefinition } from '../modules/workflows/workflowValidation.js';
import { recordActivity } from '../utils/activity.js';
import { checkUsageLimit, trackUsage } from '../utils/usage.js';

const router = Router();

function safeRegex(value) {
  return new RegExp(String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

async function tenantFor(req, { write = false } = {}) {
  if (req.user.role !== 'SUPERADMIN') {
    return {
      companyId: req.user.companyId,
      distributorId: req.user.distributorId || null
    };
  }
  const companyId = write
    ? req.body.companyId || req.query.companyId
    : req.query.companyId;
  if (!companyId || !mongoose.isValidObjectId(companyId)) {
    if (!write) return { companyId: null, distributorId: null };
    throw Object.assign(new Error('companyId valido es requerido para SUPERADMIN'), {
      status: 400
    });
  }
  const company = await Company.findById(companyId).select('distributorId');
  if (!company) throw Object.assign(new Error('Empresa no encontrada'), { status: 404 });
  return { companyId: company._id, distributorId: company.distributorId || null };
}

async function validateReferences(companyId, actions = []) {
  for (const action of actions) {
    const config = action.config || {};
    const checks = [
      ['userId', User, { role: { $in: ['ADMIN', 'SUPERVISOR', 'CALLCENTER'] }, status: 'active' }],
      ['tagId', Tag, { status: 'active', ...tagScopeFilter('contact') }],
      ['stageId', PipelineStage, { status: 'active' }],
      ['pipelineId', Pipeline, { status: 'active' }],
      ['contactId', Contact, { archivedAt: null }],
      ['opportunityId', Opportunity, {}],
      ['taskId', Task, { archivedAt: null }],
      ['conversationId', Conversation, { archivedAt: null }],
      ['appointmentId', Appointment, {}]
    ];
    for (const [field, Model, extra] of checks) {
      if (!config[field]) continue;
      if (!await Model.exists({ _id: config[field], companyId, ...extra })) {
        throw Object.assign(
          new Error(`${field} de ${action.type} no pertenece a la empresa`),
          { status: 400 }
        );
      }
    }
  }
}

function workflowBody(body) {
  return {
    name: body.name,
    description: body.description || '',
    trigger: body.trigger,
    conditions: Array.isArray(body.conditions) ? body.conditions : [],
    actions: Array.isArray(body.actions) ? body.actions : [],
    settings: body.settings || {},
    metadata: body.metadata || {}
  };
}

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN', 'ADMIN', 'SUPERVISOR'));
router.use(requireModule('automations'));
router.use(requireModule('workflows'));

router.get(
  '/catalog',
  requireAnyPermission('workflows:read', 'workflows:read_team', 'workflows:read_all'),
  (req, res) => res.json(workflowCatalog)
);

router.get(
  '/',
  requireAnyPermission('workflows:read', 'workflows:read_team', 'workflows:read_all'),
  async (req, res, next) => {
    try {
      const tenant = await tenantFor(req);
      const filter = tenant.companyId ? { companyId: tenant.companyId } : {};
      if (req.query.status) filter.status = req.query.status;
      if (req.query.triggerType) filter['trigger.type'] = req.query.triggerType;
      if (req.query.eventType) filter['trigger.eventType'] = req.query.eventType;
      if (req.query.createdBy) filter.createdBy = req.query.createdBy;
      if (req.query.search) filter.name = safeRegex(req.query.search);
      const workflows = await Workflow.find(filter)
          .populate('createdBy updatedBy', 'name email role')
          .sort({ createdAt: -1 })
          .limit(500);
      const totals = await WorkflowRun.aggregate([
        { $match: { workflowId: { $in: workflows.map((item) => item._id) } } },
        { $group: { _id: '$workflowId', count: { $sum: 1 } } }
      ]);
      const countByWorkflow = new Map(
        totals.map((item) => [String(item._id), item.count])
      );
      res.json(
        workflows.map((item) => ({
          ...item.toJSON(),
          runsTotal: countByWorkflow.get(String(item._id)) || 0
        }))
      );
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  requireAnyPermission('workflows:manage', 'workflows:manage_all'),
  async (req, res, next) => {
    try {
      const tenant = await tenantFor(req, { write: true });
      const body = workflowBody(req.body);
      validateWorkflowDefinition(body, { requireActions: req.body.status === 'active' });
      await validateReferences(tenant.companyId, body.actions);
      await checkUsageLimit({
        ...tenant,
        metric: 'workflows'
      });
      const workflow = await Workflow.create({
        ...body,
        ...tenant,
        status: req.body.status === 'active' ? 'active' : 'draft',
        createdBy: req.user._id,
        updatedBy: req.user._id
      });
      await Promise.all([
        trackUsage({
          ...tenant,
          metric: 'workflows',
          metadata: { workflowId: workflow._id }
        }),
        recordActivity({
          user: req.user,
          ...tenant,
          type: workflow.status === 'active' ? 'workflow_activated' : 'workflow_created',
          summary: `Workflow creado: ${workflow.name}`,
          metadata: { workflowId: workflow._id, status: workflow.status }
        })
      ]);
      res.status(201).json(workflow);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id/runs',
  requireAnyPermission(
    'workflow_runs:read',
    'workflow_runs:read_team',
    'workflow_runs:read_all'
  ),
  async (req, res, next) => {
    try {
      const tenant = await tenantFor(req);
      const workflow = await Workflow.findOne({
        _id: req.params.id,
        ...(tenant.companyId ? { companyId: tenant.companyId } : {})
      }).select('_id companyId');
      if (!workflow) return res.status(404).json({ message: 'Workflow no encontrado' });
      res.json(
        await WorkflowRun.find({
          workflowId: workflow._id,
          companyId: workflow.companyId
        }).sort({ createdAt: -1 }).limit(500)
      );
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id',
  requireAnyPermission('workflows:read', 'workflows:read_team', 'workflows:read_all'),
  async (req, res, next) => {
    try {
      const tenant = await tenantFor(req);
      const workflow = await Workflow.findOne({
        _id: req.params.id,
        ...(tenant.companyId ? { companyId: tenant.companyId } : {})
      }).populate('createdBy updatedBy', 'name email role');
      if (!workflow) return res.status(404).json({ message: 'Workflow no encontrado' });
      res.json(workflow);
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id',
  requireAnyPermission('workflows:manage', 'workflows:manage_all'),
  async (req, res, next) => {
    try {
      const tenant = await tenantFor(req, { write: req.user.role === 'SUPERADMIN' });
      const workflow = await Workflow.findOne({
        _id: req.params.id,
        companyId: tenant.companyId
      });
      if (!workflow) return res.status(404).json({ message: 'Workflow no encontrado' });
      const body = workflowBody({
        ...workflow.toObject(),
        ...req.body,
        trigger: req.body.trigger || workflow.trigger,
        conditions: req.body.conditions || workflow.conditions,
        actions: req.body.actions || workflow.actions,
        settings: { ...workflow.settings.toObject(), ...(req.body.settings || {}) }
      });
      const nextStatus = req.body.status || workflow.status;
      validateWorkflowDefinition(body, { requireActions: nextStatus === 'active' });
      await validateReferences(workflow.companyId, body.actions);
      Object.assign(workflow, body);
      workflow.status = nextStatus;
      workflow.updatedBy = req.user._id;
      workflow.version += 1;
      await workflow.save();
      await recordActivity({
        user: req.user,
        companyId: workflow.companyId,
        distributorId: workflow.distributorId,
        type: 'workflow_updated',
        summary: `Workflow actualizado: ${workflow.name}`,
        metadata: { workflowId: workflow._id, version: workflow.version }
      });
      res.json(workflow);
    } catch (error) {
      next(error);
    }
  }
);

function statusAction(status, activityType) {
  return async (req, res, next) => {
    try {
      const tenant = await tenantFor(req, { write: req.user.role === 'SUPERADMIN' });
      const workflow = await Workflow.findOne({
        _id: req.params.id,
        companyId: tenant.companyId
      });
      if (!workflow) return res.status(404).json({ message: 'Workflow no encontrado' });
      if (status === 'active') {
        validateWorkflowDefinition(workflow.toObject(), { requireActions: true });
        await validateReferences(workflow.companyId, workflow.actions);
      }
      workflow.status = status;
      workflow.updatedBy = req.user._id;
      workflow.version += 1;
      await workflow.save();
      await recordActivity({
        user: req.user,
        companyId: workflow.companyId,
        distributorId: workflow.distributorId,
        type: activityType,
        summary: `Workflow ${status}: ${workflow.name}`,
        metadata: { workflowId: workflow._id, status }
      });
      res.json(workflow);
    } catch (error) {
      next(error);
    }
  };
}

router.patch(
  '/:id/activate',
  requireAnyPermission('workflows:manage', 'workflows:manage_all'),
  statusAction('active', 'workflow_activated')
);
router.patch(
  '/:id/pause',
  requireAnyPermission('workflows:manage', 'workflows:manage_all'),
  statusAction('paused', 'workflow_paused')
);
router.delete(
  '/:id',
  requireAnyPermission('workflows:manage', 'workflows:manage_all'),
  statusAction('archived', 'workflow_archived')
);
router.patch(
  '/:id/archive',
  requireAnyPermission('workflows:manage', 'workflows:manage_all'),
  statusAction('archived', 'workflow_archived')
);

router.post(
  '/:id/test',
  requireAnyPermission('workflows:test', 'workflows:manage_all'),
  async (req, res, next) => {
    try {
      const tenant = await tenantFor(req, { write: req.user.role === 'SUPERADMIN' });
      const workflow = await Workflow.findOne({
        _id: req.params.id,
        companyId: tenant.companyId
      });
      if (!workflow) return res.status(404).json({ message: 'Workflow no encontrado' });
      const dryRun = req.body.dryRun !== false;
      const result = dryRun
        ? await WorkflowService.preview(workflow, {
            ...req.body,
            actorUserId: req.user._id
          })
        : await WorkflowService.emitEvent({
            companyId: workflow.companyId,
            distributorId: workflow.distributorId,
            eventType: workflow.trigger.eventType,
            sourceModule: workflow.trigger.sourceModule,
            entityType: req.body.entityType || workflow.trigger.eventType.split('.')[0],
            entityId: req.body.entityId || null,
            actorUserId: req.user._id,
            payload: req.body.payload || {},
            idempotencyKey: `manual:${workflow._id}:${randomUUID()}`,
            metadata: { manualTest: true }
          });
      await recordActivity({
        user: req.user,
        companyId: workflow.companyId,
        distributorId: workflow.distributorId,
        type: 'workflow_tested',
        summary: `Workflow probado: ${workflow.name}`,
        metadata: { workflowId: workflow._id, dryRun }
      });
      res.status(dryRun ? 200 : 202).json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
