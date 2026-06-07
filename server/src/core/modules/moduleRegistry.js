export const MODULE_REGISTRY = [
  {
    key: 'core',
    name: 'Core',
    description: 'Autenticacion, tenants, permisos y configuracion base.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'crm',
    name: 'CRM',
    description: 'Gestion comercial base para empresas y equipos.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: ['contacts:manage'],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'contacts',
    name: 'Contactos',
    description: 'Contactos, asignaciones, notas y seguimientos.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'opportunities',
    name: 'Oportunidades',
    description: 'Pipelines, etapas, oportunidades y vista Kanban.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'tasks',
    name: 'Tareas',
    description: 'Tareas comerciales, vencimientos y seguimientos.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'conversations',
    name: 'Conversaciones',
    description: 'Conversaciones y mensajes omnicanal por empresa.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'inbox',
    name: 'Inbox',
    description: 'Bandeja operativa, asignaciones y notas internas.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp Cloud',
    description: 'Adaptador y webhooks preparados para WhatsApp Cloud API.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'realtime',
    name: 'Tiempo real',
    description: 'Eventos SSE con alcance por empresa, equipo y asignacion.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'notifications',
    name: 'Notificaciones',
    description: 'Notificaciones internas por usuario y eventos del inbox.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: ['notifications:read'],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'media',
    name: 'Media',
    description: 'Almacenamiento, descarga y upload seguro de adjuntos.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'calendar',
    name: 'Calendario',
    description: 'Reservas y agenda; integracion real pendiente.',
    version: '0.1.0',
    enabledByDefault: false,
    requiredPermissions: [],
    requiredPlanFeatures: ['calendar'],
    status: 'planned'
  },
  {
    key: 'billing',
    name: 'Billing',
    description: 'Planes, suscripciones, facturas y pagos manuales.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'reporting',
    name: 'Reporting',
    description: 'Metricas operativas y financieras.',
    version: '0.5.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'automations',
    name: 'Automatizaciones',
    description: 'Motor de workflows futuro.',
    version: '0.1.0',
    enabledByDefault: false,
    requiredPermissions: [],
    requiredPlanFeatures: ['automations'],
    status: 'planned'
  },
  {
    key: 'funnels',
    name: 'Funnels',
    description: 'Funnels y landing pages futuros.',
    version: '0.1.0',
    enabledByDefault: false,
    requiredPermissions: [],
    requiredPlanFeatures: ['funnels'],
    status: 'planned'
  },
  {
    key: 'reputation',
    name: 'Reputacion',
    description: 'Gestion futura de resenas y reputacion.',
    version: '0.1.0',
    enabledByDefault: false,
    requiredPermissions: [],
    requiredPlanFeatures: ['reputation'],
    status: 'planned'
  },
  {
    key: 'integrations',
    name: 'Integraciones',
    description: 'Conectores externos futuros.',
    version: '0.1.0',
    enabledByDefault: false,
    requiredPermissions: [],
    requiredPlanFeatures: ['integrations'],
    status: 'planned'
  }
];

export function getRegisteredModule(moduleKey) {
  return MODULE_REGISTRY.find((module) => module.key === moduleKey) || null;
}
