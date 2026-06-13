import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CalendarDays,
  CirclePlay,
  ContactRound,
  CreditCard,
  FileText,
  Filter,
  Gauge,
  GitBranch,
  Headphones,
  KanbanSquare,
  LayoutTemplate,
  ListChecks,
  ListPlus,
  ListTodo,
  MessageSquare,
  Palette,
  Quote,
  Radio,
  ReceiptText,
  Route,
  Send,
  ServerCog,
  Settings,
  ShieldCheck,
  Share2,
  Star,
  Tags,
  TicketPercent,
  UsersRound
} from 'lucide-react';
import { canAccessPath } from '../utils/access.js';

export const sidebarGroupsByRole = {
  SUPERADMIN: [
    {
      id: 'inicio',
      label: 'Inicio',
      items: [{ label: 'Dashboard', icon: Gauge, to: '/superadmin' }]
    },
    {
      id: 'plataforma',
      label: 'Plataforma',
      items: [
        { label: 'Distribuidores', icon: Building2, to: '/superadmin/distributors' },
        { label: 'Planes de plataforma', icon: CreditCard, to: '/superadmin/platform-plans' },
        { label: 'Modulos', icon: Boxes, to: '/superadmin/modules' },
        { label: 'Suscripciones', icon: ReceiptText, to: '/superadmin/subscriptions' },
        { label: 'Facturacion', icon: FileText, to: '/superadmin/billing' }
      ]
    },
    {
      id: 'operacion-global',
      label: 'Operacion global',
      kind: 'settings',
      items: [
        { label: 'Operaciones', icon: ServerCog, to: '/ops' },
        { label: 'Auditoria', icon: Activity, to: '/superadmin/audit' }
      ]
    }
  ],
  DISTRIBUTOR: [
    {
      id: 'inicio',
      label: 'Inicio',
      items: [{ label: 'Dashboard', icon: Gauge, to: '/distributor/dashboard' }]
    },
    {
      id: 'clientes',
      label: 'Empresas y clientes',
      items: [
        { label: 'Empresas', icon: Building2, to: '/distributor/companies' },
        { label: 'Crear administrador', icon: UsersRound, to: '/distributor/dashboard#admins' }
      ]
    },
    {
      id: 'comercial',
      label: 'Comercial',
      items: [
        { label: 'Planes comerciales', icon: CreditCard, to: '/distributor/dashboard#planes' },
        { label: 'Suscripciones', icon: ReceiptText, to: '/distributor/dashboard#suscripciones' },
        { label: 'Modulos autorizados', icon: Boxes, to: '/distributor/dashboard#modulos-autorizados' }
      ]
    },
    {
      id: 'facturacion',
      label: 'Facturacion',
      items: [
        { label: 'Resumen financiero', icon: Gauge, to: '/distributor/finance' },
        { label: 'Facturas', icon: FileText, to: '/distributor/invoices' },
        { label: 'Pagos', icon: ReceiptText, to: '/distributor/payments' },
        { label: 'Mi plataforma', icon: CreditCard, to: '/distributor/dashboard#plataforma' }
      ]
    },
    {
      id: 'configuracion',
      label: 'Configuracion',
      kind: 'settings',
      items: [
        { label: 'Marca', icon: Palette, to: '/distributor/branding' },
        { label: 'Preferencias', icon: Settings, to: '/distributor/settings' },
        { label: 'Onboarding', icon: ListChecks, to: '/distributor/onboarding' }
      ]
    }
  ],
  ADMIN: [
    {
      id: 'inicio',
      label: 'Inicio',
      items: [{ label: 'Dashboard', icon: Gauge, to: '/admin/dashboard' }]
    },
    {
      id: 'comunicacion',
      label: 'Inbox y comunicacion',
      items: [
        { label: 'Conversaciones', icon: MessageSquare, to: '/inbox' },
        { label: 'Notificaciones', icon: Bell, to: '/notifications' },
        { label: 'Plantillas', icon: FileText, to: '/inbox/templates' },
        { label: 'Routing', icon: Route, to: '/inbox/routing' },
        { label: 'Canales', icon: Radio, to: '/inbox/channels' },
        { label: 'Consentimiento y DND', icon: ShieldCheck, to: '/inbox/communication-policy' }
      ]
    },
    {
      id: 'crm',
      label: 'CRM',
      items: [
        { label: 'Resumen CRM', icon: Activity, to: '/crm' },
        { label: 'Contactos', icon: ContactRound, to: '/crm/contacts' },
        { label: 'Oportunidades', icon: CreditCard, to: '/crm/opportunities' },
        { label: 'Pipeline', icon: KanbanSquare, to: '/crm/pipeline' },
        { label: 'Tareas', icon: ListTodo, to: '/crm/tasks' },
        { label: 'Segmentos', icon: Filter, to: '/crm/segments' }
      ]
    },
    {
      id: 'calendario',
      label: 'Calendario y reservas',
      items: [
        { label: 'Calendario', icon: CalendarDays, to: '/calendar' },
        { label: 'Citas', icon: CalendarDays, to: '/calendar?view=list' }
      ]
    },
    {
      id: 'automatizacion',
      label: 'Automatizacion',
      items: [
        { label: 'Workflows', icon: GitBranch, to: '/workflows' },
        { label: 'Ejecuciones', icon: CirclePlay, to: '/workflow-runs' }
      ]
    },
    {
      id: 'marketing',
      label: 'Marketing',
      items: [
        { label: 'Resumen', icon: LayoutTemplate, to: '/marketing' },
        { label: 'Formularios', icon: ListPlus, to: '/marketing/forms' },
        { label: 'Landing pages', icon: LayoutTemplate, to: '/marketing/landing-pages' },
        { label: 'Funnels', icon: GitBranch, to: '/marketing/funnels' },
        { label: 'Campanas', icon: Radio, to: '/marketing/campaigns' },
        { label: 'Integraciones', icon: Boxes, to: '/marketing/integrations' },
        { label: 'Respuestas', icon: ListPlus, to: '/marketing/submissions' },
        { label: 'Analytics', icon: BarChart3, to: '/marketing/analytics' },
        { label: 'Reportes', icon: BarChart3, to: '/marketing/reports' },
        { label: 'Consentimiento y DND', icon: ShieldCheck, to: '/inbox/communication-policy' }
      ]
    },
    {
      id: 'reputacion',
      label: 'Reputacion',
      items: [
        { label: 'Resumen', icon: Star, to: '/reputation' },
        { label: 'Resenas', icon: Star, to: '/reputation/reviews' },
        { label: 'Solicitudes', icon: Send, to: '/reputation/requests' },
        { label: 'Testimonios', icon: Quote, to: '/reputation/testimonials' },
        { label: 'Widgets', icon: LayoutTemplate, to: '/reputation/widgets' },
        { label: 'Encuestas', icon: ListChecks, to: '/reputation/surveys' },
        { label: 'Cupones', icon: TicketPercent, to: '/reputation/coupons' },
        { label: 'Referidos', icon: Share2, to: '/reputation/referrals' }
      ]
    },
    {
      id: 'administracion',
      label: 'Administracion',
      kind: 'settings',
      items: [
        { label: 'Usuarios', icon: UsersRound, to: '/admin/dashboard#usuarios' },
        { label: 'Roles y permisos', icon: ListChecks, to: '/admin/dashboard#permisos' },
        { label: 'Plan contratado', icon: CreditCard, to: '/admin/dashboard#plan' },
        { label: 'Facturacion', icon: FileText, to: '/admin/dashboard#facturacion' },
        { label: 'Operaciones', icon: ServerCog, to: '/ops' },
        { label: 'Configuracion', icon: Settings, to: '/admin/dashboard#configuracion' },
        { label: 'Onboarding', icon: ListChecks, to: '/admin/dashboard#onboarding' },
        { label: 'Calendario', icon: Settings, to: '/calendar/settings' },
        { label: 'Tags', icon: Tags, to: '/crm/tags' },
        { label: 'Campos personalizados', icon: ListChecks, to: '/crm/custom-fields' },
        { label: 'Pipelines', icon: Settings, to: '/crm/pipelines' },
        { label: 'Importar contactos', icon: FileText, to: '/crm/import' }
      ]
    }
  ],
  SUPERVISOR: [
    {
      id: 'inicio',
      label: 'Inicio',
      items: [{ label: 'Supervision', icon: Gauge, to: '/supervisor/dashboard' }]
    },
    {
      id: 'trabajo-diario',
      label: 'Trabajo diario',
      items: [
        { label: 'Inbox del equipo', icon: MessageSquare, to: '/inbox' },
        { label: 'Contactos del equipo', icon: ContactRound, to: '/crm/contacts' },
        { label: 'Oportunidades', icon: CreditCard, to: '/crm/opportunities' },
        { label: 'Pipeline del equipo', icon: KanbanSquare, to: '/crm/pipeline' },
        { label: 'Tareas', icon: ListTodo, to: '/crm/tasks' },
        { label: 'Calendario del equipo', icon: CalendarDays, to: '/calendar' },
        { label: 'Notificaciones', icon: Bell, to: '/notifications' }
      ]
    },
    {
      id: 'automatizacion-marketing',
      label: 'Automatizacion y marketing',
      items: [
        { label: 'Workflows', icon: GitBranch, to: '/workflows' },
        { label: 'Ejecuciones', icon: CirclePlay, to: '/workflow-runs' },
        { label: 'Formularios', icon: ListPlus, to: '/marketing/forms' },
        { label: 'Respuestas', icon: ListPlus, to: '/marketing/submissions' },
        { label: 'Funnels', icon: GitBranch, to: '/marketing/funnels' },
        { label: 'Campanas', icon: Radio, to: '/marketing/campaigns' },
        { label: 'Integraciones', icon: Boxes, to: '/marketing/integrations' },
        { label: 'Reportes', icon: BarChart3, to: '/marketing/reports' }
      ]
    },
    {
      id: 'reputacion',
      label: 'Reputacion',
      items: [
        { label: 'Resumen', icon: Star, to: '/reputation' },
        { label: 'Resenas del equipo', icon: Star, to: '/reputation/reviews' },
        { label: 'Solicitudes', icon: Send, to: '/reputation/requests' },
        { label: 'Cupones', icon: TicketPercent, to: '/reputation/coupons' },
        { label: 'Referidos', icon: Share2, to: '/reputation/referrals' }
      ]
    },
    {
      id: 'supervision',
      label: 'Supervision',
      kind: 'settings',
      items: [
        { label: 'Agentes', icon: Headphones, to: '/supervisor/dashboard#agentes' },
        { label: 'Actividad', icon: Activity, to: '/supervisor/dashboard#actividad' },
        { label: 'Metricas', icon: UsersRound, to: '/supervisor/dashboard#metricas' }
      ]
    }
  ],
  CALLCENTER: [
    {
      id: 'inicio',
      label: 'Inicio',
      items: [{ label: 'Mi dashboard', icon: Gauge, to: '/callcenter/dashboard' }]
    },
    {
      id: 'trabajo-diario',
      label: 'Trabajo diario',
      items: [
        { label: 'Mi inbox', icon: MessageSquare, to: '/inbox' },
        { label: 'Mis contactos', icon: ContactRound, to: '/crm/contacts' },
        { label: 'Seguimientos', icon: KanbanSquare, to: '/crm/contacts?followUp=today' },
        { label: 'Mis oportunidades', icon: CreditCard, to: '/crm/opportunities' },
        { label: 'Mis tareas', icon: ListTodo, to: '/crm/tasks' },
        { label: 'Mi calendario', icon: CalendarDays, to: '/calendar' },
        { label: 'Notificaciones', icon: Bell, to: '/notifications' }
      ]
    },
    {
      id: 'reputacion',
      label: 'Reputacion',
      items: [
        { label: 'Solicitar resena', icon: Send, to: '/reputation/requests' },
        { label: 'Mis resenas', icon: Star, to: '/reputation/reviews' },
        { label: 'Cupones', icon: TicketPercent, to: '/reputation/coupons' }
      ]
    },
    {
      id: 'mi-actividad',
      label: 'Mi actividad',
      kind: 'settings',
      items: [
        { label: 'Gestion de contacto', icon: Headphones, to: '/callcenter/dashboard#gestion-contacto' },
        { label: 'Actividad', icon: Activity, to: '/callcenter/dashboard#actividad' }
      ]
    }
  ]
};

export function getSidebarGroups(role, access) {
  return (sidebarGroupsByRole[role] || [])
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessPath(item.to, access))
    }))
    .filter((group) => group.items.length);
}

export const sidebarItemsByRole = Object.fromEntries(
  Object.entries(sidebarGroupsByRole).map(([role, groups]) => [
    role,
    groups.flatMap((group) => group.items)
  ])
);

export function isSidebarItemActive(to, location) {
  const [targetWithQuery, targetHash = ''] = String(to).split('#');
  const [targetPath, targetQuery = ''] = targetWithQuery.split('?');
  const currentHash = String(location.hash || '').replace(/^#/, '');
  const currentQuery = String(location.search || '').replace(/^\?/, '');

  if (targetHash) {
    return location.pathname === targetPath && currentHash === targetHash;
  }
  if (targetQuery) {
    return location.pathname === targetPath && currentQuery === targetQuery;
  }
  if (location.pathname === targetPath && !currentHash && !currentQuery) return true;

  return [
    '/crm/contacts',
    '/crm/opportunities',
    '/marketing/landing-pages',
    '/marketing/funnels',
    '/workflows'
  ].includes(targetPath) && location.pathname.startsWith(`${targetPath}/`);
}
