import {
  ActivityLog,
  ChannelConfig,
  Company,
  Contact,
  Conversation,
  Distributor,
  Plan,
  Subscription,
  User
} from '../models/index.js';

const demoPassword = 'Demo1234!';

export async function seedDemoData({ clear = true } = {}) {
  if (clear) {
    await Promise.all([
      ActivityLog.deleteMany({}),
      ChannelConfig.deleteMany({}),
      Conversation.deleteMany({}),
      Contact.deleteMany({}),
      Subscription.deleteMany({}),
      Plan.deleteMany({}),
      Company.deleteMany({}),
      Distributor.deleteMany({}),
      User.deleteMany({})
    ]);
  }

  const [andesDistributor, norteDistributor] = await Distributor.create([
    {
      name: 'Andes CRM Partners',
      slug: 'andes-crm',
      ownerName: 'Camila Rios',
      email: 'camila@andescrm.demo',
      status: 'active',
      region: 'Ecuador'
    },
    {
      name: 'Norte Digital Suite',
      slug: 'norte-digital',
      ownerName: 'Mateo Vargas',
      email: 'mateo@nortedigital.demo',
      status: 'trial',
      region: 'Colombia'
    }
  ]);

  const [starterPlan, growthPlan, enterprisePlan] = await Plan.create([
    {
      distributorId: andesDistributor._id,
      name: 'Starter Contactos',
      description: 'Plan inicial para equipos pequenos con WhatsApp y contactos basicos.',
      price: 79,
      billingCycle: 'monthly',
      limits: { users: 8, contacts: 2500, channels: 1 },
      features: ['1 canal', 'Contactos basicos', 'Reportes simples'],
      status: 'active'
    },
    {
      distributorId: andesDistributor._id,
      name: 'Growth Omnicanal',
      description: 'Plan recomendado para empresas con varios supervisores y bandeja omnicanal.',
      price: 189,
      billingCycle: 'monthly',
      limits: { users: 25, contacts: 15000, channels: 3 },
      features: ['WhatsApp Cloud API', 'Facebook', 'Messenger', 'Metricas por agente'],
      status: 'active'
    },
    {
      distributorId: norteDistributor._id,
      name: 'Enterprise Regional',
      description: 'Plan corporativo con limites amplios y acompanamiento premium.',
      price: 499,
      billingCycle: 'monthly',
      limits: { users: 120, contacts: 100000, channels: 6 },
      features: ['Multi-sede', 'SLA prioritario', 'Onboarding asistido'],
      status: 'draft'
    }
  ]);

  const [novaCompany, altamarCompany, sendaCompany] = await Company.create([
    {
      distributorId: andesDistributor._id,
      name: 'Nova Seguros',
      taxId: 'EC-099001',
      industry: 'Seguros',
      status: 'active'
    },
    {
      distributorId: andesDistributor._id,
      name: 'Altamar Retail',
      taxId: 'EC-099002',
      industry: 'Retail',
      status: 'trial'
    },
    {
      distributorId: norteDistributor._id,
      name: 'Senda Salud',
      taxId: 'CO-800104',
      industry: 'Salud',
      status: 'active'
    }
  ]);

  const users = await User.create([
    {
      name: 'Alex Programador VPS',
      email: 'programador@demo.com',
      password: demoPassword,
      role: 'DISTRIBUTOR',
      distributorId: andesDistributor._id,
      status: 'active'
    },
    {
      name: 'Camila Distribuidora',
      email: 'distributor@demo.com',
      password: demoPassword,
      role: 'DISTRIBUTOR',
      distributorId: andesDistributor._id,
      status: 'active'
    },
    {
      name: 'Valeria Administradora',
      email: 'admin@demo.com',
      password: demoPassword,
      role: 'ADMIN',
      distributorId: andesDistributor._id,
      companyId: novaCompany._id,
      status: 'active'
    },
    {
      name: 'Rafael Admin Altamar',
      email: 'admin.altamar@demo.com',
      password: demoPassword,
      role: 'ADMIN',
      distributorId: andesDistributor._id,
      companyId: altamarCompany._id,
      status: 'active'
    },
    {
      name: 'Bruno Supervisor',
      email: 'supervisor@demo.com',
      password: demoPassword,
      role: 'SUPERVISOR',
      distributorId: andesDistributor._id,
      companyId: novaCompany._id,
      status: 'active'
    },
    {
      name: 'Lucia Agente',
      email: 'callcenter@demo.com',
      password: demoPassword,
      role: 'CALLCENTER',
      distributorId: andesDistributor._id,
      companyId: novaCompany._id,
      status: 'active'
    },
    {
      name: 'Diego Agente',
      email: 'diego.agent@demo.com',
      password: demoPassword,
      role: 'CALLCENTER',
      distributorId: andesDistributor._id,
      companyId: novaCompany._id,
      status: 'active'
    }
  ]);

  const adminUser = users.find((user) => user.role === 'ADMIN');
  const altamarAdminUser = users.find((user) => user.email === 'admin.altamar@demo.com');
  const supervisorUser = users.find((user) => user.role === 'SUPERVISOR');
  const callcenterUser = users.find((user) => user.email === 'callcenter@demo.com');
  const secondAgent = users.find((user) => user.email === 'diego.agent@demo.com');

  await Company.findByIdAndUpdate(novaCompany._id, { adminId: adminUser._id });
  await Company.findByIdAndUpdate(altamarCompany._id, { adminId: altamarAdminUser._id });
  await User.updateMany(
    { role: 'CALLCENTER', companyId: novaCompany._id },
    { supervisorId: supervisorUser._id }
  );

  await Subscription.create([
    {
      companyId: novaCompany._id,
      planId: growthPlan._id,
      distributorId: andesDistributor._id,
      status: 'active'
    },
    {
      companyId: altamarCompany._id,
      planId: starterPlan._id,
      distributorId: andesDistributor._id,
      status: 'trial'
    },
    {
      companyId: sendaCompany._id,
      planId: enterprisePlan._id,
      distributorId: norteDistributor._id,
      status: 'active'
    }
  ]);

  const [contactA, contactB, contactC, contactD] = await Contact.create([
    {
      companyId: novaCompany._id,
      assignedTo: callcenterUser._id,
      name: 'Mariana Paredes',
      phone: '+593 99 220 1100',
      email: 'mariana@example.com',
      source: 'Campana renovacion',
      status: 'interesado',
      lastContactAt: new Date()
    },
    {
      companyId: novaCompany._id,
      assignedTo: callcenterUser._id,
      name: 'Jorge Almeida',
      phone: '+593 98 555 4231',
      email: 'jorge@example.com',
      source: 'Landing seguros',
      status: 'contactado',
      lastContactAt: new Date()
    },
    {
      companyId: novaCompany._id,
      assignedTo: secondAgent._id,
      name: 'Paola Suarez',
      phone: '+593 97 144 3312',
      source: 'Facebook Lead',
      status: 'pendiente'
    },
    {
      companyId: novaCompany._id,
      assignedTo: secondAgent._id,
      name: 'Ivan Herrera',
      phone: '+593 96 881 7601',
      source: 'Base fria',
      status: 'no_interesado',
      lastContactAt: new Date()
    }
  ]);

  await Conversation.create([
    {
      companyId: novaCompany._id,
      contactId: contactA._id,
      assignedTo: callcenterUser._id,
      channel: 'whatsapp',
      status: 'open',
      lastMessage: 'Estoy interesada, enviame los detalles del plan familiar.',
      unreadCount: 2
    },
    {
      companyId: novaCompany._id,
      contactId: contactB._id,
      assignedTo: callcenterUser._id,
      channel: 'messenger',
      status: 'pending',
      lastMessage: 'Gracias, lo reviso y te confirmo hoy.',
      unreadCount: 0
    },
    {
      companyId: novaCompany._id,
      contactId: contactC._id,
      assignedTo: secondAgent._id,
      channel: 'facebook',
      status: 'open',
      lastMessage: 'Necesito cobertura para mi emprendimiento.',
      unreadCount: 1
    }
  ]);

  await ActivityLog.create([
    {
      companyId: novaCompany._id,
      userId: callcenterUser._id,
      type: 'call',
      summary: 'Llamada de seguimiento con Mariana Paredes',
      metadata: { durationMinutes: 8, result: 'interesado' }
    },
    {
      companyId: novaCompany._id,
      userId: callcenterUser._id,
      type: 'message',
      summary: 'Respuesta enviada por WhatsApp a Jorge Almeida',
      metadata: { channel: 'whatsapp' }
    },
    {
      companyId: novaCompany._id,
      userId: secondAgent._id,
      type: 'status_change',
      summary: 'Ivan Herrera marcado como no interesado',
      metadata: { from: 'contactado', to: 'no_interesado' }
    }
  ]);

  await ChannelConfig.create([
    {
      companyId: novaCompany._id,
      channel: 'whatsapp_cloud_api',
      displayName: 'WhatsApp Comercial Nova',
      credentials: {
        appId: 'app_demo_1029',
        phoneNumberId: 'phone_5542',
        tokenPreview: 'EAAB...demo'
      },
      status: 'connected'
    },
    {
      companyId: novaCompany._id,
      channel: 'facebook',
      displayName: 'Facebook Nova Seguros',
      credentials: {
        appId: 'fb_app_2030',
        pageId: 'nova_page_01',
        tokenPreview: 'FB...demo'
      },
      status: 'draft'
    },
    {
      companyId: novaCompany._id,
      channel: 'messenger',
      displayName: 'Messenger Nova',
      credentials: {
        pageId: 'nova_page_01',
        tokenPreview: 'MS...demo'
      },
      status: 'draft'
    }
  ]);

  return {
    distributors: 2,
    companies: 3,
    plans: 3,
    users: users.length,
    password: demoPassword
  };
}
