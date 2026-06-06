import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import {
  CONTACT_LIFECYCLE_STAGES,
  CONTACT_STATUSES,
  Contact,
  CRM_PRIORITIES
} from '../models/Contact.js';
import { Tag } from '../models/Tag.js';
import { Note } from '../models/Note.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { Task } from '../models/Task.js';
import { Opportunity } from '../models/Opportunity.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { recordActivity } from '../utils/activity.js';
import { checkPlatformLimit } from '../utils/platformLimits.js';
import { refreshCompanyOnboarding } from '../utils/onboarding.js';
import { assignedResourceScope, tenantFields, validateCrmAssignee } from '../utils/crmScope.js';
import { validateCustomFieldValues } from '../utils/customFields.js';
import { cleanString, EMAIL_PATTERN, isValidObjectId } from '../utils/validation.js';

const router = Router();
const editableDetails = new Set(['ADMIN', 'SUPERVISOR']);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

function parseDate(value, field) {
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${field} debe ser una fecha valida`);
  return date;
}

async function validateTags(companyId, values) {
  if (!Array.isArray(values)) throw badRequest('tags debe ser un arreglo');
  if (values.some((id) => !isValidObjectId(id))) throw badRequest('tag invalido');
  const unique = [...new Set(values.map(String))];
  const count = await Tag.countDocuments({ _id: { $in: unique }, companyId, status: 'active' });
  if (count !== unique.length) throw badRequest('Uno o mas tags no pertenecen a la empresa');
  return unique;
}

async function buildPayload(user, body, { creating = false } = {}) {
  const data = {};
  const canEdit = editableDetails.has(user.role);
  const detailFields = [
    'name', 'firstName', 'lastName', 'fullName', 'phone', 'secondaryPhone', 'email',
    'source', 'lifecycleStage', 'priority', 'companyName', 'address', 'city', 'country',
    'assignedTo', 'tags', 'customFields', 'metadata'
  ];
  if (user.role === 'CALLCENTER' && detailFields.some((field) => field in body)) {
    throw Object.assign(new Error('CALLCENTER solo puede actualizar estado y seguimiento'), { status: 403 });
  }

  if (canEdit) {
    for (const field of [
      'name', 'firstName', 'lastName', 'fullName', 'phone', 'secondaryPhone', 'source',
      'companyName', 'address', 'city', 'country'
    ]) {
      if (field in body) data[field] = cleanString(body[field]);
    }
    if ('email' in body) {
      data.email = cleanString(body.email).toLowerCase();
      if (data.email && !EMAIL_PATTERN.test(data.email)) throw badRequest('email invalido');
    }
    if ('lifecycleStage' in body) {
      if (!CONTACT_LIFECYCLE_STAGES.includes(body.lifecycleStage)) throw badRequest('lifecycleStage invalido');
      data.lifecycleStage = body.lifecycleStage;
    }
    if ('priority' in body) {
      if (!CRM_PRIORITIES.includes(body.priority)) throw badRequest('priority invalida');
      data.priority = body.priority;
    }
    if ('assignedTo' in body) data.assignedTo = await validateCrmAssignee(user, body.assignedTo);
    if ('tags' in body) data.tags = await validateTags(user.companyId, body.tags);
    if ('customFields' in body) {
      data.customFields = await validateCustomFieldValues(
        user.companyId,
        'contact',
        body.customFields,
        { requireAll: true }
      );
    }
    if ('metadata' in body) data.metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  }

  if ('status' in body) {
    if (!CONTACT_STATUSES.includes(body.status)) throw badRequest('status de contacto invalido');
    data.status = body.status;
  }
  if ('lastContactAt' in body) data.lastContactAt = parseDate(body.lastContactAt, 'lastContactAt');
  if ('nextFollowUpAt' in body) data.nextFollowUpAt = parseDate(body.nextFollowUpAt, 'nextFollowUpAt');
  if ('followUpStatus' in body) {
    if (!['pending', 'done', 'cancelled'].includes(body.followUpStatus)) throw badRequest('followUpStatus invalido');
    data.followUpStatus = body.followUpStatus;
  }

  if (creating) {
    const displayName = data.name || [data.firstName, data.lastName].filter(Boolean).join(' ');
    if (!displayName) throw badRequest('name o firstName es requerido');
    data.name = displayName;
    data.fullName = data.fullName || displayName;
    if (!data.phone && !data.email) throw badRequest('phone o email es requerido');
    if (!('customFields' in data)) {
      data.customFields = await validateCustomFieldValues(user.companyId, 'contact', {}, { requireAll: true });
    }
  }
  return data;
}

function addFilters(filter, query) {
  for (const field of ['status', 'lifecycleStage', 'source', 'priority', 'city']) {
    if (cleanString(query[field])) filter[field] = cleanString(query[field]);
  }
  if (cleanString(query.assignedTo)) {
    const requested = cleanString(query.assignedTo);
    const current = filter.assignedTo;
    const allowed = !current ||
      current.toString?.() === requested ||
      current.$in?.some((id) => id.toString() === requested);
    filter.assignedTo = allowed ? requested : { $in: [] };
  }
  if (query.tag) filter.tags = query.tag;
  if (query.search) {
    const expression = new RegExp(escapeRegExp(cleanString(query.search)), 'i');
    filter.$or = [
      { name: expression }, { fullName: expression }, { phone: expression },
      { secondaryPhone: expression }, { email: expression }
    ];
  }
  const dateRanges = [
    ['createdFrom', 'createdTo', 'createdAt'],
    ['followUpFrom', 'followUpTo', 'nextFollowUpAt']
  ];
  for (const [from, to, field] of dateRanges) {
    if (query[from] || query[to]) {
      filter[field] = {};
      if (query[from]) filter[field].$gte = parseDate(query[from], from);
      if (query[to]) filter[field].$lte = parseDate(query[to], to);
    }
  }
  if (query.followUp === 'overdue') {
    filter.nextFollowUpAt = { $lt: new Date() };
    filter.followUpStatus = 'pending';
  }
  if (query.followUp === 'today') {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    filter.nextFollowUpAt = { $gte: start, $lt: end };
  }
  if (query.followUp === 'upcoming') filter.nextFollowUpAt = { $gte: new Date() };
  filter.archivedAt = null;
  return filter;
}

const populateContact = (query) => query
  .populate('assignedTo', 'name email role supervisorId')
  .populate('tags', 'name color status')
  .populate('createdBy updatedBy', 'name email role')
  .populate('notes.createdBy', 'name email role');

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requireAnyPermission('contacts:manage', 'contacts:read_team', 'contacts:read_assigned'));
router.use(requireModule('crm'));
router.use(requireModule('contacts'));

router.get('/export', async (req, res, next) => {
  try {
    const filter = addFilters(await assignedResourceScope(req.user), req.query);
    const contacts = await populateContact(Contact.find(filter).sort({ createdAt: -1 })).lean();
    const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const header = [
      'name', 'phone', 'email', 'source', 'status', 'lifecycleStage', 'assignedTo',
      'tags', 'lastContactAt', 'nextFollowUpAt', 'createdAt'
    ];
    const rows = contacts.map((contact) => [
      contact.name, contact.phone, contact.email, contact.source, contact.status,
      contact.lifecycleStage, contact.assignedTo?.name,
      contact.tags?.map((tag) => tag.name).join('|'),
      contact.lastContactAt?.toISOString?.() || '', contact.nextFollowUpAt?.toISOString?.() || '',
      contact.createdAt?.toISOString?.() || ''
    ].map(csvCell).join(','));
    await recordActivity({
      user: req.user,
      type: 'contact_exported',
      summary: `${contacts.length} contactos exportados`,
      metadata: { count: contacts.length, filters: req.query }
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="contactos.csv"');
    res.send(`\uFEFF${header.join(',')}\n${rows.join('\n')}`);
  } catch (error) {
    next(error);
  }
});

router.post('/import', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    if (!Array.isArray(req.body.contacts)) return res.status(400).json({ message: 'contacts debe ser un arreglo JSON' });
    if (req.body.contacts.length > 1000) return res.status(400).json({ message: 'Maximo 1000 contactos por importacion' });
    const summary = { created: 0, updated: 0, duplicates: 0, errors: [] };
    for (let index = 0; index < req.body.contacts.length; index += 1) {
      try {
        const row = { ...req.body.contacts[index] };
        if (typeof row.tags === 'string') {
          const names = row.tags.split('|').map((name) => name.trim().toLocaleLowerCase('es')).filter(Boolean);
          const tags = await Tag.find({ companyId: req.user.companyId, normalizedName: { $in: names }, status: 'active' }).select('_id');
          row.tags = tags.map((tag) => tag._id);
        }
        if (row.assignedTo && !isValidObjectId(row.assignedTo)) {
          const assignee = await User.findOne({
            companyId: req.user.companyId,
            role: { $in: ['SUPERVISOR', 'CALLCENTER'] },
            status: 'active',
            $or: [
              { email: cleanString(row.assignedTo).toLowerCase() },
              { name: cleanString(row.assignedTo) }
            ]
          }).select('_id');
          row.assignedTo = assignee?._id || row.assignedTo;
        }
        const payload = await buildPayload(req.user, row, { creating: true });
        const duplicateConditions = [];
        if (payload.phone) duplicateConditions.push({ phone: payload.phone });
        if (payload.email) duplicateConditions.push({ email: payload.email });
        const existing = duplicateConditions.length
          ? await Contact.findOne({ companyId: req.user.companyId, $or: duplicateConditions })
          : null;
        if (existing) {
          summary.duplicates += 1;
          if (req.body.updateDuplicates) {
            Object.assign(existing, payload, { updatedBy: req.user._id });
            await existing.save();
            summary.updated += 1;
          }
          continue;
        }
        await checkPlatformLimit(req.user.distributorId, 'contacts');
        await Contact.create({
          ...payload,
          ...tenantFields(req.user),
          createdBy: req.user._id,
          updatedBy: req.user._id
        });
        summary.created += 1;
      } catch (error) {
        summary.errors.push({ row: index + 1, message: error.message });
      }
    }
    await recordActivity({
      user: req.user,
      type: 'contact_imported',
      summary: `Importacion: ${summary.created} creados, ${summary.duplicates} duplicados`,
      metadata: summary
    });
    await refreshCompanyOnboarding(req.user.companyId);
    res.status(201).json(summary);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const filter = addFilters(await assignedResourceScope(req.user), req.query);
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const contacts = await populateContact(Contact.find(filter).sort({ createdAt: -1 }).limit(limit));
    res.json(contacts);
  } catch (error) {
    next(error);
  }
});

router.post('/', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    await checkPlatformLimit(req.user.distributorId, 'contacts');
    const contact = await Contact.create({
      ...(await buildPayload(req.user, req.body, { creating: true })),
      ...tenantFields(req.user),
      createdBy: req.user._id,
      updatedBy: req.user._id
    });
    await recordActivity({
      user: req.user,
      type: 'contact_created',
      summary: `Contacto creado: ${contact.name}`,
      metadata: { contactId: contact._id }
    });
    await refreshCompanyOnboarding(req.user.companyId);
    res.status(201).json(await populateContact(Contact.findById(contact._id)));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/timeline', async (req, res, next) => {
  try {
    const contact = await Contact.findOne({ _id: req.params.id, ...(await assignedResourceScope(req.user)) });
    if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });
    const [notes, activities, tasks, opportunities, messages] = await Promise.all([
      Note.find({ companyId: req.user.companyId, relatedType: 'contact', relatedId: contact._id })
        .populate('createdBy', 'name role').lean(),
      ActivityLog.find({ companyId: req.user.companyId, 'metadata.contactId': contact._id })
        .populate('userId', 'name role').lean(),
      Task.find({ companyId: req.user.companyId, relatedType: 'contact', relatedId: contact._id })
        .populate('createdBy assignedTo', 'name role').lean(),
      Opportunity.find({ companyId: req.user.companyId, contactId: contact._id })
        .populate('createdBy', 'name role').lean(),
      Message.find({ companyId: req.user.companyId, contactId: contact._id })
        .populate('sentBy', 'name role')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    ]);
    const timeline = [
      ...notes.map((item) => ({ kind: 'note', date: item.createdAt, item })),
      ...activities.map((item) => ({ kind: 'activity', date: item.createdAt, item })),
      ...tasks.map((item) => ({ kind: 'task', date: item.createdAt, item })),
      ...opportunities.map((item) => ({ kind: 'opportunity', date: item.createdAt, item })),
      ...messages.map((item) => ({ kind: 'message', date: item.createdAt, item }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(timeline);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const contact = await populateContact(Contact.findOne({
      _id: req.params.id,
      ...(await assignedResourceScope(req.user)),
      archivedAt: null
    }));
    if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });
    res.json(contact);
  } catch (error) {
    next(error);
  }
});

async function updateContact(req, res, next) {
  try {
    const contact = await Contact.findOne({ _id: req.params.id, ...(await assignedResourceScope(req.user)), archivedAt: null });
    if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });
    const previous = {
      status: contact.status,
      assignedTo: contact.assignedTo?.toString() || null,
      tags: contact.tags.map(String),
      nextFollowUpAt: contact.nextFollowUpAt?.toISOString() || null
    };
    const changes = await buildPayload(req.user, req.body);
    if (changes.status && changes.status !== contact.status && !('lastContactAt' in changes) && changes.status !== 'nuevo') {
      changes.lastContactAt = new Date();
    }
    Object.assign(contact, changes, { updatedBy: req.user._id });
    await contact.save();
    const fields = Object.keys(changes);
    await recordActivity({
      user: req.user,
      type: 'contact_updated',
      summary: `Contacto actualizado: ${contact.name}`,
      metadata: { contactId: contact._id, fields }
    });
    if (previous.status !== contact.status) {
      await recordActivity({ user: req.user, type: 'status_change', summary: `Estado de ${contact.name}: ${previous.status} -> ${contact.status}`, metadata: { contactId: contact._id, from: previous.status, to: contact.status } });
    }
    if (previous.assignedTo !== (contact.assignedTo?.toString() || null)) {
      await recordActivity({ user: req.user, type: 'contact_assigned', summary: `Contacto reasignado: ${contact.name}`, metadata: { contactId: contact._id, from: previous.assignedTo, to: contact.assignedTo } });
    }
    if (JSON.stringify(previous.tags.sort()) !== JSON.stringify(contact.tags.map(String).sort())) {
      await recordActivity({ user: req.user, type: 'contact_tags_updated', summary: `Tags actualizados: ${contact.name}`, metadata: { contactId: contact._id, from: previous.tags, to: contact.tags } });
    }
    if (previous.nextFollowUpAt !== (contact.nextFollowUpAt?.toISOString() || null)) {
      await recordActivity({ user: req.user, type: 'follow_up_updated', summary: `Seguimiento actualizado: ${contact.name}`, metadata: { contactId: contact._id, from: previous.nextFollowUpAt, to: contact.nextFollowUpAt } });
    }
    res.json(await populateContact(Contact.findById(contact._id)));
  } catch (error) {
    next(error);
  }
}

router.patch('/:id', updateContact);
router.put('/:id', updateContact);

router.post('/:id/notes', async (req, res, next) => {
  try {
    const text = cleanString(req.body.text);
    if (!text) return res.status(400).json({ message: 'El texto de la nota es requerido' });
    const contact = await Contact.findOne({ _id: req.params.id, ...(await assignedResourceScope(req.user)) });
    if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });
    contact.notes.push({ text, createdBy: req.user._id });
    await contact.save();
    await Note.create({
      ...tenantFields(req.user),
      relatedType: 'contact',
      relatedId: contact._id,
      text,
      createdBy: req.user._id,
      visibility: req.body.visibility === 'internal' ? 'internal' : 'team'
    });
    await recordActivity({ user: req.user, type: 'note_added', summary: `Nota agregada a ${contact.name}`, metadata: { contactId: contact._id } });
    res.status(201).json(await populateContact(Contact.findById(contact._id)));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId, archivedAt: null },
      { archivedAt: new Date(), updatedBy: req.user._id },
      { new: true }
    );
    if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });
    await recordActivity({ user: req.user, type: 'contact_deleted', summary: `Contacto archivado: ${contact.name}`, metadata: { contactId: contact._id } });
    res.json({ message: 'Contacto archivado' });
  } catch (error) {
    next(error);
  }
});

export default router;
