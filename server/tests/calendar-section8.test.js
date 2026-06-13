import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import mongoose from 'mongoose';
import { hasPermission } from '../src/core/permissions/permissions.js';
import { Appointment } from '../src/models/Appointment.js';
import { Calendar } from '../src/models/Calendar.js';
import {
  buildBookingBehaviorRows
} from '../src/modules/calendar/AppointmentAnalyticsService.js';
import {
  assertProfileOverwriteConfirmed,
  getCalendarProfile,
  profileCalendarPayload
} from '../src/modules/calendar/calendarProfiles.js';
import { slotCapacityState } from '../src/modules/calendar/CalendarService.js';
import { WORKFLOW_TRIGGERS } from '../src/modules/workflows/workflowCatalog.js';

const objectId = () => new mongoose.Types.ObjectId();

test('required quick profiles expose editable medicine and automotive defaults', () => {
  const medicine = profileCalendarPayload('medicine');
  const automotive = profileCalendarPayload('automotive_service');
  assert.equal(medicine.settings.appointmentDurationMinutes, 30);
  assert.equal(medicine.settings.reminderMinutesBefore, 1440);
  assert.equal(
    medicine.settings.clientFields.some((field) => field.key === 'consultationReason'),
    true
  );
  assert.equal(automotive.settings.appointmentDurationMinutes, 60);
  assert.equal(
    automotive.settings.clientFields.some((field) => field.key === 'licensePlate'),
    true
  );
  assert.equal(getCalendarProfile('sports_courts').settings.capacityPerSlot, 1);
});

test('profile application requires an explicit overwrite confirmation', () => {
  assert.throws(
    () => assertProfileOverwriteConfirmed(false),
    (error) =>
      error.status === 409 &&
      error.code === 'PROFILE_OVERWRITE_CONFIRMATION_REQUIRED'
  );
  assert.doesNotThrow(() => assertProfileOverwriteConfirmed(true));
});

test('calendar settings validate capacity, initial status and client fields', async () => {
  const userId = objectId();
  const calendar = new Calendar({
    companyId: objectId(),
    name: 'Consultas',
    slug: 'consultas',
    ownerUserId: userId,
    createdBy: userId,
    configurationProfile: 'medicine',
    settings: {
      appointmentDurationMinutes: 45,
      slotIntervalMinutes: 45,
      capacityPerSlot: 2,
      initialAppointmentStatus: 'confirmed',
      clientFields: [
        {
          key: 'consultationReason',
          label: 'Motivo de consulta',
          type: 'textarea',
          required: true
        }
      ]
    }
  });
  await calendar.validate();
  assert.equal(calendar.settings.capacityPerSlot, 2);
  assert.equal(calendar.settings.initialAppointmentStatus, 'confirmed');
  assert.equal(calendar.settings.clientFields[0].required, true);
});

test('optional appointment ObjectIds normalize blank strings without cast failures', async () => {
  const appointment = new Appointment({
    companyId: objectId(),
    calendarId: objectId(),
    contactId: '',
    opportunityId: '',
    conversationId: '',
    bookingLinkId: '',
    assignedTo: objectId(),
    title: 'Revision',
    startAt: new Date('2027-01-01T15:00:00.000Z'),
    endAt: new Date('2027-01-01T16:00:00.000Z'),
    timezone: 'America/Guayaquil',
    createdBy: objectId()
  });
  await appointment.validate();
  assert.equal(appointment.contactId, null);
  assert.equal(appointment.opportunityId, null);
  assert.equal(appointment.conversationId, null);
  assert.equal(appointment.bookingLinkId, null);
});

test('slot capacity blocks one reservation and allows configured parallel capacity', () => {
  const calendarId = objectId();
  const assignedTo = objectId();
  const slot = {
    startAt: new Date('2027-01-01T15:00:00.000Z'),
    endAt: new Date('2027-01-01T16:00:00.000Z')
  };
  const appointments = [{
    calendarId,
    assignedTo,
    startAt: slot.startAt,
    endAt: slot.endAt
  }];
  assert.equal(
    slotCapacityState(
      appointments,
      slot,
      { _id: calendarId, settings: { capacityPerSlot: 1, preventOverlaps: true } },
      assignedTo
    ).blocked,
    true
  );
  const multiple = slotCapacityState(
    appointments,
    slot,
    { _id: calendarId, settings: { capacityPerSlot: 2, preventOverlaps: true } },
    assignedTo
  );
  assert.equal(multiple.blocked, false);
  assert.equal(multiple.available, 1);
});

test('booking behavior groups contact day, reserved day, band and lead time', () => {
  const appointment = {
    _id: objectId(),
    createdAt: new Date('2026-06-08T14:00:00.000Z'),
    startAt: new Date('2026-06-13T20:00:00.000Z')
  };
  const contactDates = new Map([
    [String(appointment._id), new Date('2026-06-08T15:00:00.000Z')]
  ]);
  const rows = buildBookingBehaviorRows(
    [appointment],
    contactDates,
    'America/Guayaquil'
  );
  assert.deepEqual(rows[0], {
    contactDay: 'Lunes',
    reservationDay: 'Sabado',
    timeBand: 'tarde',
    count: 1,
    averageLeadDays: 5
  });
});

test('calendar analytics permissions and appointment workflow events stay role scoped', () => {
  assert.equal(hasPermission('ADMIN', 'appointment_analytics:read'), true);
  assert.equal(hasPermission('ADMIN', 'calendar_profiles:apply'), true);
  assert.equal(hasPermission('SUPERVISOR', 'appointment_analytics:read_team'), true);
  assert.equal(hasPermission('CALLCENTER', 'appointment_analytics:read_assigned'), true);
  assert.equal(hasPermission('CALLCENTER', 'calendar_profiles:apply'), false);
  for (const eventType of [
    'appointment.created',
    'appointment.confirmed',
    'appointment.cancelled',
    'appointment.upcoming'
  ]) {
    assert.equal(
      WORKFLOW_TRIGGERS.some((trigger) => trigger.eventType === eventType),
      true
    );
  }
});

test('routes retain tenant scope, public attribution and controlled analytics', () => {
  const appointments = readFileSync(
    new URL('../src/routes/appointmentRoutes.js', import.meta.url),
    'utf8'
  );
  const publicBooking = readFileSync(
    new URL('../src/routes/publicBookingRoutes.js', import.meta.url),
    'utf8'
  );
  const service = readFileSync(
    new URL('../src/modules/calendar/CalendarService.js', import.meta.url),
    'utf8'
  );
  assert.match(appointments, /AppointmentAnalyticsService\.report/);
  assert.match(appointments, /appointmentAnalytics/);
  assert.match(publicBooking, /attributionFromTracking/);
  assert.match(publicBooking, /bookingFields/);
  assert.match(publicBooking, /bookingLinkId: link\._id/);
  assert.match(service, /companyId,/);
  assert.match(service, /enforceAvailability = true/);
  assert.match(service, /APPOINTMENT_CAPACITY_REACHED/);
});
