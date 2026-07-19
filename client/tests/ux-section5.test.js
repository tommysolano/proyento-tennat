import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getSidebarGroups,
  isSidebarItemActive
} from '../src/layouts/sidebarItems.js';

const fullAccess = {
  permissions: [
    'activity:read_self',
    'activity:read_team',
    'calendars:manage',
    'calendars:read_assigned',
    'calendars:read_team',
    'channel_configs:manage',
    'company_billing:read',
    'contacts:manage',
    'contacts:read_assigned',
    'contacts:read_team',
    'conversations:read',
    'conversations:read_assigned',
    'conversations:read_team',
    'coupons:issue_assigned',
    'coupons:issue_team',
    'coupons:manage',
    'forms:manage',
    'forms:read',
    'forms:read_team',
    'funnels:manage',
    'funnels:read_team',
    'landing_pages:manage',
    'message_templates:manage',
    'message_templates:read',
    'message_templates:use',
    'notifications:read',
    'opportunities:manage',
    'opportunities:read_assigned',
    'opportunities:read_team',
    'pipelines:manage',
    'referrals:manage',
    'referrals:read_team',
    'reputation:manage',
    'review_requests:create_assigned',
    'review_requests:create_team',
    'review_requests:manage',
    'review_widgets:manage',
    'reviews:manage',
    'reviews:read_assigned',
    'reviews:read_team',
    'routing_rules:manage',
    'routing_rules:read',
    'surveys:manage',
    'tasks:create_team',
    'tasks:manage',
    'tasks:read_assigned',
    'testimonials:manage',
    'workflow_runs:read',
    'workflow_runs:read_team',
    'workflows:read',
    'workflows:read_team'
  ],
  modules: [
    'automations',
    'billing',
    'calendar',
    'contacts',
    'conversations',
    'coupons',
    'crm',
    'forms',
    'funnels',
    'inbox',
    'landing_pages',
    'loyalty',
    'notifications',
    'opportunities',
    'referrals',
    'reputation',
    'reviews',
    'surveys',
    'tasks',
    'testimonials',
    'workflows'
  ]
};

function labelsFor(role, access = fullAccess) {
  return getSidebarGroups(role, access).flatMap((group) =>
    group.items.map((item) => item.label)
  );
}

test('sidebar follows the workflow order for platform and distributor roles', () => {
  assert.deepEqual(
    getSidebarGroups('SUPERADMIN', fullAccess).map((group) => group.label),
    ['Inicio', 'Plataforma', 'Operacion global']
  );
  assert.deepEqual(
    getSidebarGroups('DISTRIBUTOR', fullAccess).map((group) => group.label),
    ['Inicio', 'Empresas y clientes', 'Comercial', 'Facturacion', 'Configuracion']
  );
  assert.deepEqual(labelsFor('SUPERADMIN').slice(0, 4), [
    'Dashboard',
    'Distribuidores',
    'Planes de plataforma',
    'Modulos'
  ]);
});

test('admin, supervisor and call center only receive their role navigation', () => {
  assert.deepEqual(
    getSidebarGroups('ADMIN', fullAccess).map((group) => group.label),
    [
      'Inicio',
      'Inbox y comunicacion',
      'CRM',
      'Calendario y reservas',
      'Automatizacion',
      'Marketing',
      'Reputacion',
      'Administracion'
    ]
  );
  assert.equal(labelsFor('SUPERVISOR').includes('Canales'), false);
  assert.equal(labelsFor('SUPERVISOR').includes('Roles y permisos'), false);
  assert.equal(labelsFor('CALLCENTER').includes('Workflows'), false);
  assert.equal(labelsFor('CALLCENTER').includes('Configuracion'), false);
});

test('sidebar removes options when effective modules are unavailable', () => {
  const restrictedAccess = {
    permissions: fullAccess.permissions,
    modules: ['core']
  };
  const labels = labelsFor('ADMIN', restrictedAccess);

  assert.equal(labels.includes('Conversaciones'), false);
  assert.equal(labels.includes('Contactos'), false);
  assert.equal(labels.includes('Formularios'), false);
  assert.equal(labels.includes('Facturacion'), false);
  assert.equal(labels.includes('Dashboard'), true);
  assert.equal(labels.includes('Usuarios'), true);
});

