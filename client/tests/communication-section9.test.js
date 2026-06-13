import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('contact detail and inbox expose controlled DND and consent states', () => {
  const contact = readFileSync(
    new URL('../src/pages/crm/ContactDetailPage.jsx', import.meta.url),
    'utf8'
  );
  const card = readFileSync(
    new URL('../src/components/CommunicationPreferencesCard.jsx', import.meta.url),
    'utf8'
  );
  const inbox = readFileSync(
    new URL('../src/pages/inbox/InboxPage.jsx', import.meta.url),
    'utf8'
  );
  assert.match(contact, /CommunicationPreferencesCard/);
  assert.match(card, /DND global/);
  assert.match(card, /opted_out/);
  assert.match(card, /No enviar WhatsApp/);
  assert.match(inbox, /evaluateCommunicationPolicy/);
  assert.match(inbox, /communicationLoading/);
  assert.match(inbox, /reasonMessage/);
  assert.match(inbox, /Reintentar/);
  assert.match(inbox, /Nota interna/);
});

test('public forms and booking render channel-specific unchecked consent fields', () => {
  const forms = readFileSync(
    new URL('../src/pages/marketing/FormsPage.jsx', import.meta.url),
    'utf8'
  );
  const booking = readFileSync(
    new URL('../src/pages/calendar/PublicBookingPage.jsx', import.meta.url),
    'utf8'
  );
  const settings = readFileSync(
    new URL('../src/pages/calendar/CalendarSettingsPage.jsx', import.meta.url),
    'utf8'
  );
  assert.match(forms, /consentChannel/);
  assert.match(forms, /Canal autorizado/);
  assert.match(booking, /link\.consentRequests/);
  assert.match(booking, /consent_/);
  assert.doesNotMatch(booking, /defaultChecked.*consent_/);
  assert.match(settings, /Consentimientos comerciales opcionales/);
});

test('communication settings provide quiet hours, suppression and report states', () => {
  const page = readFileSync(
    new URL('../src/pages/inbox/CommunicationSettingsPage.jsx', import.meta.url),
    'utf8'
  );
  const routes = readFileSync(
    new URL('../src/routes/AppRoutes.jsx', import.meta.url),
    'utf8'
  );
  assert.match(page, /Horario silencioso activo/);
  assert.match(page, /Lista de supresion/);
  assert.match(page, /Reporte basico/);
  assert.match(page, /CrmLoadError/);
  assert.match(page, /No hay datos de consentimiento/);
  assert.match(routes, /inbox\/communication-policy/);
});

test('CRM list supports DND and consent filters and columns', () => {
  const contacts = readFileSync(
    new URL('../src/pages/crm/ContactsPage.jsx', import.meta.url),
    'utf8'
  );
  assert.match(contacts, /contacts-filter-dnd/);
  assert.match(contacts, /contacts-filter-consent-channel/);
  assert.match(contacts, /contacts-filter-consent-status/);
  assert.match(contacts, /preferredChannel/);
  assert.match(contacts, /allowDnd/);
  assert.match(contacts, /contactDndStatus/);
});
