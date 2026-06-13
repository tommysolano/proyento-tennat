import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('calendar settings expose profiles, capacity, booking rules and controlled states', () => {
  const page = readFileSync(
    new URL('../src/pages/calendar/CalendarSettingsPage.jsx', import.meta.url),
    'utf8'
  );
  assert.match(page, /getCalendarProfiles/);
  assert.match(page, /applyCalendarProfile/);
  assert.match(page, /confirmOverwrite|window\.confirm/);
  assert.match(page, /capacityPerSlot/);
  assert.match(page, /initialAppointmentStatus/);
  assert.match(page, /clientFields/);
  assert.match(page, /CrmLoadError message=\{loadError\} onRetry=\{load\}/);
});

test('calendar page renders analytics, Spanish statuses and retry handling', () => {
  const page = readFileSync(
    new URL('../src/pages/calendar/CalendarPage.jsx', import.meta.url),
    'utf8'
  );
  const analytics = readFileSync(
    new URL('../src/components/AppointmentAnalyticsPanel.jsx', import.meta.url),
    'utf8'
  );
  assert.match(page, /getAppointmentAnalytics/);
  assert.match(page, /Programada/);
  assert.match(page, /No asistio/);
  assert.match(analytics, /Dia de contacto frente al dia reservado/);
  assert.match(analytics, /averageLeadDays/);
  assert.match(analytics, /CrmLoadError/);
});

test('public booking forwards marketing context and renders configured fields', () => {
  const page = readFileSync(
    new URL('../src/pages/calendar/PublicBookingPage.jsx', import.meta.url),
    'utf8'
  );
  assert.match(page, /publicMarketingContext/);
  assert.match(page, /publicMarketingQuery/);
  assert.match(page, /link\.calendar\.clientFields/);
  assert.match(page, /remainingCapacity/);
  assert.match(page, /Reintentar/);
});
