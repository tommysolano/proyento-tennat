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
import { CrmList } from '../models/CrmList.js';
import { Note } from '../models/Note.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { Task } from '../models/Task.js';
import { Opportunity } from '../models/Opportunity.js';
import { Message } from '../models/Message.js';
import { Appointment } from '../models/Appointment.js';
import { User } from '../models/User.js';
import { recordActivity } from '../utils/activity.js';
import { checkPlatformLimit } from '../utils/platformLimits.js';
import { refreshCompanyOnboarding } from '../utils/onboarding.js';
import { assignedResourceScope, tenantFields, validateCrmAssignee } from '../utils/crmScope.js';
import { validateCustomFieldValues } from '../utils/customFields.js';
import { cleanString, EMAIL_PATTERN, isValidObjectId } from '../utils/validation.js';
import { tagScopeFilter } from '../utils/crmOrganization.js';
import { hasUserPermission } from '../core/permissions/permissions.js';
import { CommunicationPolicyService, normalizeSuppressionValue } from '../modules/communications/CommunicationPolicyService.js';
import { SuppressionEntry } from '../models/SuppressionEntry.js';
import { ContactConsent } from '../models/ContactConsent.js';

const router = Router();
const editableDetails = new Set(['ADMIN', 'SUPERVISOR']);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const attributionPermissions = [
  'attribution:read',
  'attribution:read_team',
  'attribution:read_assigned',
  'attribution:read_all'
];
const activeDndConditions = [
  { 'communicationPreferences.globalDnd': true },
  { 'metadata.doNotDisturb': { $in: [true, 'true', 'active', 'enabled', 'on'] } },
  { 'metadata.dnd': { $in: [true, 'true', 'active', 'enabled', 'on'] } },
  { 'metadata.optOut': { $in: [true, 'true', 'active', 'enabled', 'on'] } },
  { 'metadata.preferences.doNotDisturb': { $in: [true, 'true', 'active', 'enabled', 'on'] } },
  {
    'metadata.communicationPreferences.doNotDisturb': {
      $in: [true, 'true', 'active', 'enabled', 'on']
    }
  }
];

function canReadAttribution(user) {
  return attributionPermissions.some((permission) => hasUserPermission(user, permission));
}

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
  const count = await Tag.countDocuments({
    _id: { $in: unique },
    companyId,
    status: 'active',
    ...tagScopeFilter('contact')
  });
  if (count !== unique.length) throw badRequest('Uno o mas tags no pertenecen a la empresa');
  return unique;
}

async function applyImportedCommunication({ user, contact, row, importReference }) {
  for (const channel of ['whatsapp', 'sms', 'email', 'call']) {
    const status = cleanString(row[`consent_${channel}`]);
    if (!status) continue;
    const consentText = cleanString(row[`consent_${channel}_text`]);
    const legalBasis = cleanString(row[`consent_${channel}_legal_basis`]);
    if (status === 'opted_in' && !consentText && !legalBasis) {
      throw badRequest(
        `consent_${channel}=opted_in requiere texto o base legal de consentimiento`
      );
    }
    await CommunicationPolicyService.recordConsent({
      companyId: user.companyId,
      distributorId: user.distributorId,
      contactId: contact._id,
      channel,
      status,
      source: 'import',
      sourceReference: cleanString(row[`consent_${channel}_reference`]) || importReference,
      legalBasis,
      consentText,
      consentVersion: cleanString(row[`consent_${channel}_version`]),
      reason: cleanString(row[`consent_${channel}_reason`]),
      recordedBy: user._id,
      evidence: { importReference }
    });
  }
  const identifiers = [
    contact.email
      ? { type: 'email', normalizedValue: normalizeSuppressionValue('email', contact.email) }
      : null,
    contact.phone
      ? { type: 'phone', normalizedValue: normalizeSuppressionValue('phone', contact.phone) }
      : null
  ].filter(Boolean);
  if (!identifiers.length) return false;
  return Boolean(await SuppressionEntry.exists({
    companyId: user.companyId,
    status: 'active',
    $and: [
      { $or: identifiers },
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }
    ]
  }));
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

