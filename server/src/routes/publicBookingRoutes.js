import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { BookingLink } from '../models/BookingLink.js';
import { Company } from '../models/Company.js';
import { Contact } from '../models/Contact.js';
import { Funnel } from '../models/Funnel.js';
import { FunnelStep } from '../models/FunnelStep.js';
import { LandingPage } from '../models/LandingPage.js';
import { User } from '../models/User.js';
import { CalendarService } from '../modules/calendar/CalendarService.js';
import { FunnelService } from '../modules/funnels/FunnelService.js';
import {
  safeTrackingContext,
  slugifyPublic,
  sanitizePlainText
} from '../modules/marketing/marketingSecurity.js';
import {
  attributionFromTracking,
  mergeMarketingAttribution
} from '../modules/marketing/marketingAttribution.js';
import { checkModuleAccess } from '../middleware/moduleMiddleware.js';
import { cleanString, EMAIL_PATTERN } from '../utils/validation.js';
import { checkPlatformLimit } from '../utils/platformLimits.js';
import { checkUsageLimit } from '../utils/usage.js';
import { recordActivity } from '../utils/activity.js';
import { logger } from '../utils/logger.js';
import { CommunicationPolicyService } from '../modules/communications/CommunicationPolicyService.js';

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
    consentRequests: link.consentRequests,
    thankYouMessage: link.thankYouMessage,
    redirectUrl: link.redirectUrl,
    company: { name: company.name },
    calendar: {
      name: calendar.name,
      description: calendar.description,
      timezone: calendar.timezone,
      color: calendar.color,
      durationMinutes: calendar.settings.appointmentDurationMinutes,
      locationType: calendar.settings.locationType,
      locationValue: calendar.settings.locationValue,
      capacityPerSlot: calendar.settings.capacityPerSlot,
      clientFields: (calendar.settings.clientFields || []).filter(
        (field) => field.enabled !== false
      )
    }
  };
}

async function bookingConversionTarget(link, source = {}) {
  if (source.funnelSlug && source.stepSlug) {
    const funnel = await Funnel.findOne({
      companyId: link.companyId,
      slug: slugifyPublic(source.funnelSlug),
      status: 'published'
    }).select('_id companyId distributorId attribution');
    const step = funnel
      ? await FunnelStep.findOne({
          companyId: link.companyId,
          funnelId: funnel._id,
          slug: slugifyPublic(source.stepSlug),
          bookingLinkId: link._id,
          status: 'published'
        }).select('_id landingPageId attribution')
      : null;
    if (funnel && step) {
      const landingPage = step.landingPageId
        ? await LandingPage.findOne({
            _id: step.landingPageId,
            companyId: link.companyId
          }).select('_id attribution')
        : null;
      return {
        companyId: link.companyId,
        distributorId: link.distributorId,
        funnelId: funnel._id,
        funnelStepId: step._id,
        landingPageId: step.landingPageId || null,
        attribution: mergeMarketingAttribution(
          mergeMarketingAttribution(funnel.attribution, landingPage?.attribution),
          step.attribution
        )
      };
    }
  }
  if (source.landingSlug) {
    const page = await LandingPage.findOne({
      companyId: link.companyId,
      slug: slugifyPublic(source.landingSlug),
      status: 'published',
      $or: [
        { 'settings.associatedBookingLinkId': link._id },
        { 'content.sections.content.bookingLinkId': link._id }
      ]
    }).select('_id attribution');
    if (page) {
      return {
        companyId: link.companyId,
        distributorId: link.distributorId,
        landingPageId: page._id,
        attribution: page.attribution
      };
    }
  }
  return null;
}

