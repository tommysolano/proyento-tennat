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
    // El inbox opera SOBRE conversaciones: sin ellas no hay bandeja.
    requires: ['conversations'],
    // Recomendados (no duros): media para adjuntos, realtime para vivo.
    recommends: ['media', 'realtime'],
    status: 'active'
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    description: 'WhatsApp Cloud API y sesiones QR aisladas por empresa.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    // WhatsApp entra por el pipeline de conversaciones/mensajes.
    requires: ['conversations'],
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
    description: 'Agenda multiusuario, disponibilidad y citas vinculadas al CRM.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'bookings',
    name: 'Reservas',
    description: 'Enlaces publicos de reserva sobre calendarios internos.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
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
    description: 'Motor interno de eventos, condiciones y acciones.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: ['workflows:read'],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'workflows',
    name: 'Workflows',
    description: 'Constructor, ejecuciones, auditoria y pruebas de workflows.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'forms',
    name: 'Formularios',
    description: 'Formularios publicos, submissions y captura de leads.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'surveys',
    name: 'Encuestas',
    description: 'Formularios de tipo encuesta y respuestas estructuradas.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'landing_pages',
    name: 'Landing Pages',
    description: 'Paginas publicas basicas construidas por secciones seguras.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'funnels',
    name: 'Funnels',
    description: 'Funnels publicos, pasos, tracking y conversiones internas.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'reputation',
    name: 'Reputacion',
    description: 'Metricas, solicitudes y gestion de reputacion.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'reviews',
    name: 'Resenas',
    description: 'Solicitudes, moderacion y publicacion de resenas internas.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'testimonials',
    name: 'Testimonios',
    description: 'Testimonios publicables derivados de resenas aprobadas.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'coupons',
    name: 'Cupones',
    description: 'Emision y redencion manual de cupones.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'referrals',
    name: 'Referidos',
    description: 'Programas y seguimiento basico de referidos.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'loyalty',
    name: 'Fidelizacion',
    description: 'Capa basica de fidelizacion con cupones y referidos.',
    version: '1.0.0',
    enabledByDefault: true,
    requiredPermissions: [],
    requiredPlanFeatures: [],
    status: 'active'
  },
  {
    key: 'integrations',
    name: 'Integraciones',
    description: 'Webhooks entrantes, mapeo seguro y eventos externos por empresa.',
    version: '1.0.0',
    enabledByDefault: false,
    requiredPermissions: [],
    requiredPlanFeatures: ['integrations'],
    status: 'active'
  }
];

export function getRegisteredModule(moduleKey) {
  return MODULE_REGISTRY.find((module) => module.key === moduleKey) || null;
}

/** Dependencias duras (requires) de un modulo. Vacio si no tiene. */
export function moduleRequires(moduleKey) {
  return getRegisteredModule(moduleKey)?.requires || [];
}

/** Dependencias recomendadas (recommends) de un modulo. Vacio si no tiene. */
export function moduleRecommends(moduleKey) {
  return getRegisteredModule(moduleKey)?.recommends || [];
}

/**
 * Cierre transitivo de las dependencias duras de `moduleKey` (sin incluirlo).
 * Ej: whatsapp -> [conversations]; si conversations tuviera requires, tambien.
 */
export function resolveRequiredModules(moduleKey, seen = new Set()) {
  for (const dependency of moduleRequires(moduleKey)) {
    if (seen.has(dependency)) continue;
    seen.add(dependency);
    resolveRequiredModules(dependency, seen);
  }
  return [...seen];
}

/**
 * Modulos registrados que dependen (duro) de `moduleKey`. Sirve para avisar que
 * se rompe al desactivarlo.
 */
export function modulesDependingOn(moduleKey) {
  return MODULE_REGISTRY.filter((module) => (module.requires || []).includes(moduleKey)).map(
    (module) => module.key
  );
}
