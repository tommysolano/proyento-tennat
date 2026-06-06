import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Contact, CONTACT_STATUSES } from '../models/Contact.js';
import { User } from '../models/User.js';
import { recordActivity } from '../utils/activity.js';
import { cleanString, EMAIL_PATTERN, isValidObjectId } from '../utils/validation.js';

const router = Router();

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function teamAgentIds(user) {
  return User.find({
    companyId: user.companyId,
    role: 'CALLCENTER',
    supervisorId: user._id
  }).distinct('_id');
}

async function contactScope(user) {
  if (user.role === 'ADMIN') {
    return { companyId: user.companyId };
  }
  if (user.role === 'SUPERVISOR') {
    return {
      companyId: user.companyId,
      assignedTo: { $in: await teamAgentIds(user) }
    };
  }
  return { companyId: user.companyId, assignedTo: user._id };
}

async function assignedUserId(user, requestedId) {
  if (!requestedId) return null;
  if (!isValidObjectId(requestedId)) {
    throw Object.assign(new Error('assignedTo invalido'), { status: 400 });
  }

  const filter = {
    _id: requestedId,
    companyId: user.companyId,
    role: 'CALLCENTER',
    status: 'active'
  };

  if (user.role === 'SUPERVISOR') {
    filter.supervisorId = user._id;
  }

  const assignedUser = await User.findOne(filter);
  if (!assignedUser) {
    throw Object.assign(
      new Error(
        user.role === 'SUPERVISOR'
          ? 'El agente debe pertenecer al equipo del supervisor'
          : 'assignedTo debe ser un agente activo de la misma empresa'
      ),
      { status: 400 }
    );
  }
  return assignedUser._id;
}

function parseDate(value, field, { nullable = true } = {}) {
  if ((value === null || value === '') && nullable) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error(`${field} debe ser una fecha valida`), { status: 400 });
  }
  return date;
}

async function contactPayload(user, body, { creating = false } = {}) {
  const data = {};
  const canEditDetails = ['ADMIN', 'SUPERVISOR'].includes(user.role);

  if (user.role === 'CALLCENTER') {
    const forbiddenFields = ['name', 'phone', 'email', 'source', 'assignedTo', 'companyId'];
    if (forbiddenFields.some((field) => field in body)) {
      throw Object.assign(
        new Error('CALLCENTER solo puede actualizar estado, contacto y seguimiento'),
        { status: 403 }
      );
    }
  }

  if (canEditDetails && (creating || 'name' in body)) {
    const name = cleanString(body.name);
    if (!name) throw Object.assign(new Error('name es requerido'), { status: 400 });
    data.name = name;
  }

  if (canEditDetails && (creating || 'phone' in body)) {
    const phone = cleanString(body.phone);
    if (!phone) throw Object.assign(new Error('phone es requerido'), { status: 400 });
    data.phone = phone;
  }

  if (canEditDetails && 'email' in body) {
    const email = cleanString(body.email).toLowerCase();
    if (email && !EMAIL_PATTERN.test(email)) {
      throw Object.assign(new Error('email invalido'), { status: 400 });
    }
    data.email = email;
  }

  if (canEditDetails && 'source' in body) {
    if (typeof body.source !== 'string') {
      throw Object.assign(new Error('source debe ser un string'), { status: 400 });
    }
    data.source = cleanString(body.source) || 'Carga manual';
  }

  if ('status' in body) {
    if (!CONTACT_STATUSES.includes(body.status)) {
      throw Object.assign(new Error('status de contacto invalido'), { status: 400 });
    }
    data.status = body.status;
  }

  if (canEditDetails && 'assignedTo' in body) {
    data.assignedTo = await assignedUserId(user, body.assignedTo);
  }

  if ('lastContactAt' in body) {
    data.lastContactAt = parseDate(body.lastContactAt, 'lastContactAt');
  }

  if ('nextFollowUpAt' in body) {
    data.nextFollowUpAt = parseDate(body.nextFollowUpAt, 'nextFollowUpAt');
  }

  return data;
}

function populateContact(query) {
  return query
    .populate('companyId', 'name')
    .populate('assignedTo', 'name email role supervisorId')
    .populate('notes.createdBy', 'name email role');
}

async function populateContactDocument(contact) {
  await contact.populate([
    { path: 'companyId', select: 'name' },
    { path: 'assignedTo', select: 'name email role supervisorId' },
    { path: 'notes.createdBy', select: 'name email role' }
  ]);
  return contact;
}

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));

