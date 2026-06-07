import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { hasPermission } from '../src/core/permissions/permissions.js';
import { MODULE_REGISTRY } from '../src/core/modules/moduleRegistry.js';
import { Appointment } from '../src/models/Appointment.js';
import { AvailabilityException } from '../src/models/AvailabilityException.js';
import { Calendar } from '../src/models/Calendar.js';
import { Job } from '../src/models/Job.js';
import { Notification } from '../src/models/Notification.js';
import {
  CalendarService,
  buildCandidateSlots
} from '../src/modules/calendar/CalendarService.js';
import {
  addDaysToDateKey,
  dateKeyInZone,
  overlaps,
  zonedDateTimeToUtc
} from '../src/modules/calendar/calendarTime.js';

const objectId = () => new mongoose.Types.ObjectId();

test('calendar time converts tenant-local values to UTC and preserves date keys', () => {
  const utc = zonedDateTimeToUtc(
    '2026-06-07',
    '09:30',
    'America/Guayaquil'
  );
  assert.equal(utc.toISOString(), '2026-06-07T14:30:00.000Z');
  assert.equal(dateKeyInZone(utc, 'America/Guayaquil'), '2026-06-07');
  assert.equal(addDaysToDateKey('2028-02-28', 1), '2028-02-29');
  assert.equal(
    overlaps(
      new Date('2026-06-07T10:00:00Z'),
      new Date('2026-06-07T11:00:00Z'),
      new Date('2026-06-07T10:30:00Z'),
      new Date('2026-06-07T11:30:00Z')
    ),
    true
  );
});

test('candidate slots honor weekly rules, partial exceptions and intervals', () => {
  const originalNow = Date.now;
  Date.now = () => new Date('2026-06-07T12:00:00.000Z').getTime();
  try {
    const calendar = {
      timezone: 'America/Guayaquil',
      settings: {
        minNoticeMinutes: 0,
        maxDaysInAdvance: 30,
        slotIntervalMinutes: 30
      }
    };
    const slots = buildCandidateSlots(
      [
        {
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '11:00',
          timezone: 'America/Guayaquil'
        }
      ],
      [
        {
          date: '2026-06-08',
          type: 'unavailable',
          startTime: '09:30',
          endTime: '10:30'
        }
      ],
      new Date('2026-06-08T05:00:00.000Z'),
      new Date('2026-06-09T05:00:00.000Z'),
      calendar,
      objectId(),
      30
    );
    assert.deepEqual(
      slots.map((slot) => slot.startAt.toISOString()),
      ['2026-06-08T14:00:00.000Z', '2026-06-08T15:30:00.000Z']
    );
  } finally {
    Date.now = originalNow;
  }
});

test('calendar and availability schemas reject invalid scheduling data', async () => {
  const companyId = objectId();
  const userId = objectId();
  const calendar = new Calendar({
    companyId,
    name: 'Ventas',
    slug: 'ventas',
    ownerUserId: userId,
    createdBy: userId
  });
  await calendar.validate();
  assert.equal(calendar.settings.appointmentDurationMinutes, 30);
  assert.equal(calendar.settings.preventOverlaps, true);
  assert.equal(calendar.settings.maxDaysInAdvance, 60);
  assert.equal(calendar.settings.locationType, 'none');

  const exception = new AvailabilityException({
    companyId,
    calendarId: calendar._id,
    date: '2026-02-30'
  });
  await assert.rejects(exception.validate(), /YYYY-MM-DD valida/);
});

test('appointment schema protects ranges and calendar service sanitizes slugs and fields', async () => {
  const id = objectId();
  const appointment = new Appointment({
    companyId: id,
    calendarId: objectId(),
    assignedTo: objectId(),
    title: 'Demo',
    startAt: new Date('2026-07-01T15:00:00.000Z'),
    endAt: new Date('2026-07-01T14:00:00.000Z'),
    timezone: 'America/Guayaquil',
    createdBy: objectId()
  });
  await assert.rejects(appointment.validate(), /posterior/);
  assert.equal(CalendarService.slugify('  Reunión Comercial  '), 'reunion-comercial');
  assert.deepEqual(
    CalendarService.sanitizeAllowedFields(['name', 'email', 'admin', 'email']),
    ['name', 'email']
  );
});

test('phase 7 permissions and modules preserve role boundaries', () => {
  assert.equal(hasPermission('ADMIN', 'calendars:manage'), true);
  assert.equal(hasPermission('ADMIN', 'booking_links:manage'), true);
  assert.equal(hasPermission('ADMIN', 'availability:manage'), true);
  assert.equal(hasPermission('SUPERVISOR', 'appointments:manage_team'), true);
  assert.equal(hasPermission('SUPERVISOR', 'appointments:read_team'), true);
  assert.equal(hasPermission('CALLCENTER', 'appointments:manage_assigned'), true);
  assert.equal(hasPermission('CALLCENTER', 'appointments:update_assigned'), true);
  assert.equal(hasPermission('CALLCENTER', 'calendars:manage'), false);
  assert.equal(hasPermission('SUPERVISOR', 'booking_links:manage'), false);
  for (const key of ['calendar', 'bookings']) {
    const module = MODULE_REGISTRY.find((item) => item.key === key);
    assert.equal(module?.status, 'active');
    assert.equal(module?.enabledByDefault, true);
  }
});

test('appointment reminder jobs and appointment notifications are valid schema values', async () => {
  const companyId = objectId();
  const userId = objectId();
  await new Job({
    type: 'appointment.reminder',
    payload: { appointmentId: objectId() },
    companyId
  }).validate();
  await new Notification({
    companyId,
    userId,
    type: 'appointment_upcoming',
    title: 'Cita proxima'
  }).validate();
});
