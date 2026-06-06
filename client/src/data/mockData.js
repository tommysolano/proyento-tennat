export const distributors = [
  {
    id: 'dist-1',
    name: 'Andes CRM Partners',
    owner: 'Camila Rios',
    region: 'Ecuador',
    companies: 12,
    revenue: '$3,420',
    status: 'active'
  },
  {
    id: 'dist-2',
    name: 'Norte Digital Suite',
    owner: 'Mateo Vargas',
    region: 'Colombia',
    companies: 5,
    revenue: '$1,860',
    status: 'trial'
  },
  {
    id: 'dist-3',
    name: 'Pacifica Leads',
    owner: 'Sofia Molina',
    region: 'Peru',
    companies: 8,
    revenue: '$2,210',
    status: 'active'
  }
];

export const companies = [
  {
    id: 'co-1',
    name: 'Nova Seguros',
    distributor: 'Andes CRM Partners',
    adminEmail: 'admin@demo.com',
    plan: 'Growth Omnicanal',
    users: 18,
    industry: 'Seguros',
    status: 'active'
  },
  {
    id: 'co-2',
    name: 'Altamar Retail',
    distributor: 'Andes CRM Partners',
    adminEmail: 'admin.altamar@demo.com',
    plan: 'Starter Contactos',
    users: 6,
    industry: 'Retail',
    status: 'trial'
  },
  {
    id: 'co-3',
    name: 'Senda Salud',
    distributor: 'Norte Digital Suite',
    adminEmail: '',
    plan: 'Enterprise Regional',
    users: 42,
    industry: 'Salud',
    status: 'active'
  },
  {
    id: 'co-4',
    name: 'Mercurio Auto',
    distributor: 'Pacifica Leads',
    adminEmail: '',
    plan: 'Growth Omnicanal',
    users: 23,
    industry: 'Automotriz',
    status: 'active'
  }
];

export const plans = [
  {
    id: 'plan-1',
    name: 'Starter Contactos',
    distributor: 'Andes CRM Partners',
    price: '$79',
    cycle: 'Mensual',
    limits: '8 usuarios / 2.5k contactos',
    status: 'active'
  },
  {
    id: 'plan-2',
    name: 'Growth Omnicanal',
    distributor: 'Andes CRM Partners',
    price: '$189',
    cycle: 'Mensual',
    limits: '25 usuarios / 15k contactos',
    status: 'active'
  },
  {
    id: 'plan-3',
    name: 'Enterprise Regional',
    distributor: 'Norte Digital Suite',
    price: '$499',
    cycle: 'Mensual',
    limits: '120 usuarios / 100k contactos',
    status: 'draft'
  }
];

export const internalUsers = [
  {
    id: 'user-1',
    name: 'Bruno Supervisor',
    email: 'supervisor@demo.com',
    role: 'SUPERVISOR',
    status: 'active'
  },
  {
    id: 'user-2',
    name: 'Lucia Agente',
    email: 'callcenter@demo.com',
    role: 'CALLCENTER',
    status: 'active'
  },
  {
    id: 'user-3',
    name: 'Diego Agente',
    email: 'diego.agent@demo.com',
    role: 'CALLCENTER',
    status: 'active'
  },
  {
    id: 'user-4',
    name: 'Paula Backoffice',
    email: 'paula.ops@demo.com',
    role: 'CALLCENTER',
    status: 'inactive'
  }
];

export const channelConfigs = [
  {
    id: 'channel-1',
    name: 'WhatsApp Comercial Nova',
    type: 'WhatsApp Cloud API',
    appId: 'app_demo_1029',
    phoneNumberId: 'phone_5542',
    pageId: '-',
    status: 'connected'
  },
  {
    id: 'channel-2',
    name: 'Facebook Nova Seguros',
    type: 'Facebook',
    appId: 'fb_app_2030',
    phoneNumberId: '-',
    pageId: 'nova_page_01',
    status: 'draft'
  },
  {
    id: 'channel-3',
    name: 'Messenger Nova',
    type: 'Messenger',
    appId: '-',
    phoneNumberId: '-',
    pageId: 'nova_page_01',
    status: 'draft'
  }
];

export const agents = [
  {
    id: 'agent-1',
    name: 'Lucia Agente',
    shift: '08:00 - 16:00',
    calls: 34,
    contacts: 52,
    conversations: 18,
    status: 'active'
  },
  {
    id: 'agent-2',
    name: 'Diego Agente',
    shift: '10:00 - 18:00',
    calls: 28,
    contacts: 47,
    conversations: 15,
    status: 'active'
  },
  {
    id: 'agent-3',
    name: 'Paula Backoffice',
    shift: '12:00 - 20:00',
    calls: 12,
    contacts: 19,
    conversations: 6,
    status: 'inactive'
  }
];

export const agentActivity = [
  {
    id: 'activity-1',
    agent: 'Lucia Agente',
    type: 'Llamada',
    summary: 'Seguimiento a Mariana Paredes',
    time: '09:20',
    result: 'interesado'
  },
  {
    id: 'activity-2',
    agent: 'Diego Agente',
    type: 'Mensaje',
    summary: 'Respuesta por Messenger a Paola Suarez',
    time: '10:05',
    result: 'contactado'
  },
  {
    id: 'activity-3',
    agent: 'Lucia Agente',
    type: 'Cambio de estado',
    summary: 'Jorge Almeida paso a contactado',
    time: '11:34',
    result: 'contactado'
  }
];

export const contacts = [
  {
    id: 'contact-1',
    name: 'Mariana Paredes',
    phone: '+593 99 220 1100',
    source: 'Campana renovacion',
    status: 'interesado',
    lastTouch: 'Hace 12 min'
  },
  {
    id: 'contact-2',
    name: 'Jorge Almeida',
    phone: '+593 98 555 4231',
    source: 'Landing seguros',
    status: 'contactado',
    lastTouch: 'Hace 30 min'
  },
  {
    id: 'contact-3',
    name: 'Paola Suarez',
    phone: '+593 97 144 3312',
    source: 'Facebook Lead',
    status: 'pendiente',
    lastTouch: 'Sin contacto'
  },
  {
    id: 'contact-4',
    name: 'Ivan Herrera',
    phone: '+593 96 881 7601',
    source: 'Base fria',
    status: 'no_interesado',
    lastTouch: 'Ayer'
  }
];

export const conversations = [
  {
    id: 'conv-1',
    contact: 'Mariana Paredes',
    channel: 'WhatsApp',
    lastMessage: 'Estoy interesada, enviame los detalles del plan familiar.',
    unread: 2,
    status: 'open'
  },
  {
    id: 'conv-2',
    contact: 'Jorge Almeida',
    channel: 'Messenger',
    lastMessage: 'Gracias, lo reviso y te confirmo hoy.',
    unread: 0,
    status: 'pending'
  },
  {
    id: 'conv-3',
    contact: 'Paola Suarez',
    channel: 'Facebook',
    lastMessage: 'Necesito cobertura para mi emprendimiento.',
    unread: 1,
    status: 'open'
  }
];

export const demoAccounts = [
  { role: 'Superadmin', email: 'superadmin@example.com' },
  { role: 'Distribuidor', email: 'distributor@demo.com' },
  { role: 'Administrador / Empresa', email: 'admin@demo.com' },
  { role: 'Admin Altamar', email: 'admin.altamar@demo.com' },
  { role: 'Supervisor Call Center', email: 'supervisor@demo.com' },
  { role: 'Call Center', email: 'callcenter@demo.com' }
];
