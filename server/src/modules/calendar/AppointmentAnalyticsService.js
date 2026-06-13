import { Appointment } from '../../models/Appointment.js';
import { Calendar } from '../../models/Calendar.js';
import { Contact } from '../../models/Contact.js';
import { Conversation } from '../../models/Conversation.js';
import { Message } from '../../models/Message.js';
import { User } from '../../models/User.js';
import { assignedResourceScope } from '../../utils/crmScope.js';
import { dateKeyInZone, parseDate } from './calendarTime.js';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const MAX_RANGE_DAYS = 366;
const MAX_APPOINTMENTS = 10000;

function valueId(value) {
  return value?._id || value || null;
}

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function dayIndex(date, timeZone) {
  const key = dateKeyInZone(date, timeZone);
  return new Date(`${key}T12:00:00.000Z`).getUTCDay();
}

function timeBand(date, timeZone) {
  const hour = Number(localParts(date, timeZone).hour);
  if (hour < 12) return 'manana';
  if (hour < 18) return 'tarde';
  return 'noche';
}

function calendarDayDifference(from, to, timeZone) {
  const start = new Date(`${dateKeyInZone(from, timeZone)}T00:00:00.000Z`);
  const end = new Date(`${dateKeyInZone(to, timeZone)}T00:00:00.000Z`);
  return Math.max(0, Math.round((end - start) / 86400000));
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function sortedCounts(map, labelKey = 'label') {
  return [...map.entries()]
    .map(([label, count]) => ({ [labelKey]: label, count }))
    .sort((a, b) => b.count - a.count || String(a[labelKey]).localeCompare(String(b[labelKey])));
}

export function buildBookingBehaviorRows(appointments, contactDates, timeZone) {
  const groups = new Map();
  for (const appointment of appointments) {
    const contactDate = contactDates.get(String(appointment._id)) || appointment.createdAt;
    if (!contactDate || !appointment.startAt) continue;
    const contactDay = DAY_NAMES[dayIndex(new Date(contactDate), timeZone)];
    const reservationDay = DAY_NAMES[dayIndex(new Date(appointment.startAt), timeZone)];
    const band = timeBand(new Date(appointment.startAt), timeZone);
    const leadDays = calendarDayDifference(
      new Date(contactDate),
      new Date(appointment.startAt),
      timeZone
    );
    const key = `${contactDay}|${reservationDay}|${band}`;
    const current = groups.get(key) || {
      contactDay,
      reservationDay,
      timeBand: band,
      count: 0,
      totalLeadDays: 0
    };
    current.count += 1;
    current.totalLeadDays += leadDays;
    groups.set(key, current);
  }
  return [...groups.values()]
    .map(({ totalLeadDays, ...row }) => ({
      ...row,
      averageLeadDays: Number((totalLeadDays / row.count).toFixed(1))
    }))
    .sort((a, b) => b.count - a.count);
}

function reportRange(query = {}) {
  const now = new Date();
  const from = parseDate(query.from || new Date(now.getTime() - 30 * 86400000), 'from');
  const to = parseDate(query.to || now, 'to');
  if (to < from) throw Object.assign(new Error('to debe ser posterior a from'), { status: 400 });
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86400000) {
    throw Object.assign(new Error(`El rango no puede superar ${MAX_RANGE_DAYS} dias`), {
      status: 400
    });
  }
  return { from, to };
}