function bookingFields(calendar, input) {
  const supplied = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const values = {};
  for (const field of (calendar.settings.clientFields || []).filter(
    (item) => item.enabled !== false
  )) {
    const raw = supplied[field.key];
    const value = field.type === 'number'
      ? String(raw ?? '').trim()
      : sanitizePlainText(raw, field.type === 'textarea' ? 2000 : 500);
    if (field.required && !value) {
      throw Object.assign(new Error(`${field.label} es requerido`), { status: 400 });
    }
    if (field.type === 'number' && value && !Number.isFinite(Number(value))) {
      throw Object.assign(new Error(`${field.label} debe ser numerico`), { status: 400 });
    }
    if (value) values[field.key] = field.type === 'number' ? Number(value) : value;
  }
  return values;
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
      slots: slots.map(({ startAt, endAt, timezone, remainingCapacity }) => ({
        startAt,
        endAt,
        timezone,
        remainingCapacity
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
    const tracking = safeTrackingContext(req);
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
    const customFields = bookingFields(calendar, req.body.fields);
    const consentValues =
      req.body.consents && typeof req.body.consents === 'object' && !Array.isArray(req.body.consents)
        ? req.body.consents
        : {};
    for (const request of link.consentRequests || []) {
      if (request.required && consentValues[request.channel] !== true) {
        return res.status(400).json({
          message: `Debes aceptar el consentimiento para ${request.channel}`
        });
      }
    }
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
    const conversionTarget = await bookingConversionTarget(link, req.body.source || {});
    const attributionDefaults = {
      entryChannel:
        tracking.attribution?.canal_ingreso ||
        tracking.attribution?.entryChannel ||
        'public_booking',
      channel: tracking.attribution?.channel || 'public_booking'
    };
    for (const field of ['campaignId', 'landingPageId', 'funnelId', 'funnelStepId']) {
      const value =
        field === 'campaignId'
          ? conversionTarget?.attribution?.campaignId || link.attribution?.campaignId
          : conversionTarget?.[field];
      if (value) attributionDefaults[field] = value;
    }
    const attribution = mergeMarketingAttribution(
      mergeMarketingAttribution(link.attribution, conversionTarget?.attribution),
      attributionFromTracking(
        tracking,
        tracking.attribution || {},
        attributionDefaults
      )
    );
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
        attribution,
        createdBy: actor._id,
        updatedBy: actor._id,
        metadata: {
          bookingLinkId: link._id,
          channel: attribution.entryChannel || attribution.channel || 'public_booking'
        }
      });
      await recordActivity({
        user: actor,
        type: 'contact_created',
        summary: `Contacto creado desde reserva publica: ${contact.name}`,
        metadata: { contactId: contact._id, bookingLinkId: link._id }
      });
    } else {
      if (!contact.name && name) contact.name = name;
      if (!contact.fullName && name) contact.fullName = name;
      if (!contact.email && email) contact.email = email;
      if (!contact.phone && phone) contact.phone = phone;
      contact.attribution = mergeMarketingAttribution(contact.attribution, attribution);
      contact.updatedBy = actor._id;
      await contact.save();
    }
    const notes = allowed.has('notes') ? cleanString(req.body.notes) : '';
    const appointment = await CalendarService.createAppointment({
      actor,
      companyId: link.companyId,
      distributorId: link.distributorId,
      body: {
        calendarId: calendar._id,
        contactId: contact._id,
        bookingLinkId: link._id,
        assignedTo: matchedSlot.assignedTo,
        title: `Cita con ${name}`,
        description: notes,
        notes,
        startAt: req.body.startAt,
        status: link.requireApproval
          ? 'scheduled'
          : calendar.settings.initialAppointmentStatus || 'confirmed',
        attribution,
        metadata: {
          bookingLinkId: link._id,
          requireApproval: link.requireApproval,
          bookingFields: customFields,
          source: {
            landingSlug: slugifyPublic(req.body.source?.landingSlug),
            funnelSlug: slugifyPublic(req.body.source?.funnelSlug),
            stepSlug: slugifyPublic(req.body.source?.stepSlug)
          },
          channel: attribution.entryChannel || attribution.channel || 'public_booking'
        }
      },
      source: 'public_booking',
      enforceAvailability: true
    });
    await Promise.all((link.consentRequests || [])
      .filter((request) => consentValues[request.channel] === true)
      .map((request) => CommunicationPolicyService.recordConsent({
        companyId: link.companyId,
        distributorId: link.distributorId,
        contactId: contact._id,
        channel: request.channel,
        status: 'opted_in',
        source: 'booking',
        sourceReference: String(appointment._id),
        consentText: request.label,
        consentVersion: request.version,
        recordedBy: actor._id,
        evidence: {
          bookingLinkId: link._id,
          appointmentId: appointment._id
        }
      })));
    if (conversionTarget) {
      await FunnelService.recordConversion({
        target: conversionTarget,
        type: 'booking_created',
        tracking,
        metadata: {
          appointmentId: appointment._id,
          bookingLinkId: link._id,
          contactId: contact._id
        }
      }).catch((error) => {
        logger.warn('public_booking.conversion_failed', {
          appointmentId: appointment._id,
          bookingLinkId: link._id,
          message: error.message
        });
      });
    }
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
