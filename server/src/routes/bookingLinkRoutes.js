import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { BookingLink } from '../models/BookingLink.js';
import { Calendar } from '../models/Calendar.js';
import { CalendarService } from '../modules/calendar/CalendarService.js';
import { recordActivity } from '../utils/activity.js';
import { checkUsageLimit, trackUsage } from '../utils/usage.js';
import { cleanString, isValidObjectId } from '../utils/validation.js';

const router = Router();

async function uniqueSlug(value, excludeId = null) {
  const base = CalendarService.slugify(value) || 'reservar';
  let candidate = base;
  let suffix = 2;
  while (
    await BookingLink.exists({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {})
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function populate(query) {
  return query
    .populate('calendarId', 'name slug timezone color status settings')
    .populate('createdBy updatedBy', 'name email role');
}

function redirectUrl(value) {
  const clean = cleanString(value);
  if (!clean) return '';
  try {
    const url = new URL(clean);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw Object.assign(new Error('redirectUrl debe ser una URL HTTP o HTTPS valida'), {
      status: 400
    });
  }
}

function optionalBoolean(body, field, fallback) {
  if (!(field in body)) return fallback;
  if (typeof body[field] !== 'boolean') {
    throw Object.assign(new Error(`${field} debe ser boolean`), { status: 400 });
  }
  return body[field];
}

function consentRequests(values) {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || values.length > 4) {
    throw Object.assign(new Error('consentRequests debe ser un arreglo de hasta 4 canales'), {
      status: 400
    });
  }
  const seen = new Set();
  return values.map((item) => {
    const channel = cleanString(item?.channel);
    if (!['whatsapp', 'sms', 'email', 'call'].includes(channel) || seen.has(channel)) {
      throw Object.assign(new Error('Canal de consentimiento invalido o duplicado'), {
        status: 400
      });
    }
    seen.add(channel);
    const label = cleanString(item.label);
    if (!label) {
      throw Object.assign(new Error('Cada consentimiento requiere label'), { status: 400 });
    }
    return {
      channel,
      label,
      required: Boolean(item.required),
      version: cleanString(item.version)
    };
  });
}

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN'));
router.use(requirePermission('booking_links:manage'));
router.use(requireModule('calendar'));
router.use(requireModule('bookings'));
router.param('id', (req, res, next, id) => {
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'bookingLinkId invalido' });
  }
  next();
});