export class AppointmentAnalyticsService {
  static async report({ user, query = {}, timeZone = 'America/Guayaquil' }) {
    const { from, to } = reportRange(query);
    const scope = await assignedResourceScope(user);
    if (query.calendarId) scope.calendarId = query.calendarId;
    if (query.assignedTo) {
      const requested = String(query.assignedTo);
      const current = scope.assignedTo;
      const allowed =
        !current ||
        String(current) === requested ||
        current.$in?.some((id) => String(id) === requested);
      scope.assignedTo = allowed ? query.assignedTo : { $in: [] };
    }
    const items = await Appointment.find({
      ...scope,
      startAt: { $gte: from, $lte: to }
    })
      .select(
        'calendarId contactId assignedTo status source startAt createdAt conversationId bookingLinkId attribution metadata rescheduledFrom'
      )
      .sort({ startAt: 1 })
      .limit(MAX_APPOINTMENTS + 1)
      .lean();
    const truncated = items.length > MAX_APPOINTMENTS;
    const appointments = items.slice(0, MAX_APPOINTMENTS);

    const calendarIds = [...new Set(appointments.map((item) => String(item.calendarId)).filter(Boolean))];
    const userIds = [...new Set(appointments.map((item) => String(item.assignedTo)).filter(Boolean))];
    const contactIds = [...new Set(appointments.map((item) => String(item.contactId)).filter(Boolean))];
    const conversationIds = [
      ...new Map(
        appointments
          .map((item) => item.conversationId || item.metadata?.conversationId)
          .filter(Boolean)
          .map((id) => [String(id), id])
      ).values()
    ];
    const [calendars, users, contacts, conversations, firstMessages] = await Promise.all([
      Calendar.find({ _id: { $in: calendarIds }, companyId: user.companyId }).select('name').lean(),
      User.find({ _id: { $in: userIds }, companyId: user.companyId }).select('name').lean(),
      Contact.find({ _id: { $in: contactIds }, companyId: user.companyId })
        .select('createdAt attribution.firstInteractionAt')
        .lean(),
      Conversation.find({ _id: { $in: conversationIds }, companyId: user.companyId })
        .select('createdAt')
        .lean(),
      Message.aggregate([
        {
          $match: {
            companyId: user.companyId,
            conversationId: { $in: conversationIds },
            direction: 'inbound'
          }
        },
        { $sort: { createdAt: 1 } },
        { $group: { _id: '$conversationId', createdAt: { $first: '$createdAt' } } }
      ])
    ]);

    const calendarNames = new Map(calendars.map((item) => [String(item._id), item.name]));
    const userNames = new Map(users.map((item) => [String(item._id), item.name]));
    const contactMap = new Map(contacts.map((item) => [String(item._id), item]));
    const conversationMap = new Map(conversations.map((item) => [String(item._id), item]));
    const firstMessageMap = new Map(firstMessages.map((item) => [String(item._id), item.createdAt]));
    const contactDates = new Map();
    const byWeekday = new Map();
    const byDate = new Map();
    const byHour = new Map();
    const byCalendar = new Map();
    const byStatus = new Map();
    const byAssignee = new Map();
    const byChannel = new Map();
    const byCampaign = new Map();

    for (const appointment of appointments) {
      const startAt = new Date(appointment.startAt);
      increment(byWeekday, DAY_NAMES[dayIndex(startAt, timeZone)]);
      increment(byDate, dateKeyInZone(startAt, timeZone));
      increment(byHour, `${String(localParts(startAt, timeZone).hour).padStart(2, '0')}:00`);
      increment(byCalendar, calendarNames.get(String(appointment.calendarId)) || 'Calendario eliminado');
      increment(byStatus, appointment.status || 'sin_estado');
      increment(byAssignee, userNames.get(String(appointment.assignedTo)) || 'Sin responsable');
      increment(
        byChannel,
        appointment.attribution?.entryChannel ||
          appointment.attribution?.channel ||
          appointment.source ||
          'sin_origen'
      );
      increment(
        byCampaign,
        appointment.attribution?.campaignName ||
          appointment.attribution?.utmCampaign ||
          'sin_campana'
      );

      const conversationId = appointment.conversationId || appointment.metadata?.conversationId;
      const contact = contactMap.get(String(appointment.contactId));
      const contactDate =
        firstMessageMap.get(String(conversationId)) ||
        conversationMap.get(String(conversationId))?.createdAt ||
        contact?.attribution?.firstInteractionAt ||
        contact?.createdAt ||
        appointment.createdAt;
      contactDates.set(String(appointment._id), contactDate);
    }

    return {
      range: { from, to, timeZone },
      total: appointments.length,
      truncated,
      byWeekday: sortedCounts(byWeekday, 'day'),
      byDate: sortedCounts(byDate, 'date').sort((a, b) => a.date.localeCompare(b.date)),
      byHour: sortedCounts(byHour, 'hour').sort((a, b) => a.hour.localeCompare(b.hour)),
      byCalendar: sortedCounts(byCalendar, 'calendar'),
      byStatus: sortedCounts(byStatus, 'status'),
      byAssignee: sortedCounts(byAssignee, 'assignee'),
      byChannel: sortedCounts(byChannel, 'channel'),
      byCampaign: sortedCounts(byCampaign, 'campaign'),
      cancelled: appointments.filter((item) => item.status === 'cancelled').length,
      rescheduled: appointments.filter(
        (item) => item.status === 'rescheduled' || valueId(item.rescheduledFrom)
      ).length,
      behavior: buildBookingBehaviorRows(appointments, contactDates, timeZone),
      precision:
        'La fecha de contacto usa primer mensaje entrante, conversacion, first touch, creacion del contacto y creacion de la cita, en ese orden.'
    };
  }
}
