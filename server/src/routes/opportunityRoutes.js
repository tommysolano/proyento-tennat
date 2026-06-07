import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { Contact, CRM_PRIORITIES } from '../models/Contact.js';
import { Note } from '../models/Note.js';
import { Opportunity, OPPORTUNITY_STATUSES } from '../models/Opportunity.js';
import { Pipeline } from '../models/Pipeline.js';
import { PipelineStage } from '../models/PipelineStage.js';
import { Task } from '../models/Task.js';
import { Appointment } from '../models/Appointment.js';
import { recordActivity } from '../utils/activity.js';
import { assignedResourceScope, tenantFields, validateCrmAssignee } from '../utils/crmScope.js';
import { validateCustomFieldValues } from '../utils/customFields.js';
import { cleanString, isValidObjectId } from '../utils/validation.js';

const router = Router();
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function dateValue(value, field) {
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${field} debe ser fecha valida`);
  return date;
}

async function validateRelations(user, body, current = null) {
  const data = {};
  if ('contactId' in body || !current) {
    const contactId = body.contactId || current?.contactId;
    if (!isValidObjectId(contactId)) throw badRequest('contactId invalido');
    const contact = await Contact.findOne({
      _id: contactId,
      ...(await assignedResourceScope(user)),
      archivedAt: null
    }).select('_id assignedTo source');
    if (!contact) throw badRequest('El contacto no pertenece al alcance del usuario');
    data.contactId = contact._id;
    if (!('assignedTo' in body) && !current) data.assignedTo = contact.assignedTo;
    if (!body.source && !current) data.source = contact.source;
  }
  if ('pipelineId' in body || !current) {
    const pipelineId = body.pipelineId || current?.pipelineId;
    const pipeline = await Pipeline.findOne({ _id: pipelineId, companyId: user.companyId, status: 'active' });
    if (!pipeline) throw badRequest('pipelineId no pertenece a la empresa');
    data.pipelineId = pipeline._id;
  }
  if ('stageId' in body || 'pipelineId' in body || !current) {
    const pipelineId = data.pipelineId || current?.pipelineId;
    const stageId = body.stageId || current?.stageId;
    const stage = await PipelineStage.findOne({
      _id: stageId,
      pipelineId,
      companyId: user.companyId,
      status: 'active'
    });
    if (!stage) throw badRequest('stageId no pertenece al pipeline');
    data.stageId = stage._id;
    if (!('probability' in body)) data.probability = stage.probability;
  }
  return data;
}

async function payload(user, body, current = null) {
  const data = await validateRelations(user, body, current);
  if (!current || 'title' in body) {
    data.title = cleanString(body.title);
    if (!data.title) throw badRequest('title es requerido');
  }
  if ('value' in body) {
    data.value = Number(body.value);
    if (!Number.isFinite(data.value) || data.value < 0) throw badRequest('value debe ser numerico positivo');
  }
  for (const field of ['currency', 'source', 'lostReason']) if (field in body) data[field] = cleanString(body[field]);
  if ('status' in body) {
    if (!OPPORTUNITY_STATUSES.includes(body.status)) throw badRequest('status invalido');
    data.status = body.status;
  }
  if ('priority' in body) {
    if (!CRM_PRIORITIES.includes(body.priority)) throw badRequest('priority invalida');
    data.priority = body.priority;
  }
  if ('probability' in body) {
    data.probability = Number(body.probability);
    if (!Number.isFinite(data.probability) || data.probability < 0 || data.probability > 100) throw badRequest('probability debe estar entre 0 y 100');
  }
  if ('assignedTo' in body) data.assignedTo = await validateCrmAssignee(user, body.assignedTo);
  for (const field of ['expectedCloseDate', 'nextFollowUpAt']) if (field in body) data[field] = dateValue(body[field], field);
  if ('customFields' in body) {
    data.customFields = await validateCustomFieldValues(user.companyId, 'opportunity', body.customFields, { requireAll: true });
  }
  if (!current && !('customFields' in data)) {
    data.customFields = await validateCustomFieldValues(user.companyId, 'opportunity', {}, { requireAll: true });
  }
  if ('metadata' in body) data.metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  return data;
}

function populate(query) {
  return query
    .populate('contactId', 'name phone email status')
    .populate('pipelineId', 'name status')
    .populate('stageId', 'name order probability color')
    .populate('assignedTo createdBy updatedBy', 'name email role supervisorId');
}

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requireAnyPermission('opportunities:manage', 'opportunities:read_team', 'opportunities:read_assigned'));
router.use(requireModule('crm'));
router.use(requireModule('opportunities'));

router.get('/', async (req, res, next) => {
  try {
    const filter = await assignedResourceScope(req.user);
    for (const field of ['pipelineId', 'stageId', 'status', 'priority', 'contactId']) {
      if (req.query[field]) filter[field] = req.query[field];
    }
    if (req.query.assignedTo) {
      const requested = String(req.query.assignedTo);
      const current = filter.assignedTo;
      const allowed = !current ||
        current.toString?.() === requested ||
        current.$in?.some((id) => id.toString() === requested);
      filter.assignedTo = allowed ? requested : { $in: [] };
    }
    if (req.query.search) {
      const expression = new RegExp(escapeRegExp(cleanString(req.query.search)), 'i');
      filter.title = expression;
    }
    if (req.query.closeFrom || req.query.closeTo) {
      filter.expectedCloseDate = {};
      if (req.query.closeFrom) filter.expectedCloseDate.$gte = dateValue(req.query.closeFrom, 'closeFrom');
      if (req.query.closeTo) filter.expectedCloseDate.$lte = dateValue(req.query.closeTo, 'closeTo');
    }
    if (req.query.followUp === 'overdue') filter.nextFollowUpAt = { $lt: new Date() };
    const items = await populate(Opportunity.find(filter).sort({ updatedAt: -1 }).limit(500));
    res.json(items);
  } catch (error) { next(error); }
});

router.post('/', roleMiddleware('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const item = await Opportunity.create({
      ...(await payload(req.user, req.body)),
      ...tenantFields(req.user),
      createdBy: req.user._id,
      updatedBy: req.user._id
    });
    await recordActivity({ user: req.user, type: 'opportunity_created', summary: `Oportunidad creada: ${item.title}`, metadata: { opportunityId: item._id, contactId: item.contactId, pipelineId: item.pipelineId, stageId: item.stageId } });
    res.status(201).json(await populate(Opportunity.findById(item._id)));
  } catch (error) { next(error); }
});

router.get('/:id/timeline', async (req, res, next) => {
  try {
    const item = await Opportunity.findOne({ _id: req.params.id, ...(await assignedResourceScope(req.user)) });
    if (!item) return res.status(404).json({ message: 'Oportunidad no encontrada' });
    const appointmentScope = await assignedResourceScope(req.user);
    const [notes, activities, tasks, appointments] = await Promise.all([
      Note.find({ companyId: req.user.companyId, relatedType: 'opportunity', relatedId: item._id }).populate('createdBy', 'name role').lean(),
      ActivityLog.find({ companyId: req.user.companyId, 'metadata.opportunityId': item._id }).populate('userId', 'name role').lean(),
      Task.find({ companyId: req.user.companyId, relatedType: 'opportunity', relatedId: item._id }).populate('createdBy assignedTo', 'name role').lean(),
      Appointment.find({ ...appointmentScope, opportunityId: item._id })
        .populate('calendarId', 'name color')
        .populate('assignedTo createdBy', 'name role')
        .lean()
    ]);
    res.json([
      ...notes.map((entry) => ({ kind: 'note', date: entry.createdAt, item: entry })),
      ...activities.map((entry) => ({ kind: 'activity', date: entry.createdAt, item: entry })),
      ...tasks.map((entry) => ({ kind: 'task', date: entry.createdAt, item: entry })),
      ...appointments.map((entry) => ({ kind: 'appointment', date: entry.startAt, item: entry }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)));
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const item = await populate(Opportunity.findOne({ _id: req.params.id, ...(await assignedResourceScope(req.user)) }));
    if (!item) return res.status(404).json({ message: 'Oportunidad no encontrada' });
    res.json(item);
  } catch (error) { next(error); }
});

async function update(req, res, next) {
  try {
    const item = await Opportunity.findOne({ _id: req.params.id, ...(await assignedResourceScope(req.user)) });
    if (!item) return res.status(404).json({ message: 'Oportunidad no encontrada' });
    const previous = {
      stageId: item.stageId.toString(),
      status: item.status,
      assignedTo: item.assignedTo?.toString() || null,
      value: item.value,
      nextFollowUpAt: item.nextFollowUpAt?.toISOString() || null
    };
    const changes = await payload(req.user, req.body, item);
    if (req.user.role === 'CALLCENTER') {
      const allowed = new Set(['status', 'stageId', 'probability', 'nextFollowUpAt', 'lostReason']);
      const forbidden = Object.keys(changes).filter((key) => !allowed.has(key));
      if (forbidden.length) return res.status(403).json({ message: 'CALLCENTER no puede modificar esos campos' });
      if (changes.status === 'archived') return res.status(403).json({ message: 'CALLCENTER no puede archivar oportunidades' });
    }
    Object.assign(item, changes, { updatedBy: req.user._id });
    if (item.status === 'won' && previous.status !== 'won') { item.wonAt = new Date(); item.lostAt = null; item.probability = 100; }
    if (item.status === 'lost' && previous.status !== 'lost') { item.lostAt = new Date(); item.wonAt = null; item.probability = 0; }
    await item.save();
    await recordActivity({ user: req.user, type: 'opportunity_updated', summary: `Oportunidad actualizada: ${item.title}`, metadata: { opportunityId: item._id, contactId: item.contactId, fields: Object.keys(changes) } });
    if (previous.stageId !== item.stageId.toString()) {
      await recordActivity({ user: req.user, type: 'opportunity_stage_changed', summary: `Oportunidad movida de etapa: ${item.title}`, metadata: { opportunityId: item._id, contactId: item.contactId, from: previous.stageId, to: item.stageId } });
    }
    if (previous.status !== item.status && ['won', 'lost'].includes(item.status)) {
      await recordActivity({ user: req.user, type: item.status === 'won' ? 'opportunity_won' : 'opportunity_lost', summary: `Oportunidad ${item.status === 'won' ? 'ganada' : 'perdida'}: ${item.title}`, metadata: { opportunityId: item._id, contactId: item.contactId, value: item.value } });
    }
    if (previous.nextFollowUpAt !== (item.nextFollowUpAt?.toISOString() || null)) {
      await recordActivity({ user: req.user, type: 'follow_up_updated', summary: `Seguimiento de oportunidad actualizado: ${item.title}`, metadata: { opportunityId: item._id, contactId: item.contactId, from: previous.nextFollowUpAt, to: item.nextFollowUpAt } });
    }
    res.json(await populate(Opportunity.findById(item._id)));
  } catch (error) { next(error); }
}

router.patch('/:id', update);
router.patch('/:id/move', update);
router.patch('/:id/won', (req, res, next) => { req.body = { ...req.body, status: 'won' }; return update(req, res, next); });
router.patch('/:id/lost', (req, res, next) => { req.body = { ...req.body, status: 'lost' }; return update(req, res, next); });

router.delete('/:id', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const item = await Opportunity.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      { status: 'archived', updatedBy: req.user._id },
      { new: true }
    );
    if (!item) return res.status(404).json({ message: 'Oportunidad no encontrada' });
    await recordActivity({ user: req.user, type: 'opportunity_archived', summary: `Oportunidad archivada: ${item.title}`, metadata: { opportunityId: item._id, contactId: item.contactId } });
    res.json(item);
  } catch (error) { next(error); }
});

export default router;