router.get('/', async (req, res, next) => {
  try {
    const filter = { companyId: req.user.companyId };
    if (req.query.status) filter.status = req.query.status;
    else filter.status = { $ne: 'archived' };
    if (req.query.calendarId) {
      if (!isValidObjectId(req.query.calendarId)) {
        return res.status(400).json({ message: 'calendarId invalido' });
      }
      filter.calendarId = req.query.calendarId;
    }
    res.json(await populate(BookingLink.find(filter).sort({ createdAt: -1 })));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const calendar = await Calendar.findOne({
      _id: req.body.calendarId,
      companyId: req.user.companyId,
      status: 'active'
    });
    if (!calendar) return res.status(400).json({ message: 'calendarId invalido' });
    await checkUsageLimit({
      companyId: req.user.companyId,
      distributorId: req.user.distributorId,
      metric: 'booking_links'
    });
    const allowedFields = CalendarService.sanitizeAllowedFields(
      Array.isArray(req.body.allowedFields)
        ? req.body.allowedFields
        : ['name', 'email', 'phone']
    );
    if (!allowedFields.includes('name')) allowedFields.unshift('name');
    const link = await BookingLink.create({
      companyId: req.user.companyId,
      distributorId: req.user.distributorId || null,
      calendarId: calendar._id,
      slug: await uniqueSlug(req.body.slug || req.body.title || calendar.name),
      title: cleanString(req.body.title) || calendar.name,
      description: cleanString(req.body.description),
      publicEnabled: optionalBoolean(req.body, 'publicEnabled', true),
      requireApproval: optionalBoolean(req.body, 'requireApproval', false),
      allowedFields,
      consentRequests: consentRequests(req.body.consentRequests) || [],
      thankYouMessage:
        cleanString(req.body.thankYouMessage) ||
        'Tu cita fue registrada correctamente.',
      redirectUrl: redirectUrl(req.body.redirectUrl),
      createdBy: req.user._id,
      updatedBy: req.user._id,
      metadata: req.body.metadata || {}
    });
    await Promise.all([
      trackUsage({
        companyId: req.user.companyId,
        distributorId: req.user.distributorId,
        metric: 'booking_links',
        metadata: { bookingLinkId: link._id }
      }),
      recordActivity({
        user: req.user,
        type: 'booking_link_created',
        summary: `Enlace de reserva creado: ${link.title}`,
        metadata: { bookingLinkId: link._id, calendarId: calendar._id }
      })
    ]);
    res.status(201).json(await populate(BookingLink.findById(link._id)));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const link = await populate(
      BookingLink.findOne({
        _id: req.params.id,
        companyId: req.user.companyId
      })
    );
    if (!link) return res.status(404).json({ message: 'Enlace no encontrado' });
    res.json(link);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const link = await BookingLink.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!link) return res.status(404).json({ message: 'Enlace no encontrado' });
    if ('calendarId' in req.body) {
      const calendar = await Calendar.findOne({
        _id: req.body.calendarId,
        companyId: req.user.companyId,
        status: 'active'
      });
      if (!calendar) return res.status(400).json({ message: 'calendarId invalido' });
      link.calendarId = calendar._id;
    }
    if ('slug' in req.body) link.slug = await uniqueSlug(req.body.slug, link._id);
    for (const field of [
      'title',
      'description',
      'thankYouMessage',
      'status'
    ]) {
      if (field in req.body) link[field] = cleanString(req.body[field]);
    }
    if ('redirectUrl' in req.body) link.redirectUrl = redirectUrl(req.body.redirectUrl);
    for (const field of ['publicEnabled', 'requireApproval']) {
      if (field in req.body) link[field] = optionalBoolean(req.body, field, false);
    }
    if ('allowedFields' in req.body) {
      if (!Array.isArray(req.body.allowedFields)) {
        return res.status(400).json({ message: 'allowedFields debe ser un arreglo' });
      }
      link.allowedFields = CalendarService.sanitizeAllowedFields(req.body.allowedFields);
      if (!link.allowedFields.includes('name')) link.allowedFields.unshift('name');
    }
    if ('consentRequests' in req.body) {
      link.consentRequests = consentRequests(req.body.consentRequests);
    }
    if ('metadata' in req.body) link.metadata = req.body.metadata || {};
    link.updatedBy = req.user._id;
    await link.save();
    await recordActivity({
      user: req.user,
      type: link.status === 'archived' ? 'booking_link_archived' : 'booking_link_updated',
      summary: `Enlace de reserva actualizado: ${link.title}`,
      metadata: { bookingLinkId: link._id, calendarId: link.calendarId }
    });
    res.json(await populate(BookingLink.findById(link._id)));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/archive', async (req, res, next) => {
  try {
    const link = await BookingLink.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!link) return res.status(404).json({ message: 'Enlace no encontrado' });
    link.status = 'archived';
    link.publicEnabled = false;
    link.updatedBy = req.user._id;
    await link.save();
    await recordActivity({
      user: req.user,
      type: 'booking_link_archived',
      summary: `Enlace de reserva archivado: ${link.title}`,
      metadata: { bookingLinkId: link._id, calendarId: link.calendarId }
    });
    res.json(link);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const link = await BookingLink.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!link) return res.status(404).json({ message: 'Enlace no encontrado' });
    link.status = 'archived';
    link.publicEnabled = false;
    link.updatedBy = req.user._id;
    await link.save();
    await recordActivity({
      user: req.user,
      type: 'booking_link_archived',
      summary: `Enlace de reserva archivado: ${link.title}`,
      metadata: { bookingLinkId: link._id, calendarId: link.calendarId }
    });
    res.json(link);
  } catch (error) {
    next(error);
  }
});

export default router;
