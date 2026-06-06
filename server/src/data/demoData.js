import { randomBytes } from 'node:crypto';
import {
  ActivityLog,
  ChannelConfig,
  Company,
  Contact,
  Conversation,
  Distributor,
  GlobalSettings,
  Invoice,
  ModuleEntitlement,
  Message,
  MessageTemplate,
  Payment,
  Plan,
  PlatformPlan,
  PlatformSubscription,
  Subscription,
  UsageRecord,
  User,
  WebhookEvent
} from '../models/index.js';
import { CustomField } from '../models/CustomField.js';
import { Note } from '../models/Note.js';
import { Opportunity } from '../models/Opportunity.js';
import { Pipeline } from '../models/Pipeline.js';
import { PipelineStage } from '../models/PipelineStage.js';
import { Segment } from '../models/Segment.js';
import { Tag } from '../models/Tag.js';
import { Task } from '../models/Task.js';
import {
  refreshCompanyOnboarding,
  refreshDistributorOnboarding
} from '../utils/onboarding.js';

const demoPassword =
  process.env.DEMO_PASSWORD || `${randomBytes(12).toString('base64url')}A1!`;
const superAdminPassword =
  process.env.SUPERADMIN_DEMO_PASSWORD || `${randomBytes(12).toString('base64url')}A1!`;

