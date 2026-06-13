import mongoose from 'mongoose';
import { ActivityLog } from '../../models/ActivityLog.js';
import { Appointment, APPOINTMENT_STATUSES } from '../../models/Appointment.js';
import { AvailabilityException } from '../../models/AvailabilityException.js';
import { AvailabilityRule } from '../../models/AvailabilityRule.js';
import { BookingLink } from '../../models/BookingLink.js';
import { Campaign } from '../../models/Campaign.js';
import { Calendar } from '../../models/Calendar.js';
import { Contact } from '../../models/Contact.js';
import { Conversation } from '../../models/Conversation.js';
import { Form } from '../../models/Form.js';
import { Funnel } from '../../models/Funnel.js';
import { FunnelStep } from '../../models/FunnelStep.js';
import { Integration } from '../../models/Integration.js';
import { LandingPage } from '../../models/LandingPage.js';
import { Opportunity } from '../../models/Opportunity.js';
import { User } from '../../models/User.js';
import { normalizeMarketingAttribution } from '../marketing/marketingAttribution.js';
import { sanitize } from '../../utils/sanitize.js';
import { cleanString, normalizeOptionalObjectId } from '../../utils/validation.js';
import { checkUsageLimit, trackUsage } from '../../utils/usage.js';
import { JobService } from '../jobs/JobService.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { RealtimeService } from '../realtime/RealtimeService.js';
import {
  addDaysToDateKey,
  assertTimeZone,
  dateKeysBetween,
  dayOfWeekForDateKey,
  overlaps,
  parseDate,
  zonedDateTimeToUtc
} from './calendarTime.js';
import {
  assertProfileOverwriteConfirmed,
  CALENDAR_PROFILES,
  getCalendarProfile,
  profileCalendarPayload
} from './calendarProfiles.js';