test('active menu state distinguishes dashboard anchors and query views', () => {
  assert.equal(
    isSidebarItemActive('/admin/dashboard#permisos', {
      pathname: '/admin/dashboard',
      search: '',
      hash: '#permisos'
    }),
    true
  );
  assert.equal(
    isSidebarItemActive('/admin/dashboard', {
      pathname: '/admin/dashboard',
      search: '',
      hash: '#permisos'
    }),
    false
  );
  assert.equal(
    isSidebarItemActive('/calendar?view=list', {
      pathname: '/calendar',
      search: '?view=list',
      hash: ''
    }),
    true
  );
});

test('private layout keeps sidebar, header and content scroll independent', () => {
  const layout = readFileSync(new URL('../src/layouts/Layout.jsx', import.meta.url), 'utf8');
  const sidebar = readFileSync(new URL('../src/layouts/Sidebar.jsx', import.meta.url), 'utf8');
  const hashScroll = readFileSync(
    new URL('../src/components/HashScroll.jsx', import.meta.url),
    'utf8'
  );

  assert.match(layout, /h-dvh overflow-hidden/);
  assert.match(layout, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(sidebar, /h-dvh/);
  assert.match(sidebar, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(hashScroll, /getElementById\('main-content'\)/);
});

test('delegated session, retry states and important forms remain visible', () => {
  const header = readFileSync(new URL('../src/layouts/Header.jsx', import.meta.url), 'utf8');
  const asyncState = readFileSync(new URL('../src/components/AsyncState.jsx', import.meta.url), 'utf8');
  // El panel del distribuidor se dividio en subrutas: el formulario de plan
  // vive ahora en su propia seccion.
  const distributor = readFileSync(
    new URL(
      '../src/pages/distributor/sections/DistributorPlansSection.jsx',
      import.meta.url
    ),
    'utf8'
  );
  const admin = readFileSync(
    new URL('../src/pages/admin/AdminDashboard.jsx', import.meta.url),
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
  const calendar = readFileSync(
    new URL('../src/pages/calendar/CalendarSettingsPage.jsx', import.meta.url),
    'utf8'
  );
  const workflows = readFileSync(
    new URL('../src/pages/workflows/WorkflowsPage.jsx', import.meta.url),
    'utf8'
  );
  const calendarPage = readFileSync(
    new URL('../src/pages/calendar/CalendarPage.jsx', import.meta.url),
    'utf8'
  );
  const forms = readFileSync(
    new URL('../src/pages/marketing/FormsPage.jsx', import.meta.url),
    'utf8'
  );
  const landings = readFileSync(
    new URL('../src/pages/marketing/LandingPagesPage.jsx', import.meta.url),
    'utf8'
  );
  const funnels = readFileSync(
    new URL('../src/pages/marketing/FunnelsPage.jsx', import.meta.url),
    'utf8'
  );

  assert.match(header, /Acceso delegado/);
  // La accion de cerrar la delegacion sigue visible; solo cambio el copy.
  assert.match(header, /Volver a mi sesion/);
  assert.match(header, /returnToOriginalSession/);
  assert.match(asyncState, /Reintentar/);
  assert.match(distributor, /htmlFor="plan-name"/);
  assert.match(distributor, /title="Limites operativos"/);
  assert.match(admin, /htmlFor="team-user-email"/);
  assert.match(admin, /title="Configurar permisos"/);
  assert.match(admin, /ModuleUnavailableState/);
  assert.match(contacts, /htmlFor="crm-contact-name"/);
  assert.match(contacts, /CrmLoadError message=\{loadError\} onRetry=\{load\}/);
  assert.match(contacts, /htmlFor="contacts-filter-search"/);
  assert.match(opportunities, /htmlFor="opportunity-title"/);
  assert.match(opportunities, /htmlFor="opportunities-filter-pipeline"/);
  assert.match(calendar, /htmlFor="calendar-create-timezone"/);
  assert.match(calendarPage, /htmlFor="calendar-filter-calendar"/);
  assert.match(calendarPage, /CrmLoadError message=\{loadError\} onRetry=\{load\}/);
  assert.match(workflows, /title="5\. Prueba segura"/);
  assert.match(workflows, /htmlFor="workflows-filter-trigger"/);
  assert.match(workflows, /CrmLoadError message=\{loadError\} onRetry=\{load\}/);
  assert.match(forms, /title="1\. Definicion"/);
  assert.match(forms, /title="4\. Resultado publico"/);
  assert.match(landings, /title="1\. Pagina y SEO"/);
  assert.match(landings, /title="3\. Asociaciones y estilo"/);
  assert.match(funnels, /title="1\. Informacion del funnel"/);
  assert.match(funnels, /title="2\. Pasos"/);
  assert.match(funnels, /htmlFor="funnel-builder-entry-step"/);
});
