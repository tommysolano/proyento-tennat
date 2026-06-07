import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { BookingLink } from '../models/BookingLink.js';
import { Company } from '../models/Company.js';
import { Contact } from '../models/Contact.js';
import { User } from '../models/User.js';
import { CalendarService } from '../modules/calendar/CalendarService.js';
import { checkModuleAccess } from '../middleware/moduleMiddleware.js';
import { cleanString, EMAIL_PATTERN } from '../utils/validation.js';
import { checkPlatformLimit } from '../utils/platformLimits.js';
import { checkUsageLimit } from '../utils/usage.js';
import { recordActivity } from '../utils/activity.js';

const router = Router();
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

router.use(publicLimiter);

async function publicContext(slug) {
  const link = await BookingLink.findOne({
    slug: cleanString(slug).toLowerCase(),
    publicEnabled: true,
    status: 'active'
  }).populate('calendarId');
  if (!link || !link.calendarId || link.calendarId.status !== 'active') return null;
  const company = await Company.findOne({
    _id: link.companyId,
    status: { $in: ['active', 'trial'] }
  });
  if (!company) return null;
  const pseudoUser = {
    role: 'ADMIN',
    companyId: link.companyId,
    distributorId: link.distributorId
  };
  const [calendarAccess, bookingAccess] = await Promise.all([
    checkModuleAccess('calendar', pseudoUser),
    checkModuleAccess('bookings', pseudoUser)
  ]);
  if (!calendarAccess.enabled || !bookingAccess.enabled) return null;
  return { link, calendar: link.calendarId, company };
}

function safeLink(context) {
  const { link, calendar, company } = context;
  return {
    slug: link.slug,
    title: link.title,
    description: link.description,
    requireApproval: link.requireApproval,
    allowedFields: link.allowedFields,
    thankYouMessage: link.thankYouMessage,
    redirectUrl: link.redirectUrl,
    company: { name: company.name },
    calendar: {
      name: calendar.name,
      description: calendar.description,
      timezone: calendar.timezone,
      color: calendar.color,
      durationMinutes: calendar.settings.appointmentDurationMinutes,
      locationType: calendar.settings.locationType
    }
  };
}

router.get('/:slug', async (req, res, next) => {
  try {
    const context = await publicContext(req.params.slug);
    if (!context) return res.status(404).json({ message: 'Enlace de reserva no disponible' });
    res.json(safeLink(context));
  } catch (error) {
    next(error);
  }
});

router.get('/:slug/availability', async (req, res, next) => {
  try {
    const context = await publicContext(req.params.slug);
    if (!context) return res.status(404).json({ message: 'Enlace de reserva no disponible' });
    const slots = await CalendarService.availability({
      calendar: context.calendar,
      from: req.query.from,
      to: req.query.to
    });
    res.json({
      timezone: context.calendar.timezone,
      slots: slots.map(({ startAt, endAt, timezone }) => ({
        startAt,
        endAt,
        timezone
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/appointments', createLimiter, async (req, res, next) => {
  try {
    const context = await publicContext(req.params.slug);
    if (!context) return res.status(404).json({ message: 'Enlace de reserva no disponible' });
    const { link, calendar } = context;
    const allowed = new Set(link.allowedFields);
    const name = allowed.has('name') ? cleanString(req.body.name) : '';
    const email = allowed.has('email') ? cleanString(req.body.email).toLowerCase() : '';
    const phone = allowed.has('phone') ? cleanString(req.body.phone) : '';
    if (!name) return res.status(400).json({ message: 'name es requerido' });
    if (email && !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ message: 'email invalido' });
    }
    if ((allowed.has('email') || allowed.has('phone')) && !email && !phone) {
      return res.status(400).json({ message: 'email o phone es requerido' });
    }
    const startAt = new Date(req.body.startAt);
    if (Number.isNaN(startAt.getTime())) {
      return res.status(400).json({ message: 'startAt debe ser una fecha valida' });
    }
    const endAt = new Date(
      startAt.getTime() + calendar.settings.appointmentDurationMinutes * 60000
    );
    const slots = await CalendarService.availability({
      calendar,
      from: startAt,
      to: endAt
    });
    const matchedSlot = slots.find(
      (slot) => slot.startAt.getTime() === startAt.getTime()
    );
    if (!matchedSlot) {
      return res.status(409).json({ message: 'El horario seleccionado no esta disponible' });
    }
    await checkUsageLimit({
      companyId: link.companyId,
      distributorId: link.distributorId,
      metric: 'appointments'
    });
    const actor =
      (await User.findOne({
        _id: calendar.createdBy,
        companyId: link.companyId,
        status: 'active'
      })) ||
      (await User.findOne({
        companyId: link.companyId,
        role: 'ADMIN',
        status: 'active'
      }));
    if (!actor) {
      throw Object.assign(new Error('La empresa no tiene un administrador activo'), {
        status: 503
      });
    }
    const conditions = [];
    if (email) conditions.push({ email });
    if (phone) conditions.push({ phone });
    const matches = conditions.length
      ? await Contact.find({
          companyId: link.companyId,
          archivedAt: null,
          $or: conditions
        }).limit(2)
      : [];
    const uniqueMatches = [...new Map(matches.map((item) => [String(item._id), item])).values()];
    if (uniqueMatches.length > 1) {
      return res.status(409).json({
        message: 'El email y telefono coinciden con contactos diferentes'
      });
    }
    let contact = uniqueMatches[0] || null;
    if (!contact) {
      await checkPlatformLimit(link.distributorId, 'contacts');
      contact = await Contact.create({
        companyId: link.companyId,
        distributorId: link.distributorId || null,
        assignedTo: matchedSlot.assignedTo,
        name,
        fullName: name,
        email,
        phone,
        source: 'Reserva publica',
        createdBy: actor._id,
        updatedBy: actor._id,
        metadata: { bookingLinkId: link._id }
      });
      await recordActivity({
        user: actor,
        type: 'contact_created',
        summary: `Contacto creado desde reserva publica: ${contact.name}`,
        metadata: { contactId: contact._id, bookingLinkId: link._id }
      });
    }
    const notes = allowed.has('notes') ? cleanString(req.body.notes) : '';
    const appointment = await CalendarService.createAppointment({
      actor,
      companyId: link.companyId,
      distributorId: link.distributorId,
      body: {
        calendarId: calendar._id,
        contactId: contact._id,
        assignedTo: matchedSlot.assignedTo,
        title: `Cita con ${name}`,
        description: notes,
        notes,
        startAt: req.body.startAt,
        status: link.requireApproval ? 'scheduled' : 'confirmed',
        metadata: {
          bookingLinkId: link._id,
          requireApproval: link.requireApproval
        }
      },
      source: 'public_booking',
      enforceAvailability: true
    });
    res.status(201).json({
      appointment: {
        id: appointment._id,
        title: appointment.title,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        status: appointment.status,
        timezone: appointment.timezone
      },
      thankYouMessage: link.thankYouMessage,
      redirectUrl: link.redirectUrl
    });
  } catch (error) {
    next(error);
  }
});

export default router;