export async function seedDemoData({ clear = true } = {}) {
  if (clear) {
    await Promise.all([
      ActivityLog.deleteMany({}),
      WebhookEvent.deleteMany({}),
      Message.deleteMany({}),
      MessageTemplate.deleteMany({}),
      Note.deleteMany({}),
      Task.deleteMany({}),
      Opportunity.deleteMany({}),
      PipelineStage.deleteMany({}),
      Pipeline.deleteMany({}),
      Segment.deleteMany({}),
      CustomField.deleteMany({}),
      Tag.deleteMany({}),
      ChannelConfig.deleteMany({}),
      Conversation.deleteMany({}),
      Contact.deleteMany({}),
      Payment.deleteMany({}),
      Invoice.deleteMany({}),
      UsageRecord.deleteMany({}),
      ModuleEntitlement.deleteMany({}),
      PlatformSubscription.deleteMany({}),
      PlatformPlan.deleteMany({}),
      GlobalSettings.deleteMany({}),
      Subscription.deleteMany({}),
      Plan.deleteMany({}),
      Company.deleteMany({}),
      Distributor.deleteMany({}),
      User.deleteMany({})
    ]);
  }
  await Promise.all([
    Invoice.syncIndexes(),
    Plan.syncIndexes(),
    Tag.syncIndexes(),
    CustomField.syncIndexes(),
    ChannelConfig.syncIndexes(),
    Conversation.syncIndexes(),
    Message.syncIndexes(),
    MessageTemplate.syncIndexes(),
    WebhookEvent.syncIndexes()
  ]);

  const [andesDistributor, norteDistributor] = await Distributor.create([
    {
      name: 'Andes CRM Partners',
      slug: 'andes-crm',
      ownerName: 'Camila Rios',
      email: 'camila@andescrm.demo',
      status: 'active',
      region: 'Ecuador',
      branding: {
        companyName: 'Andes CRM',
        primaryColor: '#0e7490',
        secondaryColor: '#0f172a',
        accentColor: '#06b6d4',
        supportEmail: 'soporte@andescrm.demo',
        supportPhone: '+593 2 555 0101'
      },
      settings: {
        defaultCurrency: 'USD',
        defaultLocale: 'es-EC',
        defaultTimezone: 'America/Guayaquil'
      },
      billingSettings: {
        currency: 'USD',
        taxRate: 12,
        invoicePrefix: 'AND',
        invoiceNextNumber: 3,
        paymentInstructions: 'Transferencia bancaria demo.',
        gracePeriodDays: 5
      }
    },
    {
      name: 'Norte Digital Suite',
      slug: 'norte-digital',
      ownerName: 'Mateo Vargas',
      email: 'mateo@nortedigital.demo',
      status: 'trial',
      region: 'Colombia',
      branding: {
        companyName: 'Norte Digital',
        primaryColor: '#4f46e5',
        secondaryColor: '#111827',
        accentColor: '#8b5cf6'
      },
      billingSettings: {
        currency: 'USD',
        taxRate: 0,
        invoicePrefix: 'NOR',
        invoiceNextNumber: 1
      }
    }
  ]);

  const [starterPlan, growthPlan, enterprisePlan] = await Plan.create([
    {
      distributorId: andesDistributor._id,
      name: 'Starter Contactos',
      code: 'starter-contactos',
      description: 'Plan inicial para equipos pequenos con WhatsApp y contactos basicos.',
      price: 79,
      currency: 'USD',
      billingCycle: 'monthly',
      limits: { users: 8, contacts: 2500, messages: 0, storageMb: 2048, modules: 3 },
      includedModules: ['core', 'crm', 'contacts', 'opportunities', 'tasks', 'conversations', 'inbox'],
      features: ['1 canal', 'Contactos basicos', 'Reportes simples'],
      status: 'active'
    },
    {
      distributorId: andesDistributor._id,
      name: 'Growth Omnicanal',
      code: 'growth-omnicanal',
      description: 'Plan recomendado para empresas con varios supervisores y bandeja omnicanal.',
      price: 189,
      currency: 'USD',
      billingCycle: 'monthly',
      limits: { users: 25, contacts: 15000, messages: 0, storageMb: 10240, modules: 5 },
      includedModules: ['core', 'crm', 'contacts', 'opportunities', 'tasks', 'conversations', 'inbox', 'whatsapp', 'billing', 'reporting'],
      features: ['WhatsApp Cloud API', 'Facebook', 'Messenger', 'Metricas por agente'],
      status: 'active'
    },
    {
      distributorId: norteDistributor._id,
      name: 'Enterprise Regional',
      code: 'enterprise-regional',
      description: 'Plan corporativo con limites amplios y acompanamiento premium.',
      price: 499,
      currency: 'USD',
      billingCycle: 'monthly',
      limits: { users: 120, contacts: 100000, messages: 0, storageMb: 51200, modules: 8 },
      includedModules: ['core', 'crm', 'contacts', 'opportunities', 'tasks', 'conversations', 'inbox', 'whatsapp', 'billing', 'reporting'],
      features: ['Multi-sede', 'SLA prioritario', 'Onboarding asistido'],
      status: 'inactive'
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
      name: 'Super Admin',
      email: 'superadmin@example.com',
      password: superAdminPassword,
      role: 'SUPERADMIN',
      status: 'active'
    },
    {
      name: 'Camila Distribuidora',
      email: 'distributor@demo.com',
      password: demoPassword,
      role: 'DISTRIBUTOR',
      distributorId: andesDistributor._id,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
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
  const superAdminUser = users.find((user) => user.role === 'SUPERADMIN');
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
      status: 'trial',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    },
    {
      companyId: sendaCompany._id,
      planId: enterprisePlan._id,
      distributorId: norteDistributor._id,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  ]);

  const [platformStarter, platformScale] = await PlatformPlan.create([
    {
      name: 'Partner Starter',
      code: 'partner-starter',
      description: 'Plan demo para distribuidores pequenos.',
      price: 99,
      currency: 'USD',
      billingCycle: 'monthly',
      limits: {
        companies: 5,
        users: 30,
        contacts: 10000,
        modules: 6,
        storageMb: 5120,
        messages: 0
      },
      includedModules: ['core', 'crm', 'contacts', 'opportunities', 'tasks', 'conversations', 'inbox', 'whatsapp', 'billing', 'reporting'],
      status: 'active'
    },
    {
      name: 'Partner Scale',
      code: 'partner-scale',
      description: 'Plan demo anual para distribuidores en crecimiento.',
      price: 2388,
      currency: 'USD',
      billingCycle: 'yearly',
      limits: {
        companies: 50,
        users: 300,
        contacts: 250000,
        modules: 11,
        storageMb: 51200,
        messages: 0
      },
      includedModules: ['core', 'crm', 'contacts', 'opportunities', 'tasks', 'conversations', 'inbox', 'whatsapp', 'billing', 'reporting', 'integrations'],
      status: 'active'
    }
  ]);

  const periodEnd = new Date();
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  const [andesPlatformSubscription, nortePlatformSubscription] =
    await PlatformSubscription.create([
      {
        distributorId: andesDistributor._id,
        platformPlanId: platformScale._id,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
        paymentProvider: 'manual'
      },
      {
        distributorId: norteDistributor._id,
        platformPlanId: platformStarter._id,
        status: 'trial',
        trialEndsAt: periodEnd,
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
        paymentProvider: 'manual'
      }
    ]);

  const [paidInvoice] = await Invoice.create([
    {
      issuerType: 'platform',
      issuerId: null,
      customerType: 'distributor',
      customerId: andesDistributor._id,
      subscriptionType: 'platform',
      subscriptionId: andesPlatformSubscription._id,
      number: 'PLAT-DEMO-0001',
      currency: 'USD',
      subtotal: 199,
      tax: 0,
      total: 199,
      status: 'paid',
      dueDate: new Date(),
      paidAt: new Date(),
      lineItems: [
        {
          description: 'Partner Scale - mensualidad demo',
          quantity: 1,
          unitPrice: 199,
          total: 199
        }
      ]
    },
    {
      issuerType: 'platform',
      issuerId: null,
      customerType: 'distributor',
      customerId: norteDistributor._id,
      subscriptionType: 'platform',
      subscriptionId: nortePlatformSubscription._id,
      number: 'PLAT-DEMO-0002',
      currency: 'USD',
      subtotal: 99,
      tax: 0,
      total: 99,
      status: 'open',
      dueDate: periodEnd,
      lineItems: [
        {
          description: 'Partner Starter - mensualidad demo',
          quantity: 1,
          unitPrice: 99,
          total: 99
        }
      ]
    }
  ]);

  await Payment.create({
    invoiceId: paidInvoice._id,
    payerType: 'distributor',
    payerId: andesDistributor._id,
    amount: 199,
    currency: 'USD',
    status: 'succeeded',
    method: 'transfer',
    paymentProvider: 'manual',
    paidAt: new Date()
  });

  const [companyPaidInvoice, companyOpenInvoice] = await Invoice.create([
    {
      issuerType: 'distributor',
      issuerId: andesDistributor._id,
      customerType: 'company',
      customerId: novaCompany._id,
      subscriptionType: 'company',
      number: 'AND-000001',
      currency: 'USD',
      subtotal: 189,
      tax: 22.68,
      total: 211.68,
      status: 'paid',
      dueDate: new Date(),
      paidAt: new Date(),
      lineItems: [
        {
          description: 'Growth Omnicanal - mensualidad demo',
          quantity: 1,
          unitPrice: 189,
          total: 189
        }
      ],
      metadata: { taxRate: 12 }
    },
    {
      issuerType: 'distributor',
      issuerId: andesDistributor._id,
      customerType: 'company',
      customerId: altamarCompany._id,
      subscriptionType: 'company',
      number: 'AND-000002',
      currency: 'USD',
      subtotal: 79,
      tax: 9.48,
      total: 88.48,
      status: 'open',
      dueDate: periodEnd,
      lineItems: [
        {
          description: 'Starter Contactos - mensualidad demo',
          quantity: 1,
          unitPrice: 79,
          total: 79
        }
      ],
      metadata: { taxRate: 12 }
    }
  ]);

  await Payment.create({
    invoiceId: companyPaidInvoice._id,
    payerType: 'company',
    payerId: novaCompany._id,
    amount: 211.68,
    currency: 'USD',
    status: 'succeeded',
    method: 'transfer',
    paymentProvider: 'manual',
    paidAt: new Date()
  });

  const usagePeriodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  await UsageRecord.create([
    {
      scopeType: 'distributor',
      scopeId: andesDistributor._id,
      metric: 'companies',
      quantity: 2,
      periodStart: usagePeriodStart,
      periodEnd
    },
    {
      scopeType: 'distributor',
      scopeId: andesDistributor._id,
      metric: 'contacts',
      quantity: 4,
      periodStart: usagePeriodStart,
      periodEnd
    }
  ]);

  await ModuleEntitlement.create({
    scopeType: 'distributor',
    scopeId: andesDistributor._id,
    moduleKey: 'integrations',
    enabled: false
  });

  await GlobalSettings.create({
    key: 'global',
    platformName: 'TenantDesk',
    defaultCurrency: 'USD',
    defaultTaxRate: 0,
    supportEmail: 'support@example.com',
    billingSettings: { invoicePrefix: 'PLAT', paymentTermsDays: 15 }
  });

  const [hotTag, renewalTag, corporateTag] = await Tag.create([
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      name: 'Lead caliente',
      normalizedName: 'lead caliente',
      color: '#dc2626',
      description: 'Alta intencion comercial',
      createdBy: adminUser._id
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      name: 'Renovacion',
      normalizedName: 'renovacion',
      color: '#0e7490',
      createdBy: adminUser._id
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      name: 'Corporativo',
      normalizedName: 'corporativo',
      color: '#7c3aed',
      createdBy: adminUser._id
    }
  ]);

  await CustomField.create([
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      entityType: 'contact',
      key: 'tipo_poliza',
      label: 'Tipo de poliza',
      type: 'select',
      options: ['Vida', 'Vehiculo', 'Salud', 'Hogar'],
      order: 1,
      createdBy: adminUser._id
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      entityType: 'opportunity',
      key: 'prima_estimada',
      label: 'Prima estimada',
      type: 'number',
      order: 1,
      createdBy: adminUser._id
    }
  ]);

  await Segment.create({
    companyId: novaCompany._id,
    distributorId: andesDistributor._id,
    name: 'Seguimientos prioritarios',
    description: 'Contactos de alta prioridad que requieren seguimiento',
    filters: { status: 'seguimiento', priority: 'high' },
    createdBy: adminUser._id
  });

  const salesPipeline = await Pipeline.create({
    companyId: novaCompany._id,
    distributorId: andesDistributor._id,
    name: 'Ventas de seguros',
    description: 'Pipeline comercial principal',
    createdBy: adminUser._id
  });
  const pipelineStages = await PipelineStage.create(
    [
      ['Nuevo lead', 0, 10, '#0e7490'],
      ['Contactado', 1, 25, '#0284c7'],
      ['Calificado', 2, 45, '#7c3aed'],
      ['Propuesta enviada', 3, 65, '#d97706'],
      ['Negociacion', 4, 80, '#ea580c'],
      ['Ganado', 5, 100, '#059669'],
      ['Perdido', 6, 0, '#dc2626']
    ].map(([name, order, probability, color]) => ({
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      pipelineId: salesPipeline._id,
      name,
      order,
      probability,
      color
    }))
  );

  const [contactA, contactB, contactC, contactD] = await Contact.create([
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      assignedTo: callcenterUser._id,
      name: 'Mariana Paredes',
      firstName: 'Mariana',
      lastName: 'Paredes',
      fullName: 'Mariana Paredes',
      phone: '+593 99 220 1100',
      email: 'mariana@example.com',
      source: 'Campana renovacion',
      status: 'interesado',
      lifecycleStage: 'prospect',
      priority: 'high',
      tags: [hotTag._id, renewalTag._id],
      customFields: { tipo_poliza: 'Vida' },
      createdBy: adminUser._id,
      updatedBy: callcenterUser._id,
      lastContactAt: new Date(),
      nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      notes: [
        {
          text: 'Solicito informacion del plan familiar.',
          createdBy: callcenterUser._id
        }
      ]
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      assignedTo: callcenterUser._id,
      name: 'Jorge Almeida',
      phone: '+593 98 555 4231',
      email: 'jorge@example.com',
      source: 'Landing seguros',
      status: 'contactado',
      lifecycleStage: 'prospect',
      priority: 'medium',
      tags: [renewalTag._id],
      customFields: { tipo_poliza: 'Vehiculo' },
      createdBy: adminUser._id,
      updatedBy: callcenterUser._id,
      lastContactAt: new Date(),
      nextFollowUpAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      assignedTo: secondAgent._id,
      name: 'Paola Suarez',
      phone: '+593 97 144 3312',
      source: 'Facebook Lead',
      status: 'nuevo'
      ,lifecycleStage: 'lead'
      ,priority: 'high'
      ,tags: [corporateTag._id]
      ,customFields: { tipo_poliza: 'Salud' }
      ,createdBy: adminUser._id
      ,updatedBy: adminUser._id
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      assignedTo: secondAgent._id,
      name: 'Ivan Herrera',
      phone: '+593 96 881 7601',
      source: 'Base fria',
      status: 'no_interesado',
      lifecycleStage: 'lost',
      priority: 'low',
      createdBy: adminUser._id,
      updatedBy: secondAgent._id,
      lastContactAt: new Date()
    }
  ]);

  const [opportunityA, opportunityB] = await Opportunity.create([
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      contactId: contactA._id,
      pipelineId: salesPipeline._id,
      stageId: pipelineStages[2]._id,
      title: 'Poliza familiar Mariana',
      value: 1450,
      currency: 'USD',
      probability: 45,
      expectedCloseDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      assignedTo: callcenterUser._id,
      source: 'Campana renovacion',
      priority: 'high',
      customFields: { prima_estimada: 1450 },
      createdBy: adminUser._id,
      updatedBy: callcenterUser._id
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      contactId: contactC._id,
      pipelineId: salesPipeline._id,
      stageId: pipelineStages[1]._id,
      title: 'Cobertura para emprendimiento',
      value: 2800,
      currency: 'USD',
      probability: 25,
      expectedCloseDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      assignedTo: secondAgent._id,
      source: 'Facebook Lead',
      priority: 'medium',
      createdBy: adminUser._id,
      updatedBy: secondAgent._id
    }
  ]);

  await Task.create([
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      title: 'Enviar comparativo de coberturas',
      description: 'Adjuntar opciones familiar y premium',
      relatedType: 'opportunity',
      relatedId: opportunityA._id,
      assignedTo: callcenterUser._id,
      createdBy: supervisorUser._id,
      dueAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      priority: 'high'
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      title: 'Llamar para calificacion',
      relatedType: 'contact',
      relatedId: contactC._id,
      assignedTo: secondAgent._id,
      createdBy: supervisorUser._id,
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      priority: 'medium'
    }
  ]);

  await Note.create({
    companyId: novaCompany._id,
    distributorId: andesDistributor._id,
    relatedType: 'opportunity',
    relatedId: opportunityA._id,
    text: 'Cliente solicita incluir cobertura internacional.',
    createdBy: callcenterUser._id,
    visibility: 'team'
  });

  const whatsappConfig = await ChannelConfig.create({
    companyId: novaCompany._id,
    distributorId: andesDistributor._id,
    channel: 'whatsapp_cloud',
    displayName: 'WhatsApp Comercial Nova',
    phoneNumberId: 'demo_phone_number_id',
    status: 'pending',
    settings: { apiVersion: '' },
    createdBy: adminUser._id,
    metadata: { demoPreparedOnly: true }
  });

  const [conversationA, conversationB, conversationC] = await Conversation.create([
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      contactId: contactA._id,
      assignedTo: callcenterUser._id,
      channel: 'whatsapp_cloud',
      channelConfigId: whatsappConfig._id,
      externalConversationId: '593992201100',
      status: 'open',
      priority: 'high',
      lastMessage: 'Estoy interesada, enviame los detalles del plan familiar.',
      lastMessageAt: new Date(),
      lastInboundAt: new Date(),
      unreadCount: 2,
      createdBy: adminUser._id,
      updatedBy: callcenterUser._id
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      contactId: contactB._id,
      assignedTo: callcenterUser._id,
      channel: 'internal',
      status: 'pending',
      lastMessage: 'Gracias, lo reviso y te confirmo hoy.',
      lastMessageAt: new Date(Date.now() - 60 * 60 * 1000),
      lastOutboundAt: new Date(Date.now() - 60 * 60 * 1000),
      unreadCount: 0,
      createdBy: supervisorUser._id,
      updatedBy: callcenterUser._id
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      contactId: contactC._id,
      assignedTo: secondAgent._id,
      channel: 'internal',
      status: 'open',
      lastMessage: 'Necesito cobertura para mi emprendimiento.',
      lastMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      lastInboundAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      unreadCount: 1,
      createdBy: supervisorUser._id,
      updatedBy: secondAgent._id
    }
  ]);

  await Message.create([
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      conversationId: conversationA._id,
      contactId: contactA._id,
      channel: 'whatsapp_cloud',
      direction: 'inbound',
      type: 'text',
      text: 'Estoy interesada, enviame los detalles del plan familiar.',
      status: 'received',
      externalMessageId: 'demo_inbound_message_1',
      provider: 'whatsapp_cloud'
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      conversationId: conversationB._id,
      contactId: contactB._id,
      channel: 'internal',
      direction: 'outbound',
      type: 'text',
      text: 'Gracias, lo reviso y te confirmo hoy.',
      status: 'sent',
      provider: 'internal',
      sentBy: callcenterUser._id
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      conversationId: conversationC._id,
      contactId: contactC._id,
      channel: 'internal',
      direction: 'inbound',
      type: 'text',
      text: 'Necesito cobertura para mi emprendimiento.',
      status: 'received',
      provider: 'internal'
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      conversationId: conversationA._id,
      contactId: contactA._id,
      channel: 'whatsapp_cloud',
      direction: 'internal',
      type: 'system',
      text: 'Confirmar presupuesto antes de responder.',
      status: 'sent',
      provider: 'internal',
      sentBy: supervisorUser._id
    }
  ]);

  await MessageTemplate.create([
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      name: 'Saludo comercial',
      channel: 'internal',
      type: 'quick_reply',
      content: 'Hola, gracias por contactarnos. En que podemos ayudarte?',
      status: 'active',
      createdBy: adminUser._id
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      name: 'Seguimiento de propuesta',
      channel: 'whatsapp_cloud',
      type: 'quick_reply',
      content: 'Hola, queremos confirmar si pudiste revisar nuestra propuesta.',
      status: 'active',
      createdBy: adminUser._id,
      metadata: { providerApprovalRequiredForOutsideWindow: true }
    }
  ]);

  await ActivityLog.create([
    {
      distributorId: andesDistributor._id,
      userId: superAdminUser._id,
      type: 'platform_subscription_created',
      summary: 'Suscripcion demo de plataforma creada para Andes CRM Partners',
      metadata: { platformSubscriptionId: andesPlatformSubscription._id }
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      userId: callcenterUser._id,
      type: 'call',
      summary: 'Llamada de seguimiento con Mariana Paredes',
      metadata: { durationMinutes: 8, result: 'interesado' }
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      userId: callcenterUser._id,
      type: 'message',
      summary: 'Respuesta enviada por WhatsApp a Jorge Almeida',
      metadata: { channel: 'whatsapp' }
    },
    {
      companyId: novaCompany._id,
      distributorId: andesDistributor._id,
      userId: secondAgent._id,
      type: 'status_change',
      summary: 'Ivan Herrera marcado como no interesado',
      metadata: { from: 'contactado', to: 'no_interesado' }
    }
  ]);

  await Promise.all([
    refreshDistributorOnboarding(andesDistributor._id),
    refreshDistributorOnboarding(norteDistributor._id),
    refreshCompanyOnboarding(novaCompany._id),
    refreshCompanyOnboarding(altamarCompany._id),
    refreshCompanyOnboarding(sendaCompany._id)
  ]);

  return {
    distributors: 2,
    companies: 3,
    plans: 3,
    platformPlans: 2,
    platformSubscriptions: 2,
    invoices: 4,
    payments: 2,
    users: users.length,
    demoPassword,
    superAdmin: {
      email: 'superadmin@example.com',
      password: superAdminPassword,
      developmentOnly: true
    }
  };
}
