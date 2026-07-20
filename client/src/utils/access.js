const ACCESS_RULES = [
  {
    path: '/admin/dashboard#contactos',
    permissions: ['contacts:manage'],
    modules: ['crm', 'contacts']
  },
  {
    path: '/admin/dashboard#facturacion',
    permissions: ['company_billing:read'],
    modules: ['billing']
  },
  {
    path: '/supervisor/dashboard#agentes',
    permissions: ['users:read_team']
  },
  {
    path: '/supervisor/dashboard#contactos',
    permissions: ['contacts:read_team'],
    modules: ['crm', 'contacts']
  },
  {
    path: '/supervisor/dashboard#actividad',
    permissions: ['activity:read_team']
  },
  {
    path: '/callcenter/dashboard#contactos',
    permissions: ['contacts:read_assigned'],
    modules: ['crm', 'contacts']
  },
  {
    path: '/callcenter/dashboard#gestion-contacto',
    permissions: ['contacts:read_assigned'],
    modules: ['crm', 'contacts']
  },
  {
    path: '/callcenter/dashboard#actividad',
    permissions: ['activity:read_self']
  },
  {
    prefix: '/notifications',
    permissions: ['notifications:read'],
    modules: ['notifications']
  },
  {
    prefix: '/reputation/testimonials',
    permissions: ['testimonials:manage'],
    modules: ['reputation', 'testimonials']
  },
  {
    prefix: '/reputation/surveys',
    permissions: ['surveys:manage'],
    modules: ['reputation', 'surveys']
  },
  {
    prefix: '/reputation/widgets',
    permissions: ['review_widgets:manage'],
    modules: ['reputation', 'reviews']
  },
  {
    prefix: '/reputation/requests',
    permissions: [
      'review_requests:manage',
      'review_requests:create_team',
      'review_requests:create_assigned'
    ],
    modules: ['reputation', 'reviews']
  },
  {
    prefix: '/reputation/reviews',
    permissions: ['reviews:manage', 'reviews:read_team', 'reviews:read_assigned'],
    modules: ['reputation', 'reviews']
  },
  {
    prefix: '/inbox/whatsapp-numbers',
    permissions: ['channel_configs:manage'],
    modules: ['conversations', 'inbox', 'whatsapp']
  },
  {
    prefix: '/inbox/channels',
    permissions: ['channel_configs:manage'],
    modules: ['conversations', 'inbox']
  },
  {
    prefix: '/inbox/templates',
    permissions: ['message_templates:manage', 'message_templates:read', 'message_templates:use'],
    modules: ['conversations', 'inbox']
  },
  {
    prefix: '/inbox/routing',
    permissions: ['routing_rules:manage', 'routing_rules:read'],
    modules: ['conversations', 'inbox']
  },
  {
    prefix: '/inbox/communication-policy',
    permissions: [
      'communication_reports:read',
      'communication_reports:read_team',
      'quiet_hours:manage',
      'consent:read',
      'consent:read_team',
      'marketing_reports:read',
      'marketing_reports:read_team',
      'channel_configs:manage'
    ],
    modules: ['conversations', 'inbox', 'crm', 'contacts']
  },
  {
    prefix: '/inbox',
    permissions: ['conversations:read', 'conversations:read_team', 'conversations:read_assigned'],
    modules: ['conversations', 'inbox']
  },
  {
    prefix: '/calendar/settings',
    permissions: ['calendars:manage', 'availability:manage'],
    modules: ['calendar']
  },
  {
    prefix: '/calendar',
    permissions: ['calendars:manage', 'calendars:read_team', 'calendars:read_assigned'],
    modules: ['calendar']
  },
  {
    prefix: '/workflow-runs',
    permissions: ['workflow_runs:read', 'workflow_runs:read_team'],
    modules: ['automations', 'workflows']
  },
  {
    prefix: '/workflows',
    permissions: ['workflows:read', 'workflows:read_team'],
    modules: ['automations', 'workflows']
  },
  {
    prefix: '/marketing/integrations',
    permissions: ['integrations:manage', 'integrations:read', 'integrations:read_team'],
    modules: ['integrations']
  },
  {
    prefix: '/marketing/campaigns',
    permissions: ['campaigns:manage', 'campaigns:read', 'campaigns:read_team'],
    modules: ['forms']
  },
  {
    prefix: '/marketing/reports',
    permissions: ['marketing_reports:read', 'marketing_reports:read_team'],
    modules: ['forms', 'reporting']
  },
  {
    prefix: '/marketing/landing-pages',
    permissions: ['landing_pages:manage'],
    modules: ['landing_pages']
  },
  {
    prefix: '/marketing/funnels',
    permissions: ['funnels:manage', 'funnels:read_team'],
    modules: ['funnels']
  },
  {
    prefix: '/marketing',
    permissions: ['forms:manage', 'forms:read', 'forms:read_team'],
    modules: ['forms']
  },
  {
    prefix: '/reputation/coupons',
    permissions: ['coupons:manage', 'coupons:issue_team', 'coupons:issue_assigned'],
    modules: ['loyalty', 'coupons']
  },
  {
    prefix: '/reputation/referrals',
    permissions: ['referrals:manage', 'referrals:read_team'],
    modules: ['loyalty', 'referrals']
  },
  {
    prefix: '/reputation',
    permissions: [
      'reputation:manage',
      'reviews:manage',
      'reviews:read_team',
      'reviews:read_assigned',
      'review_requests:create_team',
      'review_requests:create_assigned'
    ],
    modules: ['reputation']
  },
  {
    prefix: '/crm/tags',
    permissions: ['tags:manage'],
    modules: ['crm']
  },
  {
    prefix: '/crm/import',
    permissions: ['contacts:import'],
    modules: ['crm', 'contacts']
  },
  {
    prefix: '/crm/contacts',
    permissions: ['contacts:manage', 'contacts:read_team', 'contacts:read_assigned'],
    modules: ['crm', 'contacts']
  },
  {
    prefix: '/crm/opportunities',
    permissions: ['opportunities:manage', 'opportunities:read_team', 'opportunities:read_assigned'],
    modules: ['crm', 'opportunities']
  },
  {
    prefix: '/crm/pipeline',
    permissions: ['pipelines:manage', 'opportunities:read_team', 'opportunities:read_assigned'],
    modules: ['crm', 'opportunities']
  },
  {
    prefix: '/crm/tasks',
    permissions: ['tasks:manage', 'tasks:create_team', 'tasks:read_assigned'],
    modules: ['crm', 'tasks']
  },
  {
    prefix: '/crm',
    permissions: ['crm:manage', 'crm:read_team', 'contacts:read_assigned'],
    modules: ['crm']
  }
];

export function canUseAccessRule(access, rule) {
  if (!rule) return true;
  const permissions = new Set(access?.permissions || []);
  const modules = new Set(access?.modules || []);
  const hasPermission =
    !rule.permissions?.length ||
    rule.permissions.some((permission) => permissions.has(permission));
  const hasModules =
    !rule.modules?.length || rule.modules.every((moduleKey) => modules.has(moduleKey));
  return hasPermission && hasModules;
}

export function accessRuleForPath(path) {
  const rawPath = String(path || '');
  const exactRule = ACCESS_RULES.find((rule) => rule.path === rawPath);
  if (exactRule) return exactRule;
  const normalizedPath = rawPath.split('#')[0].split('?')[0];
  return ACCESS_RULES.find(
    (rule) => rule.prefix && normalizedPath.startsWith(rule.prefix)
  ) || null;
}

export function canAccessPath(path, access) {
  return canUseAccessRule(access, accessRuleForPath(path));
}
