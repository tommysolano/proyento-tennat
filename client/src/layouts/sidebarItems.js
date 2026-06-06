import {
  Activity,
  Building2,
  ContactRound,
  CreditCard,
  Gauge,
  Headphones,
  MessageSquare,
  RadioTower,
  UsersRound
} from 'lucide-react';

export const sidebarItemsByRole = {
  DISTRIBUTOR: [
    { label: 'Dashboard', icon: Gauge, to: '/distributor/dashboard' },
    { label: 'Planes', icon: CreditCard, to: '/distributor/dashboard#planes' },
    { label: 'Empresas', icon: Building2, to: '/distributor/dashboard#empresas' },
    { label: 'Crear admin', icon: UsersRound, to: '/distributor/dashboard#admins' },
    { label: 'Estadisticas', icon: Activity, to: '/distributor/dashboard#estadisticas' }
  ],
  ADMIN: [
    { label: 'Dashboard', icon: Gauge, to: '/admin/dashboard' },
    { label: 'Usuarios internos', icon: UsersRound, to: '/admin/dashboard#usuarios' },
    { label: 'Canales', icon: RadioTower, to: '/admin/dashboard#canales' },
    { label: 'Plan contratado', icon: CreditCard, to: '/admin/dashboard#plan' }
  ],
  SUPERVISOR: [
    { label: 'Supervision', icon: Gauge, to: '/supervisor/dashboard' },
    { label: 'Agentes', icon: Headphones, to: '/supervisor/dashboard#agentes' },
    { label: 'Actividad', icon: Activity, to: '/supervisor/dashboard#actividad' },
    { label: 'Metricas', icon: UsersRound, to: '/supervisor/dashboard#metricas' }
  ],
  CALLCENTER: [
    { label: 'Mi dashboard', icon: Gauge, to: '/callcenter/dashboard' },
    { label: 'Contactos', icon: ContactRound, to: '/callcenter/dashboard#contactos' },
    { label: 'Conversaciones', icon: MessageSquare, to: '/callcenter/dashboard#conversaciones' },
    { label: 'Registro', icon: Activity, to: '/callcenter/dashboard#registro' }
  ]
};
