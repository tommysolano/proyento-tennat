import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { CRM_PRIORITIES } from '../models/Contact.js';
import { Task, TASK_STATUSES } from '../models/Task.js';
import { recordActivity } from '../utils/activity.js';
import { assertRelatedResource, assignedResourceScope, tenantFields, validateCrmAssignee } from '../utils/crmScope.js';
import { cleanString, isValidObjectId } from '../utils/validation.js';

const router = Router();

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error('dueAt debe ser fecha valida'), { status: 400 });
  return date;
}

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requireAnyPermission('tasks:manage', 'tasks:create_team', 'tasks:read_assigned'));
router.use(requireModule('crm'));
router.use(requireModule('tasks'));
router.param('id', (req, res, next, id) => {
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'id de tarea invalido' });
  }
  next();
});

router.get('/', async (req, res, next) => {
  try {
    const filter = { ...(await assignedResourceScope(req.user)), archivedAt: null };
    if (req.query.relatedId && !isValidObjectId(req.query.relatedId)) {
      return res.status(400).json({ message: 'relatedId invalido' });
    }
    for (const field of ['status', 'relatedType', 'relatedId', 'priority']) if (req.query[field]) filter[field] = req.query[field];
    if (req.query.assignedTo) {
      if (!isValidObjectId(req.query.assignedTo)) {
        return res.status(400).json({ message: 'assignedTo invalido' });
      }
      const requested = String(req.query.assignedTo);
      const current = filter.assignedTo;
      const allowed = !current ||
        current.toString?.() === requested ||
        current.$in?.some((id) => id.toString() === requested);
      filter.assignedTo = allowed ? requested : { $in: [] };
    }
    if (req.query.dueFrom || req.query.dueTo) {
      filter.dueAt = {};
      if (req.query.dueFrom) filter.dueAt.$gte = parseDate(req.query.dueFrom);
      if (req.query.dueTo) filter.dueAt.$lte = parseDate(req.query.dueTo);
    }
    await Task.updateMany(
      { ...filter, status: { $in: ['pending', 'in_progress'] }, dueAt: { $lt: new Date() } },
      { status: 'overdue' }
    );
    res.json(await Task.find(filter).populate('assignedTo createdBy', 'name email role supervisorId').sort({ dueAt: 1, createdAt: -1 }).limit(500));
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const title = cleanString(req.body.title);
    if (!title) return res.status(400).json({ message: 'title es requerido' });
    const relatedType = req.body.relatedType || 'contact';
    if (!['contact', 'opportunity', 'company'].includes(relatedType)) return res.status(400).json({ message: 'relatedType invalido' });
    const assignedTo = req.user.role === 'CALLCENTER'
      ? req.user._id
      : await validateCrmAssignee(req.user, req.body.assignedTo || req.user._id, { allowNull: false });
    const relatedId = await assertRelatedResource(req.user, relatedType, req.body.relatedId || req.user.companyId);
    const priority = req.body.priority || 'medium';
    if (!CRM_PRIORITIES.includes(priority)) return res.status(400).json({ message: 'priority invalida' });
    const task = await Task.create({
      ...tenantFields(req.user),
      title,
      description: cleanString(req.body.description),
      relatedType,
      relatedId,
      assignedTo,
      createdBy: req.user._id,
      dueAt: parseDate(req.body.dueAt),
      priority
    });
    await recordActivity({ user: req.user, type: 'task_created', summary: `Tarea creada: ${task.title}`, metadata: { taskId: task._id, relatedType, relatedId, contactId: relatedType === 'contact' ? relatedId : undefined, opportunityId: relatedType === 'opportunity' ? relatedId : undefined, assignedTo } });
    res.status(201).json(await task.populate('assignedTo createdBy', 'name email role'));
  } catch (error) { next(error); }
});

async function update(req, res, next) {
  try {
    const task = await Task.findOne({ _id: req.params.id, ...(await assignedResourceScope(req.user)), archivedAt: null });
    if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
    if ('title' in req.body) task.title = cleanString(req.body.title);
    if ('description' in req.body) task.description = cleanString(req.body.description);
    if ('dueAt' in req.body) task.dueAt = parseDate(req.body.dueAt);
    if ('priority' in req.body) {
      if (!CRM_PRIORITIES.includes(req.body.priority)) return res.status(400).json({ message: 'priority invalida' });
      task.priority = req.body.priority;
    }
    if ('status' in req.body) {
      if (!TASK_STATUSES.includes(req.body.status)) return res.status(400).json({ message: 'status invalido' });
      task.status = req.body.status;
      task.completedAt = req.body.status === 'completed' ? new Date() : null;
    }
    if ('assignedTo' in req.body) {
      if (req.user.role === 'CALLCENTER') return res.status(403).json({ message: 'CALLCENTER no puede reasignar tareas' });
      task.assignedTo = await validateCrmAssignee(req.user, req.body.assignedTo, { allowNull: false });
    }
    await task.save();
    const completed = task.status === 'completed';
    await recordActivity({ user: req.user, type: completed ? 'task_completed' : 'task_updated', summary: `${completed ? 'Tarea completada' : 'Tarea actualizada'}: ${task.title}`, metadata: { taskId: task._id, relatedType: task.relatedType, relatedId: task.relatedId, contactId: task.relatedType === 'contact' ? task.relatedId : undefined, opportunityId: task.relatedType === 'opportunity' ? task.relatedId : undefined } });
    res.json(await task.populate('assignedTo createdBy', 'name email role'));
  } catch (error) { next(error); }
}

router.patch('/:id', update);
router.patch('/:id/complete', (req, res, next) => { req.body = { ...req.body, status: 'completed' }; return update(req, res, next); });
router.delete('/:id', async (req, res, next) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, ...(await assignedResourceScope(req.user)), archivedAt: null },
      { archivedAt: new Date(), status: 'cancelled' },
      { new: true }
    );
    if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
    await recordActivity({ user: req.user, type: 'task_archived', summary: `Tarea archivada: ${task.title}`, metadata: { taskId: task._id } });
    res.json(task);
  } catch (error) { next(error); }
});

export default router;