router.get('/', async (req, res, next) => {
  try {
    const filter = await contactScope(req.user);
    const status = cleanString(req.query.status);
    const search = cleanString(req.query.search);

    if (status && !CONTACT_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Filtro de status invalido' });
    }
    if (status) filter.status = status;
    if (search) {
      const expression = new RegExp(escapeRegExp(search), 'i');
      filter.$or = [{ name: expression }, { phone: expression }, { email: expression }];
    }

    const contacts = await populateContact(
      Contact.find(filter).sort({ createdAt: -1 }).limit(200)
    );
    res.json(contacts);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const contact = await populateContact(
      Contact.findOne({ _id: req.params.id, ...(await contactScope(req.user)) })
    );
    if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });
    res.json(contact);
  } catch (error) {
    next(error);
  }
});

router.post('/', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(403).json({ message: 'El administrador no tiene companyId' });
    }

    const contact = await Contact.create({
      ...(await contactPayload(req.user, req.body, { creating: true })),
      companyId: req.user.companyId
    });

    await recordActivity({
      user: req.user,
      type: 'contact_created',
      summary: `Contacto creado: ${contact.name}`,
      metadata: { contactId: contact._id, assignedTo: contact.assignedTo }
    });
    res.status(201).json(await populateContactDocument(contact));
  } catch (error) {
    next(error);
  }
});

async function updateContact(req, res, next) {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      ...(await contactScope(req.user))
    });
    if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });

    const previous = {
      assignedTo: contact.assignedTo?.toString() || null,
      status: contact.status,
      nextFollowUpAt: contact.nextFollowUpAt?.toISOString() || null
    };
    const changes = await contactPayload(req.user, req.body);

    if (
      'status' in changes &&
      changes.status !== contact.status &&
      !('lastContactAt' in changes) &&
      changes.status !== 'nuevo'
    ) {
      changes.lastContactAt = new Date();
    }

    Object.assign(contact, changes);
    await contact.save();

    await recordActivity({
      user: req.user,
      type: 'contact_updated',
      summary: `Contacto actualizado: ${contact.name}`,
      metadata: { contactId: contact._id, fields: Object.keys(changes) }
    });

    const currentAssignedTo = contact.assignedTo?.toString() || null;
    if (previous.assignedTo !== currentAssignedTo) {
      await recordActivity({
        user: req.user,
        type: 'contact_assigned',
        summary: `Contacto reasignado: ${contact.name}`,
        metadata: {
          contactId: contact._id,
          from: previous.assignedTo,
          to: currentAssignedTo
        }
      });
    }

    if (previous.status !== contact.status) {
      await recordActivity({
        user: req.user,
        type: 'status_change',
        summary: `Estado de ${contact.name}: ${previous.status} -> ${contact.status}`,
        metadata: { contactId: contact._id, from: previous.status, to: contact.status }
      });
    }

    const currentFollowUp = contact.nextFollowUpAt?.toISOString() || null;
    if (previous.nextFollowUpAt !== currentFollowUp) {
      await recordActivity({
        user: req.user,
        type: 'follow_up_updated',
        summary: `Proximo seguimiento actualizado: ${contact.name}`,
        metadata: {
          contactId: contact._id,
          from: previous.nextFollowUpAt,
          to: currentFollowUp
        }
      });
    }

    res.json(await populateContactDocument(contact));
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
    if (text.length > 2000) {
      return res.status(400).json({ message: 'La nota no puede superar 2000 caracteres' });
    }

    const contact = await Contact.findOne({
      _id: req.params.id,
      ...(await contactScope(req.user))
    });
    if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });

    contact.notes.push({ text, createdBy: req.user._id });
    await contact.save();
    await recordActivity({
      user: req.user,
      type: 'note_added',
      summary: `Nota agregada a ${contact.name}`,
      metadata: { contactId: contact._id, noteId: contact.notes.at(-1)._id }
    });
    res.status(201).json(await populateContactDocument(contact));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const contact = await Contact.findOneAndDelete({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });

    await recordActivity({
      user: req.user,
      type: 'contact_deleted',
      summary: `Contacto eliminado: ${contact.name}`,
      metadata: { contactId: contact._id }
    });
    res.json({ message: 'Contacto eliminado' });
  } catch (error) {
    next(error);
  }
});

export default router;
