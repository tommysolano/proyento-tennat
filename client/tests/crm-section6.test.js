import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('contact and opportunity lists expose selection, bulk actions and personal columns', () => {
  const contacts = readFileSync(
    new URL('../src/pages/crm/ContactsPage.jsx', import.meta.url),
    'utf8'
  );
  const opportunities = readFileSync(
    new URL('../src/pages/crm/OpportunitiesPage.jsx', import.meta.url),
    'utf8'
  );
  const tools = readFileSync(
    new URL('../src/components/CrmCollectionTools.jsx', import.meta.url),
    'utf8'
  );

  for (const source of [contacts, opportunities]) {
    assert.match(source, /selectedIds/);
    assert.match(source, /toggleAllVisible/);
    assert.match(source, /BulkActionsBar/);
    assert.match(source, /ColumnSelector/);
    assert.match(source, /CreateCrmListForm/);
    assert.match(source, /getCrmViewPreference/);
    assert.match(source, /updateCrmViewPreference/);
  }
  assert.match(tools, /Agregar a lista/);
  assert.match(tools, /Quitar de lista/);
  assert.match(tools, /Agregar tag/);
  assert.match(tools, /Quitar tag/);
  assert.match(tools, /Asignar responsable/);
  assert.match(tools, /Cambiar estado/);
  assert.match(tools, /Esta preferencia solo afecta a tu usuario/);
});

test('CRM filters keep list, tag, assignee, source, channel and campaign visible', () => {
  const contacts = readFileSync(
    new URL('../src/pages/crm/ContactsPage.jsx', import.meta.url),
    'utf8'
  );
  const opportunities = readFileSync(
    new URL('../src/pages/crm/OpportunitiesPage.jsx', import.meta.url),
    'utf8'
  );

  assert.match(contacts, /contacts-filter-list/);
  assert.match(contacts, /contacts-filter-tag/);
  assert.match(contacts, /contacts-filter-channel/);
  assert.match(contacts, /contacts-filter-campaign/);
  assert.match(opportunities, /opportunities-filter-list/);
  assert.match(opportunities, /opportunities-filter-tag/);
  assert.match(opportunities, /opportunities-filter-assignee/);
  assert.match(opportunities, /opportunities-filter-source/);
  assert.match(opportunities, /opportunities-filter-channel/);
  assert.match(opportunities, /opportunities-filter-campaign/);
});

test('commercial relations are visible from both detail pages with controlled errors', () => {
  const contactDetail = readFileSync(
    new URL('../src/pages/crm/ContactDetailPage.jsx', import.meta.url),
    'utf8'
  );
  const opportunityDetail = readFileSync(
    new URL('../src/pages/crm/OpportunityDetailPage.jsx', import.meta.url),
    'utf8'
  );
  const relationCard = readFileSync(
    new URL('../src/components/CommercialRelationsCard.jsx', import.meta.url),
    'utf8'
  );

  assert.match(contactDetail, /getCommercialRelations\(\{ contactId: id \}\)/);
  assert.match(opportunityDetail, /getCommercialRelations\(\{ opportunityId: id \}\)/);
  assert.match(contactDetail, /CrmLoadError message=\{loadError\} onRetry=\{load\}/);
  assert.match(opportunityDetail, /CrmLoadError message=\{loadError\} onRetry=\{load\}/);
  assert.match(relationCard, /Relaciones comerciales/);
  assert.match(relationCard, /Contacto principal/);
  assert.match(relationCard, /No hay relaciones comerciales registradas/);
});

test('tag management and API calls preserve entity scope', () => {
  const adminPages = readFileSync(
    new URL('../src/pages/crm/CrmAdminPages.jsx', import.meta.url),
    'utf8'
  );
  const contacts = readFileSync(
    new URL('../src/pages/crm/ContactsPage.jsx', import.meta.url),
    'utf8'
  );
  const opportunities = readFileSync(
    new URL('../src/pages/crm/OpportunitiesPage.jsx', import.meta.url),
    'utf8'
  );

  assert.match(adminPages, /name="scope"/);
  assert.match(adminPages, /value="contact"/);
  assert.match(adminPages, /value="opportunity"/);
  assert.match(contacts, /getTags\('contact'\)/);
  assert.match(opportunities, /getTags\('opportunity'\)/);
});