const BLOCKING_STATUSES = ['scheduled', 'confirmed'];
const PUBLIC_FIELDS = ['name', 'email', 'phone', 'notes'];
const CLIENT_FIELD_TYPES = ['text', 'textarea', 'number', 'email', 'tel'];
const ATTRIBUTION_MODELS = {
  campaignId: Campaign,
  landingPageId: LandingPage,
  formId: Form,
  funnelId: Funnel,
  funnelStepId: FunnelStep,
  integrationId: Integration
};

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function notFound(message) {
  return Object.assign(new Error(message), { status: 404 });
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

function asId(value) {
  return value?._id || value;
}

async function uniqueCalendarSlug(companyId, value, excludeId = null) {
  const base = slugify(value) || 'calendario';
  let candidate = base;
  let suffix = 2;
  while (
    await Calendar.exists({
      companyId,
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {})
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function validateCalendarUsers(companyId, ownerUserId, teamUserIds = []) {
  const ids = [...new Set([ownerUserId, ...teamUserIds].filter(Boolean).map(String))];
  if (!ids.length) throw badRequest('ownerUserId es requerido');
  if (ids.some((id) => !mongoose.isValidObjectId(id))) throw badRequest('Usuario invalido');
  const users = await User.find({
    _id: { $in: ids },
    companyId,
    role: { $in: ['ADMIN', 'SUPERVISOR', 'CALLCENTER'] },
    status: 'active'
  }).select('_id');
  if (users.length !== ids.length) {
    throw badRequest('Todos los usuarios del calendario deben pertenecer a la empresa');
  }
  return {
    ownerUserId: users.find((user) => String(user._id) === String(ownerUserId))._id,
    teamUserIds: users
      .filter((user) => String(user._id) !== String(ownerUserId))
      .map((user) => user._id)
  };
}

async function activity({ actor, companyId, distributorId, type, summary, metadata }) {
  if (!actor?._id) return null;
  const item = await ActivityLog.create({
    companyId,
    distributorId: distributorId || null,
    userId: actor._id,
    type,
    summary,
    metadata: sanitize(metadata || {})
  });
  const { WorkflowEventEmitter } = await import(
    '../workflows/WorkflowEventEmitter.js'
  );
  await WorkflowEventEmitter.emitFromActivity(item).catch(() => {});
  return item;
}

function populatedAppointment(query) {
  return query
    .populate('calendarId', 'name slug color timezone settings')
    .populate('contactId', 'name phone email status')
    .populate('opportunityId', 'title status value currency')
    .populate('conversationId', 'channel status createdAt')
    .populate('bookingLinkId', 'title slug status')
    .populate('attribution.campaignId', 'name status')
    .populate('assignedTo createdBy updatedBy cancelledBy', 'name email role supervisorId');
}

function normalizeLocation(calendar, location = {}) {
  return {
    type: location.type || calendar.settings.locationType,
    value: location.value ?? calendar.settings.locationValue
  };
}

function sanitizeClientFields(fields = []) {
  if (!Array.isArray(fields)) throw badRequest('clientFields debe ser un arreglo');
  const seen = new Set();
  return fields.slice(0, 30).flatMap((field) => {
    const key = cleanString(field?.key);
    const label = cleanString(field?.label);
    if (!/^[a-z][a-zA-Z0-9]{1,63}$/.test(key) || !label || seen.has(key)) return [];
    seen.add(key);
    return [{
      key,
      label: label.slice(0, 120),
      type: CLIENT_FIELD_TYPES.includes(field.type) ? field.type : 'text',
      required: Boolean(field.required),
      enabled: field.enabled !== false
    }];
  });
}

function normalizeCalendarSettings(settings = {}) {
  const output = { ...settings };
  if ('clientFields' in output) output.clientFields = sanitizeClientFields(output.clientFields);
  for (const field of ['locationValue', 'internalNotesTemplate']) {
    if (field in output) output[field] = cleanString(output[field]);
  }
  return output;
}

async function validateAppointmentAttribution(companyId, input = {}) {
  const attribution = normalizeMarketingAttribution(input);
  for (const [field, Model] of Object.entries(ATTRIBUTION_MODELS)) {
    if (attribution[field] && !await Model.exists({ _id: attribution[field], companyId })) {
      throw badRequest(`${field} no pertenece a la empresa`);
    }
  }
  return attribution;
}

export function slotCapacityState(appointments, slot, calendar, assignedTo) {
  const capacity = Number(calendar.settings?.capacityPerSlot || 1);
  const calendarConflicts = appointments.filter(
    (appointment) =>
      String(asId(appointment.calendarId)) === String(calendar._id) &&
      overlaps(slot.startAt, slot.endAt, appointment.startAt, appointment.endAt)
  ).length;
  const assignedElsewhere = appointments.some(
    (appointment) =>
      String(asId(appointment.calendarId)) !== String(calendar._id) &&
      String(asId(appointment.assignedTo)) === String(asId(assignedTo)) &&
      overlaps(slot.startAt, slot.endAt, appointment.startAt, appointment.endAt)
  );
  return {
    capacity,
    used: calendarConflicts,
    available: Math.max(0, capacity - calendarConflicts),
    blocked:
      calendarConflicts >= capacity ||
      (calendar.settings?.preventOverlaps !== false && assignedElsewhere)
  };
}

export function buildCandidateSlots(
  rules,
  exceptions,
  from,
  to,
  calendar,
  assignedTo,
  durationMinutes
) {
  const windows = [];
  const blocked = [];
  const dateKeys = dateKeysBetween(
    from,
    to,
    calendar.timezone,
    calendar.settings.maxDaysInAdvance + 3
  );
  for (const dateKey of dateKeys) {
    const day = dayOfWeekForDateKey(dateKey);
    for (const rule of rules) {
      if (rule.dayOfWeek !== day) continue;
      windows.push({
        start: zonedDateTimeToUtc(dateKey, rule.startTime, rule.timezone),
        end: zonedDateTimeToUtc(dateKey, rule.endTime, rule.timezone)
      });
    }
    for (const exception of exceptions.filter((item) => item.date === dateKey)) {
      const start = zonedDateTimeToUtc(
        dateKey,
        exception.startTime || '00:00',
        calendar.timezone
      );
      const end = exception.endTime
        ? zonedDateTimeToUtc(dateKey, exception.endTime, calendar.timezone)
        : zonedDateTimeToUtc(addDaysToDateKey(dateKey, 1), '00:00', calendar.timezone);
      if (exception.type === 'available_override') windows.push({ start, end });
      else blocked.push({ start, end });
    }
  }

  const durationMs = durationMinutes * 60 * 1000;
  const stepMs = (calendar.settings.slotIntervalMinutes || durationMinutes) * 60 * 1000;
  const minimum = new Date(Date.now() + calendar.settings.minNoticeMinutes * 60 * 1000);
  const maximum = new Date(
    Date.now() + calendar.settings.maxDaysInAdvance * 24 * 60 * 60 * 1000
  );
  const slots = [];
  for (const window of windows) {
    for (
      let startMs = window.start.getTime();
      startMs + durationMs <= window.end.getTime();
      startMs += stepMs
    ) {
      const startAt = new Date(startMs);
      const endAt = new Date(startMs + durationMs);
      if (startAt < from || endAt > to || startAt < minimum || endAt > maximum) continue;
      if (blocked.some((item) => overlaps(startAt, endAt, item.start, item.end))) continue;
      slots.push({
        startAt,
        endAt,
        assignedTo: asId(assignedTo),
        timezone: calendar.timezone
      });
    }
  }
  return slots;
}

export class CalendarService {
  static slugify = slugify;

  static populateAppointment = populatedAppointment;

  static async createCalendar({ actor, body }) {
    const timezone = assertTimeZone(body.timezone || 'America/Guayaquil');
    const profile = body.configurationProfile
      ? profileCalendarPayload(body.configurationProfile)
      : null;
    const users = await validateCalendarUsers(
      actor.companyId,
      body.ownerUserId || actor._id,
      body.teamUserIds || []
    );
    await checkUsageLimit({
      companyId: actor.companyId,
      distributorId: actor.distributorId,
      metric: 'calendars'
    });
    const calendar = await Calendar.create({
      companyId: actor.companyId,
      distributorId: actor.distributorId || null,
      name: body.name,
      slug: await uniqueCalendarSlug(actor.companyId, body.slug || body.name),
      description: body.description || '',
      type: body.type || profile?.type || 'personal',
      ...users,
      timezone,
      color: body.color || '#2563eb',
      configurationProfile: profile?.configurationProfile || null,
      settings: normalizeCalendarSettings({
        ...(profile?.settings || {}),
        ...(body.settings || {})
      }),
      createdBy: actor._id,
      updatedBy: actor._id,
      metadata: sanitize(body.metadata || {})
    });
    if (profile?.availability?.length) {
      await AvailabilityRule.insertMany(
        profile.availability.map((rule) => ({
          companyId: calendar.companyId,
          distributorId: calendar.distributorId,
          calendarId: calendar._id,
          userId: null,
          timezone: calendar.timezone,
          enabled: true,
          metadata: { configurationProfile: profile.configurationProfile },
          ...rule
        }))
      );
    }
    await Promise.all([
      trackUsage({
        companyId: actor.companyId,
        distributorId: actor.distributorId,
        metric: 'calendars',
        metadata: { calendarId: calendar._id }
      }),
      activity({
        actor,
        companyId: calendar.companyId,
        distributorId: calendar.distributorId,
        type: 'calendar_created',
        summary: `Calendario creado: ${calendar.name}`,
        metadata: { calendarId: calendar._id }
      })
    ]);
    return Calendar.findById(calendar._id).populate(
      'ownerUserId teamUserIds createdBy updatedBy',
      'name email role supervisorId'
    );
  }

  static async updateCalendar({ actor, calendar, body }) {
    if ('name' in body) calendar.name = body.name;
    if ('slug' in body) {
      calendar.slug = await uniqueCalendarSlug(actor.companyId, body.slug, calendar._id);
    }
    for (const field of ['description', 'type', 'color', 'status']) {
      if (field in body) calendar[field] = body[field];
    }
    if ('timezone' in body) calendar.timezone = assertTimeZone(body.timezone);
    if ('ownerUserId' in body || 'teamUserIds' in body) {
      const users = await validateCalendarUsers(
        actor.companyId,
        body.ownerUserId || calendar.ownerUserId,
        body.teamUserIds || calendar.teamUserIds
      );
      calendar.ownerUserId = users.ownerUserId;
      calendar.teamUserIds = users.teamUserIds;
    }
    if ('settings' in body) {
      calendar.settings = {
        ...calendar.settings.toObject(),
        ...normalizeCalendarSettings(body.settings)
      };
    }
    if ('metadata' in body) calendar.metadata = sanitize(body.metadata || {});
    calendar.updatedBy = actor._id;
    await calendar.save();
    await activity({
      actor,
      companyId: calendar.companyId,
      distributorId: calendar.distributorId,
      type: calendar.status === 'archived' ? 'calendar_archived' : 'calendar_updated',
      summary: `Calendario actualizado: ${calendar.name}`,
      metadata: { calendarId: calendar._id, fields: Object.keys(body) }
    });
    return Calendar.findById(calendar._id).populate(
      'ownerUserId teamUserIds createdBy updatedBy',
      'name email role supervisorId'
    );
  }

  static profiles() {
    return CALENDAR_PROFILES;
  }

  static async applyProfile({ actor, calendar, profileKey, confirmOverwrite }) {
    assertProfileOverwriteConfirmed(confirmOverwrite);
    const profile = getCalendarProfile(profileKey);
    if (!profile) throw badRequest('Perfil de calendario invalido');
    calendar.type = profile.calendarType;
    calendar.configurationProfile = profile.key;
    calendar.settings = {
      ...calendar.settings.toObject(),
      ...normalizeCalendarSettings(profile.settings)
    };
    calendar.updatedBy = actor._id;
    await calendar.save();
    await AvailabilityRule.deleteMany({
      companyId: calendar.companyId,
      calendarId: calendar._id,
      userId: null
    });
    await AvailabilityRule.insertMany(
      profile.availability.map((rule) => ({
        companyId: calendar.companyId,
        distributorId: calendar.distributorId,
        calendarId: calendar._id,
        userId: null,
        timezone: calendar.timezone,
        enabled: true,
        metadata: { configurationProfile: profile.key },
        ...rule
      }))
    );
    await activity({
      actor,
      companyId: calendar.companyId,
      distributorId: calendar.distributorId,
      type: 'calendar_profile_applied',
      summary: `Perfil ${profile.name} aplicado a ${calendar.name}`,
      metadata: { calendarId: calendar._id, profileKey: profile.key }
    });
    return Calendar.findById(calendar._id).populate(
      'ownerUserId teamUserIds createdBy updatedBy',
      'name email role supervisorId'
    );
  }

  static async availability({
    calendar,
    from,
    to,
    durationMinutes,
    assignedTo = null,
    ignoreAppointmentId = null
  }) {
    const start = parseDate(from || new Date(), 'from');
    const end = parseDate(
      to || new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000),
      'to'
    );
    if (end <= start) throw badRequest('to debe ser posterior a from');
    if (end.getTime() - start.getTime() > 93 * 24 * 60 * 60 * 1000) {
      throw badRequest('El rango de disponibilidad no puede superar 93 dias');
    }
    const duration = Number(
      durationMinutes || calendar.settings.appointmentDurationMinutes
    );
    if (!Number.isInteger(duration) || duration < 5 || duration > 1440) {
      throw badRequest('durationMinutes debe estar entre 5 y 1440');
    }
    if (
      !assignedTo &&
      ['team', 'service'].includes(calendar.type) &&
      calendar.teamUserIds?.length
    ) {
      const memberIds = [
        calendar.ownerUserId,
        ...calendar.teamUserIds
      ].map(asId);
      const pooled = (
        await Promise.all(
          memberIds.map((memberId) =>
            this.availability({
              calendar,
              from: start,
              to: end,
              durationMinutes: duration,
              assignedTo: memberId,
              ignoreAppointmentId
            })
          )
        )
      )
        .flat()
        .sort((a, b) => a.startAt - b.startAt);
      return pooled.filter(
        (slot, index, array) =>
          index === 0 ||
          slot.startAt.getTime() !== array[index - 1].startAt.getTime() ||
          slot.endAt.getTime() !== array[index - 1].endAt.getTime()
      );
    }
    const assignee = assignedTo || calendar.ownerUserId;
    const memberIds = [calendar.ownerUserId, ...(calendar.teamUserIds || [])]
      .map((item) => String(asId(item)));
    if (!memberIds.includes(String(assignee))) {
      throw badRequest('El responsable no pertenece al calendario');
    }
    const userFilter = { $in: [null, asId(assignee)] };
    const [rules, exceptions, appointments] = await Promise.all([
      AvailabilityRule.find({
        companyId: calendar.companyId,
        calendarId: calendar._id,
        userId: userFilter,
        enabled: true
      }).lean(),
      AvailabilityException.find({
        companyId: calendar.companyId,
        calendarId: calendar._id,
        userId: userFilter
      }).lean(),
      Appointment.find({
        companyId: calendar.companyId,
        status: { $in: BLOCKING_STATUSES },
        startAt: { $lt: end },
        endAt: { $gt: start },
        ...(ignoreAppointmentId ? { _id: { $ne: ignoreAppointmentId } } : {}),
        $or: [{ calendarId: calendar._id }, { assignedTo: asId(assignee) }]
      })
        .select('calendarId assignedTo startAt endAt')
        .lean()
    ]);
    const beforeMs = calendar.settings.bufferBeforeMinutes * 60 * 1000;
    const afterMs = calendar.settings.bufferAfterMinutes * 60 * 1000;
    return buildCandidateSlots(rules, exceptions, start, end, calendar, assignee, duration)
      .map((slot) => {
        const capacity = slotCapacityState(
          appointments,
          {
            startAt: new Date(slot.startAt.getTime() - beforeMs),
            endAt: new Date(slot.endAt.getTime() + afterMs)
          },
          calendar,
          assignee
        );
        return {
          ...slot,
          remainingCapacity: capacity.available,
          blocked: capacity.blocked
        };
      })
      .filter((slot) => !slot.blocked)
      .map(({ blocked, ...slot }) => slot)
      .sort((a, b) => a.startAt - b.startAt)
      .filter(
        (slot, index, array) =>
          index === 0 ||
          slot.startAt.getTime() !== array[index - 1].startAt.getTime()
      );
  }

  static async assertNoOverlap({
    calendar,
    assignedTo,
    startAt,
    endAt,
    ignoreAppointmentId = null
  }) {
    const start = new Date(
      startAt.getTime() - calendar.settings.bufferBeforeMinutes * 60 * 1000
    );
    const end = new Date(
      endAt.getTime() + calendar.settings.bufferAfterMinutes * 60 * 1000
    );
    const appointments = await Appointment.find({
      companyId: calendar.companyId,
      status: { $in: BLOCKING_STATUSES },
      startAt: { $lt: end },
      endAt: { $gt: start },
      ...(ignoreAppointmentId ? { _id: { $ne: ignoreAppointmentId } } : {}),
      $or: [{ calendarId: calendar._id }, { assignedTo }]
    }).select('_id calendarId assignedTo startAt endAt').lean();
    const capacity = slotCapacityState(
      appointments,
      { startAt: start, endAt: end },
      calendar,
      assignedTo
    );
    if (capacity.blocked) {
      throw Object.assign(new Error('El horario ya no esta disponible'), {
        status: 409,
        code:
          capacity.used >= capacity.capacity
            ? 'APPOINTMENT_CAPACITY_REACHED'
            : 'APPOINTMENT_OVERLAP'
      });
    }
  }

  static async validateRelations(companyId, contactId, opportunityId) {
    let contact = null;
    let opportunity = null;
    if (contactId && !mongoose.isValidObjectId(contactId)) {
      throw badRequest('contactId invalido');
    }
    if (opportunityId && !mongoose.isValidObjectId(opportunityId)) {
      throw badRequest('opportunityId invalido');
    }
    if (opportunityId) {
      opportunity = await Opportunity.findOne({ _id: opportunityId, companyId });
      if (!opportunity) throw badRequest('opportunityId no pertenece a la empresa');
      if (!contactId) contactId = opportunity.contactId;
    }
    if (contactId) {
      contact = await Contact.findOne({ _id: contactId, companyId, archivedAt: null });
      if (!contact) throw badRequest('contactId no pertenece a la empresa');
    }
    if (
      opportunity &&
      contact &&
      String(opportunity.contactId) !== String(contact._id)
    ) {
      throw badRequest('La oportunidad no pertenece al contacto indicado');
    }
    return { contact, opportunity };
  }

  static async scheduleReminder(appointment, calendar) {
    const minutes = Number(calendar.settings.reminderMinutesBefore || 0);
    if (minutes < 0 || appointment.status === 'cancelled') return null;
    const reminderAt = new Date(appointment.startAt.getTime() - minutes * 60 * 1000);
    if (appointment.startAt <= new Date()) return null;
    const job = await JobService.enqueue({
      type: 'appointment.reminder',
      payload: { appointmentId: appointment._id },
      runAt: reminderAt > new Date() ? reminderAt : new Date(),
      companyId: appointment.companyId,
      distributorId: appointment.distributorId,
      metadata: { appointmentId: appointment._id }
    });
    appointment.reminderJobId = job._id;
    appointment.reminderAt = reminderAt;
    appointment.reminderSentAt = null;
    await appointment.save();
    return job;
  }

  static async createAppointment({
    actor,
    companyId,
    distributorId = null,
    body,
    source = 'manual',
    enforceAvailability = true
  }) {
    if (!mongoose.isValidObjectId(body.calendarId)) {
      throw badRequest('calendarId invalido');
    }
    const calendar = await Calendar.findOne({
      _id: body.calendarId,
      companyId,
      status: 'active'
    });
    if (!calendar) throw notFound('Calendario no encontrado');
    const assignedTo = asId(body.assignedTo || calendar.ownerUserId);
    const memberIds = [calendar.ownerUserId, ...calendar.teamUserIds].map(String);
    if (!memberIds.includes(String(assignedTo))) {
      throw badRequest('El responsable no pertenece al calendario');
    }
    const startAt = parseDate(body.startAt, 'startAt');
    const endAt = body.endAt
      ? parseDate(body.endAt, 'endAt')
      : new Date(
          startAt.getTime() +
            calendar.settings.appointmentDurationMinutes * 60 * 1000
        );
    if (endAt <= startAt) throw badRequest('endAt debe ser posterior a startAt');
    if (startAt <= new Date()) throw badRequest('startAt debe estar en el futuro');
    const initialStatus =
      body.status || calendar.settings.initialAppointmentStatus || 'scheduled';
    if (!['scheduled', 'confirmed'].includes(initialStatus)) {
      throw badRequest('Una cita nueva debe iniciar como scheduled o confirmed');
    }
    assertTimeZone(body.timezone || calendar.timezone);
    const { contact, opportunity } = await this.validateRelations(
      companyId,
      normalizeOptionalObjectId(body.contactId),
      normalizeOptionalObjectId(body.opportunityId)
    );
    if (calendar.settings.requireContact && !contact) {
      throw badRequest('contactId es requerido para este calendario');
    }
    if (enforceAvailability) {
      const slots = await this.availability({
        calendar,
        from: startAt,
        to: endAt,
        durationMinutes: Math.round((endAt - startAt) / 60000),
        assignedTo
      });
      if (!slots.some((slot) => slot.startAt.getTime() === startAt.getTime())) {
        throw Object.assign(new Error('El horario seleccionado no esta disponible'), {
          status: 409
        });
      }
    }
    await this.assertNoOverlap({ calendar, assignedTo, startAt, endAt });
    await checkUsageLimit({
      companyId,
      distributorId,
      metric: 'appointments'
    });
    const location = normalizeLocation(calendar, body.location || {
      type: body.locationType,
      value: body.locationValue
    });
    const bookingLinkId = normalizeOptionalObjectId(body.bookingLinkId);
    if (bookingLinkId && !mongoose.isValidObjectId(bookingLinkId)) {
      throw badRequest('bookingLinkId invalido');
    }
    if (
      bookingLinkId &&
      !await BookingLink.exists({ _id: bookingLinkId, companyId, calendarId: calendar._id })
    ) {
      throw badRequest('bookingLinkId no pertenece al calendario o empresa');
    }
    const conversationId = normalizeOptionalObjectId(
      body.conversationId || body.metadata?.conversationId
    );
    if (conversationId && !mongoose.isValidObjectId(conversationId)) {
      throw badRequest('conversationId invalido');
    }
    if (
      conversationId &&
      !await Conversation.exists({
        _id: conversationId,
        companyId,
        ...(contact ? { contactId: contact._id } : {})
      })
    ) {
      throw badRequest('conversationId no pertenece al contacto o empresa');
    }
    const attribution = await validateAppointmentAttribution(companyId, body.attribution || {});
    const rescheduledFrom = normalizeOptionalObjectId(body.rescheduledFrom);
    if (
      rescheduledFrom &&
      (
        !mongoose.isValidObjectId(rescheduledFrom) ||
        !await Appointment.exists({ _id: rescheduledFrom, companyId })
      )
    ) {
      throw badRequest('rescheduledFrom no pertenece a la empresa');
    }
    const appointment = await Appointment.create({
      companyId,
      distributorId,
      calendarId: calendar._id,
      contactId: contact?._id || null,
      opportunityId: opportunity?._id || null,
      conversationId,
      bookingLinkId,
      assignedTo,
      title: body.title || `Cita con ${contact?.name || 'contacto'}`,
      description: body.description || '',
      startAt,
      endAt,
      timezone: body.timezone || calendar.timezone,
      status: initialStatus,
      source,
      location,
      locationType: location.type,
      locationValue: location.value,
      notes: body.notes || '',
      createdBy: actor._id,
      updatedBy: actor._id,
      rescheduledFrom,
      attribution,
      metadata: sanitize(body.metadata || {})
    });
    await Promise.all([
      trackUsage({
        companyId,
        distributorId,
        metric: 'appointments',
        metadata: { appointmentId: appointment._id, source }
      }),
      activity({
        actor,
        companyId,
        distributorId,
        type: 'appointment_created',
        summary: `Cita creada: ${appointment.title}`,
        metadata: {
          appointmentId: appointment._id,
          calendarId: calendar._id,
          contactId: appointment.contactId,
          opportunityId: appointment.opportunityId,
          assignedTo
        }
      }),
      NotificationService.create({
        companyId,
        distributorId,
        userId: assignedTo,
        type: 'appointment_assigned',
        title: 'Nueva cita asignada',
        body: `${appointment.title} - ${appointment.startAt.toISOString()}`,
        relatedType: 'appointment',
        relatedId: appointment._id
      })
    ]);
    await this.scheduleReminder(appointment, calendar);
    RealtimeService.publish('appointment.created', {
      companyId,
      assignedTo,
      data: { appointmentId: appointment._id }
    });
    return populatedAppointment(Appointment.findById(appointment._id));
  }

  static async updateAppointment({ actor, appointment, body }) {
    if (!BLOCKING_STATUSES.includes(appointment.status)) {
      throw badRequest('Solo se pueden editar citas scheduled o confirmed');
    }
    const calendar = await Calendar.findOne({
      _id: appointment.calendarId,
      companyId: appointment.companyId
    });
    if (!calendar) throw notFound('Calendario no encontrado');
    const nextStart = body.startAt
      ? parseDate(body.startAt, 'startAt')
      : appointment.startAt;
    const nextEnd = body.endAt ? parseDate(body.endAt, 'endAt') : appointment.endAt;
    const nextAssignee = asId(body.assignedTo || appointment.assignedTo);
    const memberIds = [calendar.ownerUserId, ...(calendar.teamUserIds || [])]
      .map((item) => String(asId(item)));
    if (!memberIds.includes(String(nextAssignee))) {
      throw badRequest('El responsable no pertenece al calendario');
    }
    if ('contactId' in body || 'opportunityId' in body) {
      const contactId =
        'contactId' in body
          ? normalizeOptionalObjectId(body.contactId)
          : appointment.contactId;
      const opportunityId =
        'opportunityId' in body
          ? normalizeOptionalObjectId(body.opportunityId)
          : appointment.opportunityId;
      const relations = await this.validateRelations(
        appointment.companyId,
        contactId,
        opportunityId
      );
      appointment.contactId = relations.contact?._id || null;
      appointment.opportunityId = relations.opportunity?._id || null;
    }
    if (
      nextStart.getTime() !== appointment.startAt.getTime() ||
      nextEnd.getTime() !== appointment.endAt.getTime() ||
      String(nextAssignee) !== String(appointment.assignedTo)
    ) {
      const slots = await this.availability({
        calendar,
        from: nextStart,
        to: nextEnd,
        durationMinutes: Math.round((nextEnd - nextStart) / 60000),
        assignedTo: nextAssignee,
        ignoreAppointmentId: appointment._id
      });
      if (!slots.some((slot) => slot.startAt.getTime() === nextStart.getTime())) {
        throw Object.assign(new Error('El horario seleccionado no esta disponible'), {
          status: 409
        });
      }
      await this.assertNoOverlap({
        calendar,
        assignedTo: nextAssignee,
        startAt: nextStart,
        endAt: nextEnd,
        ignoreAppointmentId: appointment._id
      });
    }
    for (const field of ['title', 'description', 'timezone']) {
      if (field in body) appointment[field] = body[field];
    }
    if ('metadata' in body) {
      const metadata = sanitize(body.metadata || {});
      const suppliedConversationId = normalizeOptionalObjectId(metadata.conversationId);
      if (
        suppliedConversationId &&
        String(suppliedConversationId) !== String(appointment.conversationId || '')
      ) {
        throw badRequest('metadata.conversationId no puede cambiar la relacion de la cita');
      }
      appointment.metadata = {
        ...metadata,
        ...(appointment.conversationId
          ? { conversationId: String(appointment.conversationId) }
          : {})
      };
    }
    if ('attribution' in body) {
      appointment.attribution = await validateAppointmentAttribution(
        appointment.companyId,
        body.attribution
      );
    }
    if ('timezone' in body) assertTimeZone(body.timezone);
    if (
      'location' in body ||
      'locationType' in body ||
      'locationValue' in body
    ) {
      const location = normalizeLocation(
        calendar,
        body.location || {
          type: body.locationType || appointment.locationType,
          value:
            body.locationValue === undefined
              ? appointment.locationValue
              : body.locationValue
        }
      );
      appointment.location = location;
      appointment.locationType = location.type;
      appointment.locationValue = location.value;
    }
    if ('notes' in body) appointment.notes = body.notes;
    appointment.startAt = nextStart;
    appointment.endAt = nextEnd;
    appointment.assignedTo = nextAssignee;
    appointment.updatedBy = actor._id;
    await appointment.save();
    await this.scheduleReminder(appointment, calendar);
    await activity({
      actor,
      companyId: appointment.companyId,
      distributorId: appointment.distributorId,
      type: 'appointment_updated',
      summary: `Cita actualizada: ${appointment.title}`,
      metadata: {
        appointmentId: appointment._id,
        contactId: appointment.contactId,
        opportunityId: appointment.opportunityId,
        fields: Object.keys(body)
      }
    });
    RealtimeService.publish('appointment.updated', {
      companyId: appointment.companyId,
      assignedTo: appointment.assignedTo,
      data: { appointmentId: appointment._id }
    });
    return populatedAppointment(Appointment.findById(appointment._id));
  }

  static async updateStatus({ actor, appointment, status, reason = '' }) {
    if (!APPOINTMENT_STATUSES.includes(status)) throw badRequest('status invalido');
    if (status === appointment.status) {
      return populatedAppointment(Appointment.findById(appointment._id));
    }
    if (status === 'rescheduled') {
      throw badRequest('Use el endpoint de reprogramacion');
    }
    const transitions = {
      scheduled: ['confirmed', 'completed', 'cancelled', 'no_show'],
      confirmed: ['completed', 'cancelled', 'no_show'],
      completed: [],
      cancelled: [],
      no_show: [],
      rescheduled: []
    };
    if (!transitions[appointment.status]?.includes(status)) {
      throw badRequest(`No se puede cambiar una cita ${appointment.status} a ${status}`);
    }
    if (status === 'cancelled') {
      const calendar = await Calendar.findOne({
        _id: appointment.calendarId,
        companyId: appointment.companyId
      }).select('settings.allowCancel settings.cancellationMinNoticeMinutes');
      if (calendar?.settings?.allowCancel === false) {
        throw badRequest('Este calendario no permite cancelar citas');
      }
      const minimum = Number(calendar?.settings?.cancellationMinNoticeMinutes || 0);
      if (
        minimum > 0 &&
        appointment.startAt.getTime() - Date.now() < minimum * 60000
      ) {
        throw badRequest(
          `La cancelacion requiere al menos ${minimum} minutos de anticipacion`
        );
      }
    }
    appointment.status = status;
    appointment.updatedBy = actor._id;
    if (status === 'cancelled') {
      appointment.cancelledAt = new Date();
      appointment.cancelledBy = actor._id;
      appointment.cancellationReason = reason || '';
    }
    await appointment.save();
    const typeByStatus = {
      confirmed: 'appointment_confirmed',
      completed: 'appointment_completed',
      cancelled: 'appointment_cancelled',
      no_show: 'appointment_no_show',
      rescheduled: 'appointment_rescheduled'
    };
    await activity({
      actor,
      companyId: appointment.companyId,
      distributorId: appointment.distributorId,
      type: typeByStatus[status] || 'appointment_updated',
      summary: `Cita ${status}: ${appointment.title}`,
      metadata: {
        appointmentId: appointment._id,
        contactId: appointment.contactId,
        opportunityId: appointment.opportunityId,
        reason
      }
    });
    if (['cancelled', 'no_show'].includes(status)) {
      await NotificationService.create({
        companyId: appointment.companyId,
        distributorId: appointment.distributorId,
        userId: appointment.assignedTo,
        type: status === 'cancelled' ? 'appointment_cancelled' : 'appointment_no_show',
        title: status === 'cancelled' ? 'Cita cancelada' : 'Cita marcada como no show',
        body: appointment.title,
        relatedType: 'appointment',
        relatedId: appointment._id
      });
    }
    RealtimeService.publish('appointment.status_updated', {
      companyId: appointment.companyId,
      assignedTo: appointment.assignedTo,
      data: { appointmentId: appointment._id, status }
    });
    return populatedAppointment(Appointment.findById(appointment._id));
  }

  static async reschedule({ actor, appointment, body }) {
    if (!BLOCKING_STATUSES.includes(appointment.status)) {
      throw badRequest('Solo se pueden reprogramar citas scheduled o confirmed');
    }
    const calendar = await Calendar.findOne({
      _id: appointment.calendarId,
      companyId: appointment.companyId
    }).select('settings.allowReschedule settings.rescheduleMinNoticeMinutes');
    if (calendar?.settings?.allowReschedule === false) {
      throw badRequest('Este calendario no permite reprogramar citas');
    }
    const minimum = Number(calendar?.settings?.rescheduleMinNoticeMinutes || 0);
    if (
      minimum > 0 &&
      appointment.startAt.getTime() - Date.now() < minimum * 60000
    ) {
      throw badRequest(
        `La reprogramacion requiere al menos ${minimum} minutos de anticipacion`
      );
    }
    const durationMs = appointment.endAt.getTime() - appointment.startAt.getTime();
    const nextStartAt = parseDate(body.startAt, 'startAt');
    const nextEndAt = body.endAt
      ? parseDate(body.endAt, 'endAt')
      : new Date(nextStartAt.getTime() + durationMs);
    const previousStatus = appointment.status;
    appointment.status = 'rescheduled';
    appointment.updatedBy = actor._id;
    await appointment.save();
    let next;
    try {
      next = await this.createAppointment({
        actor,
        companyId: appointment.companyId,
        distributorId: appointment.distributorId,
        body: {
          calendarId: appointment.calendarId,
          contactId: appointment.contactId,
          opportunityId: appointment.opportunityId,
          conversationId: appointment.conversationId,
          bookingLinkId: appointment.bookingLinkId,
          assignedTo: body.assignedTo || appointment.assignedTo,
          title: body.title || appointment.title,
          description:
            body.description === undefined ? appointment.description : body.description,
          startAt: nextStartAt,
          endAt: nextEndAt,
          timezone: body.timezone || appointment.timezone,
          location: body.location || appointment.location?.toObject?.() || appointment.location,
          status: 'scheduled',
          rescheduledFrom: appointment._id,
          attribution: appointment.attribution?.toObject?.() || appointment.attribution,
          metadata: {
            ...(appointment.metadata || {}),
            ...(body.metadata || {}),
            rescheduledReason: body.reason || ''
          }
        },
        source: appointment.source
      });
    } catch (error) {
      appointment.status = previousStatus;
      await appointment.save();
      throw error;
    }
    await activity({
      actor,
      companyId: appointment.companyId,
      distributorId: appointment.distributorId,
      type: 'appointment_rescheduled',
      summary: `Cita reprogramada: ${appointment.title}`,
      metadata: {
        appointmentId: appointment._id,
        nextAppointmentId: next._id,
        contactId: appointment.contactId,
        opportunityId: appointment.opportunityId,
        reason: body.reason || ''
      }
    });
    await NotificationService.create({
      companyId: appointment.companyId,
      distributorId: appointment.distributorId,
      userId: next.assignedTo?._id || next.assignedTo,
      type: 'appointment_rescheduled',
      title: 'Cita reprogramada',
      body: next.title,
      relatedType: 'appointment',
      relatedId: next._id,
      metadata: { previousAppointmentId: appointment._id }
    });
    RealtimeService.publish('appointment.status_updated', {
      companyId: appointment.companyId,
      assignedTo: appointment.assignedTo,
      data: { appointmentId: appointment._id, status: 'rescheduled' }
    });
    return {
      previous: await populatedAppointment(Appointment.findById(appointment._id)),
      appointment: next
    };
  }

  static sanitizeAllowedFields(fields) {
    return [...new Set((fields || []).filter((field) => PUBLIC_FIELDS.includes(field)))];
  }
}
