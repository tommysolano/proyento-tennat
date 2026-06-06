import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Contact } from '../models/Contact.js';
import { User } from '../models/User.js';
import { cleanString, EMAIL_PATTERN, isValidObjectId } from '../utils/validation.js';

const router = Router();
const CONTACT_STATUSES = ['pendiente', 'contactado', 'interesado', 'no_interesado'];

function contactScope(user) {
  const scope = { companyId: user.companyId };
  if (user.role === 'CALLCENTER') scope.assignedTo = user._id;
  return scope;
}

async function assignedUserId(user, requestedId) {
  if (user.role === 'CALLCENTER') return user._id;
  if (!requestedId) return null;
  if (!isValidObjectId(requestedId)) {
    throw Object.assign(new Error('assignedTo invalido'), { status: 400 });
  }

  const assignedUser = await User.findOne({
    _id: requestedId,
    companyId: user.companyId,
    role: { $in: ['SUPERVISOR', 'CALLCENTER'] },
    status: 'active'
  });
  if (!assignedUser) {
    throw Object.assign(new Error('assignedTo debe ser un usuario activo de la misma empresa'), {
      status: 400
    });
  }
  return assignedUser._id;
}

async function contactPayload(user, body, partial = false) {
  const data = {};

  if (!partial || 'name' in body) {
    const name = cleanString(body.name);
    if (!name) throw Object.assign(new Error('name es requerido'), { status: 400 });
    data.name = name;
  }

  if (!partial || 'phone' in body) {
    const phone = cleanString(body.phone);
    if (!phone) throw Object.assign(new Error('phone es requerido'), { status: 400 });
    data.phone = phone;
  }

  if ('email' in body) {
    const email = cleanString(body.email).toLowerCase();
    if (email && !EMAIL_PATTERN.test(email)) {
      throw Object.assign(new Error('email invalido'), { status: 400 });
    }
    data.email = email;
  }

  if ('source' in body) {
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

  if (!partial || 'assignedTo' in body || user.role === 'CALLCENTER') {
    data.assignedTo = await assignedUserId(user, body.assignedTo);
  }

  return data;
}

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const contacts = await Contact.find(contactScope(req.user))
      .populate('companyId', 'name')
      .populate('assignedTo', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(contacts);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const contact = await Contact.findOne({ _id: req.params.id, ...contactScope(req.user) })
      .populate('companyId', 'name')
      .populate('assignedTo', 'name email role');
    if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });
    res.json(contact);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/',
  roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'),
  async (req, res, next) => {
    try {
      if (!req.user.companyId) {
        return res.status(403).json({ message: 'El usuario no tiene companyId' });
      }
      const contact = await Contact.create({
        ...(await contactPayload(req.user, req.body)),
        companyId: req.user.companyId
      });
      await contact.populate([
        { path: 'companyId', select: 'name' },
        { path: 'assignedTo', select: 'name email role' }
      ]);
      res.status(201).json(contact);
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/:id',
  roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'),
  async (req, res, next) => {
    try {
      const contact = await Contact.findOne({
        _id: req.params.id,
        ...contactScope(req.user)
      });
      if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });

      Object.assign(contact, await contactPayload(req.user, req.body, true));
      await contact.save();
      await contact.populate([
        { path: 'companyId', select: 'name' },
        { path: 'assignedTo', select: 'name email role' }
      ]);
      res.json(contact);
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:id',
  roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'),
  async (req, res, next) => {
    try {
      const contact = await Contact.findOneAndDelete({
        _id: req.params.id,
        ...contactScope(req.user)
      });
      if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });
      res.json({ message: 'Contacto eliminado' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