async function addFilters(filter, query, user) {
  for (const field of ['status', 'lifecycleStage', 'source', 'priority', 'city']) {
    if (cleanString(query[field])) filter[field] = cleanString(query[field]);
  }
  if (query.dnd === 'true') {
    filter.$and = [...(filter.$and || []), { $or: activeDndConditions }];
  }
  if (query.dnd === 'false') {
    filter.$and = [...(filter.$and || []), { $nor: activeDndConditions }];
  }
  if (cleanString(query.preferredChannel)) {
    filter['communicationPreferences.preferredChannel'] = cleanString(query.preferredChannel);
  }
  if (cleanString(query.consentStatus) || cleanString(query.consentChannel)) {
    if (!readPermissionsForConsent(user)) {
      throw Object.assign(new Error('No tienes permiso para filtrar por consentimiento'), {
        status: 403
      });
    }
    const consentFilter = { companyId: filter.companyId };
    if (cleanString(query.consentStatus)) consentFilter.status = cleanString(query.consentStatus);
    if (cleanString(query.consentChannel)) {
      consentFilter.channel = CommunicationPolicyService.normalizeChannel(query.consentChannel);
    }
    const contactIds = await ContactConsent.find(consentFilter).distinct('contactId');
    filter._id = { $in: contactIds };
  }
  const hasMarketingFilter = [
    'channel',
    'campaign',
    'consultedProduct',
    'purchasedProduct'
  ].some((field) => cleanString(query[field]));
  if (hasMarketingFilter && !canReadAttribution(user)) {
    throw Object.assign(new Error('No tienes permiso para filtrar por atribucion'), {
      status: 403
    });
  }
  if (cleanString(query.channel)) {
    const channel = cleanString(query.channel);
    filter.$and = [...(filter.$and || []), {
      $or: [
        { 'attribution.entryChannel': channel },
        { 'attribution.channel': channel },
        { 'metadata.channel': channel }
      ]
    }];
  }
  if (cleanString(query.campaign)) {
    const campaign = new RegExp(escapeRegExp(cleanString(query.campaign)), 'i');
    filter.$and = [...(filter.$and || []), {
      $or: [
        { 'attribution.campaignName': campaign },
        { 'attribution.utmCampaign': campaign },
        { 'attribution.externalCampaignId': campaign },
        { 'metadata.campaign': campaign }
      ]
    }];
  }
  if (cleanString(query.consultedProduct)) {
    filter['attribution.consultedProduct'] = new RegExp(
      escapeRegExp(cleanString(query.consultedProduct)),
      'i'
    );
  }
  if (cleanString(query.purchasedProduct)) {
    filter['attribution.purchasedProduct'] = new RegExp(
      escapeRegExp(cleanString(query.purchasedProduct)),
      'i'
    );
  }
  if (cleanString(query.assignedTo)) {
    const requested = cleanString(query.assignedTo);
    const current = filter.assignedTo;
    const allowed = !current ||
      current.toString?.() === requested ||
      current.$in?.some((id) => id.toString() === requested);
    filter.assignedTo = allowed ? requested : { $in: [] };
  }
  if (query.tag) {
    if (!isValidObjectId(query.tag)) throw badRequest('tag invalido');
    const tag = await Tag.exists({
      _id: query.tag,
      companyId: filter.companyId,
      status: 'active',
      ...tagScopeFilter('contact')
    });
    if (!tag) throw badRequest('El tag no pertenece a contactos');
    filter.tags = query.tag;
  }
  if (query.list) {
    if (!isValidObjectId(query.list)) throw badRequest('list invalida');
    const list = await CrmList.findOne({
      _id: query.list,
      companyId: filter.companyId,
      entityType: 'contact',
      status: 'active'
    }).select('memberIds');
    if (!list) throw badRequest('La lista no pertenece a contactos');
    filter.lists = list._id;
  }
  if (query.search) {
    const search = cleanString(query.search);
    const expression = new RegExp(escapeRegExp(search), 'i');
    filter.$or = [
      { name: expression }, { fullName: expression }, { phone: expression },
      { secondaryPhone: expression }, { email: expression },
      ...(isValidObjectId(search) ? [{ _id: search }] : [])
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

function readPermissionsForConsent(user) {
  return ['consent:read', 'consent:read_team', 'consent:read_assigned']
    .some((permission) => hasUserPermission(user, permission));
}

const populateContact = (query, user = null) => {
  if (user && !canReadAttribution(user)) {
    query.select('-attribution');
  }
  return query.populate('assignedTo', 'name email role supervisorId')
  .populate('tags', 'name color status scope')
  .populate('lists', 'name description entityType status')
  .populate('attribution.campaignId', 'name status channel source')
  .populate('attribution.integrationId', 'name provider status')
  .populate('attribution.formId', 'name slug status')
  .populate('attribution.landingPageId', 'name slug status')
  .populate('attribution.funnelId', 'name slug status')
  .populate('attribution.funnelStepId', 'name slug status')
  .populate('createdBy updatedBy', 'name email role')
  .populate('notes.createdBy', 'name email role');
};

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requireAnyPermission('contacts:manage', 'contacts:read_team', 'contacts:read_assigned'));
router.use(requireModule('crm'));
router.use(requireModule('contacts'));

router.get('/export', requireAnyPermission('contacts:export'), async (req, res, next) => {
  try {
    const filter = await addFilters(
      await assignedResourceScope(req.user),
      req.query,
      req.user
    );
    const contacts = await populateContact(
      Contact.find(filter).sort({ createdAt: -1 }),
      req.user
    ).lean();
    const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const header = [
      'name', 'phone', 'email', 'source', 'status', 'lifecycleStage', 'assignedTo',
      'tags', 'lastContactAt', 'nextFollowUpAt', 'createdAt', 'globalDnd',
      'preferredChannel'
    ];
    const rows = contacts.map((contact) => [
      contact.name, contact.phone, contact.email, contact.source, contact.status,
      contact.lifecycleStage, contact.assignedTo?.name,
      contact.tags?.map((tag) => tag.name).join('|'),
      contact.lastContactAt?.toISOString?.() || '', contact.nextFollowUpAt?.toISOString?.() || '',
      contact.createdAt?.toISOString?.() || '',
      contact.communicationPreferences?.globalDnd ? 'true' : 'false',
      contact.communicationPreferences?.preferredChannel || ''
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

router.post('/import', roleMiddleware('ADMIN'), requireAnyPermission('contacts:import'), async (req, res, next) => {
  try {
    if (!Array.isArray(req.body.contacts)) return res.status(400).json({ message: 'contacts debe ser un arreglo JSON' });
    if (req.body.contacts.length > 1000) return res.status(400).json({ message: 'Maximo 1000 contactos por importacion' });
    const summary = { created: 0, updated: 0, duplicates: 0, suppressed: 0, errors: [] };
    const importReference = cleanString(req.body.importReference) || `import:${Date.now()}`;
    for (let index = 0; index < req.body.contacts.length; index += 1) {
      try {
        const row = { ...req.body.contacts[index] };
        if (typeof row.tags === 'string') {
          const names = row.tags.split('|').map((name) => name.trim().toLocaleLowerCase('es')).filter(Boolean);
          const tags = await Tag.find({
            companyId: req.user.companyId,
            normalizedName: { $in: names },
            status: 'active',
            ...tagScopeFilter('contact')
          }).select('_id');
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
          if (await applyImportedCommunication({
            user: req.user,
            contact: existing,
            row,
            importReference
          })) summary.suppressed += 1;
          continue;
        }
        await checkPlatformLimit(req.user.distributorId, 'contacts');
        const created = await Contact.create({
          ...payload,
          ...tenantFields(req.user),
          createdBy: req.user._id,
          updatedBy: req.user._id
        });
        if (await applyImportedCommunication({
          user: req.user,
          contact: created,
          row,
          importReference
        })) summary.suppressed += 1;
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
    const filter = await addFilters(
      await assignedResourceScope(req.user),
      req.query,
      req.user
    );
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const contacts = await populateContact(
      Contact.find(filter).sort({ createdAt: -1 }).limit(limit),
      req.user
    );
    res.json(contacts);
  } catch (error) {
    next(error);
  }
});

router.post('/', roleMiddleware('ADMIN'), requireAnyPermission('contacts:manage'), async (req, res, next) => {
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
    res.status(201).json(await populateContact(Contact.findById(contact._id), req.user));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/timeline', async (req, res, next) => {
  try {
    const contact = await Contact.findOne({ _id: req.params.id, ...(await assignedResourceScope(req.user)) });
    if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });
    const appointmentScope = await assignedResourceScope(req.user);
    const [notes, activities, tasks, opportunities, messages, appointments] = await Promise.all([
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
        .lean(),
      Appointment.find({ ...appointmentScope, contactId: contact._id })
        .populate('calendarId', 'name color')
        .populate('assignedTo createdBy', 'name role')
        .lean()
    ]);
    const timeline = [
      ...notes.map((item) => ({ kind: 'note', date: item.createdAt, item })),
      ...activities.map((item) => ({ kind: 'activity', date: item.createdAt, item })),
      ...tasks.map((item) => ({ kind: 'task', date: item.createdAt, item })),
      ...opportunities.map((item) => ({ kind: 'opportunity', date: item.createdAt, item })),
      ...messages.map((item) => ({ kind: 'message', date: item.createdAt, item })),
      ...appointments.map((item) => ({ kind: 'appointment', date: item.startAt, item }))
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
    }), req.user);
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
    res.json(await populateContact(Contact.findById(contact._id), req.user));
  } catch (error) {
    next(error);
  }
}

router.patch(
  '/:id',
  requireAnyPermission('contacts:manage', 'contacts:update_team', 'contacts:update_assigned'),
  updateContact
);
router.put(
  '/:id',
  requireAnyPermission('contacts:manage', 'contacts:update_team', 'contacts:update_assigned'),
  updateContact
);

router.post(
  '/:id/notes',
  requireAnyPermission('notes:manage', 'notes:create_team', 'notes:create_assigned', 'contacts:notes'),
  async (req, res, next) => {
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
    res.status(201).json(await populateContact(Contact.findById(contact._id), req.user));
  } catch (error) {
    next(error);
  }
  }
);

router.delete('/:id', roleMiddleware('ADMIN'), requireAnyPermission('contacts:manage'), async (req, res, next) => {
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
