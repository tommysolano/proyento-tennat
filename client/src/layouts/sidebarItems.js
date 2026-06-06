import {
  Activity,
  Building2,
  Boxes,
  ContactRound,
  CreditCard,
  FileText,
  Gauge,
  Headphones,
  ListChecks,
  Palette,
  ReceiptText,
  Settings,
  UsersRound
} from 'lucide-react';

export const sidebarItemsByRole = {
  SUPERADMIN: [
    { label: 'Resumen', icon: Gauge, to: '/superadmin' },
    { label: 'Distribuidores', icon: Building2, to: '/superadmin/distributors' },
    { label: 'Planes plataforma', icon: CreditCard, to: '/superadmin/platform-plans' },
    { label: 'Suscripciones', icon: ReceiptText, to: '/superadmin/subscriptions' },
    { label: 'Billing', icon: FileText, to: '/superadmin/billing' },
    { label: 'Modulos', icon: Boxes, to: '/superadmin/modules' },
    { label: 'Auditoria', icon: Activity, to: '/superadmin/audit' }
  ],
  DISTRIBUTOR: [
    { label: 'Dashboard', icon: Gauge, to: '/distributor/dashboard' },
    { label: 'Planes', icon: CreditCard, to: '/distributor/dashboard#planes' },
    { label: 'Empresas', icon: Building2, to: '/distributor/companies' },
    { label: 'Crear admin', icon: UsersRound, to: '/distributor/dashboard#admins' },
    { label: 'Suscripciones', icon: CreditCard, to: '/distributor/dashboard#suscripciones' },
    { label: 'Finanzas', icon: Gauge, to: '/distributor/finance' },
    { label: 'Facturas', icon: FileText, to: '/distributor/invoices' },
    { label: 'Pagos', icon: ReceiptText, to: '/distributor/payments' },
    { label: 'Branding', icon: Palette, to: '/distributor/branding' },
    { label: 'Configuracion', icon: Settings, to: '/distributor/settings' },
    { label: 'Onboarding', icon: ListChecks, to: '/distributor/onboarding' },
    { label: 'Mi plataforma', icon: ReceiptText, to: '/distributor/dashboard#plataforma' }
  ],
  ADMIN: [
    { label: 'Dashboard', icon: Gauge, to: '/admin/dashboard' },
    { label: 'Usuarios internos', icon: UsersRound, to: '/admin/dashboard#usuarios' },
    { label: 'Contactos', icon: ContactRound, to: '/admin/dashboard#contactos' },
    { label: 'Actividad', icon: Activity, to: '/admin/dashboard#actividad' },
    { label: 'Plan contratado', icon: CreditCard, to: '/admin/dashboard#plan' },
    { label: 'Facturacion', icon: FileText, to: '/admin/dashboard#facturacion' },
    { label: 'Configuracion', icon: Settings, to: '/admin/dashboard#configuracion' },
    { label: 'Onboarding', icon: ListChecks, to: '/admin/dashboard#onboarding' }
  ],
  SUPERVISOR: [
    { label: 'Supervision', icon: Gauge, to: '/supervisor/dashboard' },
    { label: 'Agentes', icon: Headphones, to: '/supervisor/dashboard#agentes' },
    { label: 'Contactos', icon: ContactRound, to: '/supervisor/dashboard#contactos' },
    { label: 'Actividad', icon: Activity, to: '/supervisor/dashboard#actividad' },
    { label: 'Metricas', icon: UsersRound, to: '/supervisor/dashboard#metricas' }
  ],
  CALLCENTER: [
    { label: 'Mi dashboard', icon: Gauge, to: '/callcenter/dashboard' },
    { label: 'Contactos', icon: ContactRound, to: '/callcenter/dashboard#contactos' },
    { label: 'Gestion', icon: Headphones, to: '/callcenter/dashboard#gestion-contacto' },
    { label: 'Actividad', icon: Activity, to: '/callcenter/dashboard#actividad' }
  ]
};
