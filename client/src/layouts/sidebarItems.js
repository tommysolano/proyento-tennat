import {
  Activity,
  Building2,
  ContactRound,
  CreditCard,
  Gauge,
  Headphones,
  UsersRound
} from 'lucide-react';

export const sidebarItemsByRole = {
  DISTRIBUTOR: [
    { label: 'Dashboard', icon: Gauge, to: '/distributor/dashboard' },
    { label: 'Planes', icon: CreditCard, to: '/distributor/dashboard#planes' },
    { label: 'Empresas', icon: Building2, to: '/distributor/dashboard#empresas' },
    { label: 'Crear admin', icon: UsersRound, to: '/distributor/dashboard#admins' },
    { label: 'Suscripciones', icon: CreditCard, to: '/distributor/dashboard#suscripciones' },
    { label: 'Actividad', icon: Activity, to: '/distributor/dashboard#actividad' }
  ],
  ADMIN: [
    { label: 'Dashboard', icon: Gauge, to: '/admin/dashboard' },
    { label: 'Usuarios internos', icon: UsersRound, to: '/admin/dashboard#usuarios' },
    { label: 'Contactos', icon: ContactRound, to: '/admin/dashboard#contactos' },
    { label: 'Actividad', icon: Activity, to: '/admin/dashboard#actividad' },
    { label: 'Plan contratado', icon: CreditCard, to: '/admin/dashboard#plan' }
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
