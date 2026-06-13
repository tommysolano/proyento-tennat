import {
  Building2,
  CreditCard,
  DollarSign,
  FileWarning,
  LogIn,
  Plus,
  RefreshCcw,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createDistributor,
  createPlatformInvoice,
  createPlatformPayment,
  createPlatformPlan,
  createPlatformSubscription,
  getAuditLog,
  getDistributors,
  getModules,
  getPlatformInvoices,
  getPlatformPayments,
  getPlatformPlans,
  getPlatformSubscriptions,
  getSuperAdminOverview,
  updateDistributor,
  updateModuleEntitlement,
  updatePlatformPlan,
  updatePlatformSubscription
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { LoadingState } from '../../components/AsyncState.jsx';
import {
  BillingPlanSummary,
  CurrencySelect
} from '../../components/BillingPlanSummary.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { FormField, FormSection } from '../../components/FormField.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  addDaysDateTimeInput,
  addDaysInput,
  localDateInput,
  localDateTimeInput,
  paymentDefaults,
  subscriptionPayload
} from '../../utils/billing.js';

const inputClass = 'w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm';
const PLATFORM_MODULES = [
  'core', 'crm', 'contacts', 'calendar', 'bookings', 'automations',
  'workflows', 'forms', 'surveys', 'landing_pages', 'funnels',
  'reputation', 'reviews', 'testimonials', 'coupons', 'referrals', 'loyalty',
  'billing', 'reporting', 'integrations'
];

const platformPlanLimits = [
  { name: 'companies', label: 'Empresas', hint: 'Cantidad maxima de empresas que puede crear el distribuidor.' },
  { name: 'users', label: 'Usuarios' },
  { name: 'contacts', label: 'Contactos' },
  { name: 'modules', label: 'Modulos' },
  { name: 'storageMb', label: 'Almacenamiento general (MB)' },
  { name: 'messages', label: 'Mensajes', hint: 'Cantidad maxima de mensajes permitidos.' },
  { name: 'whatsappMessages', label: 'Mensajes WhatsApp' },
  { name: 'mediaStorageMb', label: 'Media (MB)', hint: 'Espacio maximo para archivos multimedia.' },
  { name: 'mediaFiles', label: 'Archivos multimedia', hint: 'Cantidad maxima de archivos permitidos.' },
  { name: 'conversations', label: 'Conversaciones' },
  { name: 'calendars', label: 'Calendarios' },
  { name: 'appointments', label: 'Citas por mes' },
  { name: 'bookingLinks', label: 'Enlaces de reserva' },
  { name: 'workflows', label: 'Workflows' },
  { name: 'workflowRunsPerMonth', label: 'Ejecuciones de workflow por mes' },
  { name: 'workflowActionsPerMonth', label: 'Acciones de workflow por mes' },
  { name: 'forms', label: 'Formularios' },
  { name: 'formSubmissionsPerMonth', label: 'Respuestas de formularios por mes', hint: 'Envios recibidos entre todos los formularios.' },
  { name: 'landingPages', label: 'Landing pages' },
  { name: 'funnels', label: 'Funnels' },
  { name: 'funnelSteps', label: 'Pasos de funnel' },
  { name: 'pageViewsPerMonth', label: 'Vistas de pagina por mes' },
  { name: 'reviewRequestsPerMonth', label: 'Solicitudes de resena por mes' },
  { name: 'reviews', label: 'Resenas almacenadas', hint: 'Cantidad maxima de resenas guardadas.' },
  { name: 'reviewWidgets', label: 'Widgets de resenas' },
  { name: 'surveys', label: 'Encuestas de satisfaccion' },
  { name: 'surveyResponsesPerMonth', label: 'Respuestas de encuesta por mes' },
  { name: 'coupons', label: 'Cupones' },
  { name: 'couponRedemptionsPerMonth', label: 'Canjes de cupon por mes' },
  { name: 'referralPrograms', label: 'Programas de referidos' },
  { name: 'referralsPerMonth', label: 'Referidos por mes' }
];

function money(value, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function dateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function SuperAdminDashboard({ section = 'all' }) {
  const navigate = useNavigate();
  const { impersonateDistributor } = useAuth();
  const [overview, setOverview] = useState(null);
  const [distributors, setDistributors] = useState([]);
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [modules, setModules] = useState({ registry: [], entitlements: [] });
  const [audit, setAudit] = useState([]);
  const [moduleScopeType, setModuleScopeType] = useState('distributor');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [selectedPlatformPlanId, setSelectedPlatformPlanId] = useState('');
  const [platformSubscriptionStatus, setPlatformSubscriptionStatus] = useState('trial');
  const [invoiceSubscriptionId, setInvoiceSubscriptionId] = useState('');
  const [invoiceCurrency, setInvoiceCurrency] = useState('USD');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceDescription, setInvoiceDescription] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState(addDaysInput(15));
  const [paymentInvoiceId, setPaymentInvoiceId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentCurrency, setPaymentCurrency] = useState('USD');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [paymentDate, setPaymentDate] = useState(localDateInput());
  const [platformPlanModules, setPlatformPlanModules] = useState(PLATFORM_MODULES);

  const show = (name) => section === 'all' || section === name;

  const loadDashboard = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const [
        overviewData,
        distributorData,
        planData,
        subscriptionData,
        invoiceData,
        paymentData,
        moduleData,
        auditData
      ] = await Promise.all([
        getSuperAdminOverview(),
        getDistributors(),
        getPlatformPlans(),
        getPlatformSubscriptions(),
        getPlatformInvoices(),
        getPlatformPayments(),
        getModules(),
        getAuditLog()
      ]);
      setOverview(overviewData);
      setDistributors(distributorData);
      setPlans(planData);
      setSubscriptions(subscriptionData);
      setInvoices(invoiceData);
      setPayments(paymentData);
      setModules(moduleData);
      setAudit(auditData);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const distributorNames = useMemo(
    () => new Map(distributors.map((item) => [item._id, item.name])),
    [distributors]
  );
  const selectedPlatformPlan = plans.find((plan) => plan._id === selectedPlatformPlanId);
  const selectedInvoiceSubscription = subscriptions.find(
    (subscription) => subscription._id === invoiceSubscriptionId
  );
  const selectedPaymentInvoice = invoices.find(
    (invoice) => invoice._id === paymentInvoiceId
  );

  async function mutate(key, action, successMessage) {
    setBusy(key);
    setNotice('');
    setError('');
    try {
      await action();
      await loadDashboard(false);
      setNotice(successMessage);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setBusy('');
    }
  }

  async function handleCreateDistributor(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = data.get('name');
    const created = await mutate(
      'distributor-create',
      () =>
        createDistributor({
          name,
          slug: data.get('slug'),
          ownerName: data.get('ownerName'),
          email: data.get('email'),
          phone: data.get('phone'),
          region: data.get('region'),
          status: data.get('status'),
          ownerUser: {
            name: data.get('ownerName'),
            email: data.get('userEmail'),
            password: data.get('password')
          }
        }),
      `Distribuidor "${name}" creado con su usuario.`
    );
    if (created) form.reset();
  }

  async function handleEditDistributor(distributor) {
    const name = window.prompt('Nombre del distribuidor', distributor.name);
    if (!name) return;
    const email = window.prompt('Email del distribuidor', distributor.email);
    if (!email) return;
    const region = window.prompt('Region', distributor.region || 'LatAm');
    if (region === null) return;
    await mutate(
      `distributor-edit-${distributor._id}`,
      () => updateDistributor(distributor._id, { name, email, region }),
      `Distribuidor "${name}" actualizado.`
    );
  }

  async function handleDistributorStatus(distributor) {
    const nextStatus = distributor.status === 'suspended' ? 'active' : 'suspended';
    await mutate(
      `distributor-status-${distributor._id}`,
      () => updateDistributor(distributor._id, { status: nextStatus }),
      `Distribuidor ${nextStatus === 'suspended' ? 'suspendido' : 'reactivado'}.`
    );
  }

  async function handleImpersonate(distributor) {
    setError('');
    try {
      const data = await impersonateDistributor(distributor._id);
      navigate(data.redirectPath, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleCreatePlan(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = data.get('name');
    const created = await mutate(
      'plan-create',
      () =>
        createPlatformPlan({
          name,
          code: data.get('code'),
          description: data.get('description'),
          price: Number(data.get('price')),
          currency: data.get('currency'),
          billingCycle: data.get('billingCycle'),
          limits: {
            companies: Number(data.get('companies')),
            users: Number(data.get('users')),
            contacts: Number(data.get('contacts')),
            modules: Number(data.get('modules')),
            storageMb: Number(data.get('storageMb')),
            messages: Number(data.get('messages')),
            whatsappMessages: Number(data.get('whatsappMessages')),
            mediaStorageMb: Number(data.get('mediaStorageMb')),
            mediaFiles: Number(data.get('mediaFiles')),
            conversations: Number(data.get('conversations')),
            calendars: Number(data.get('calendars')),
            appointments: Number(data.get('appointments')),
            bookingLinks: Number(data.get('bookingLinks')),
            workflows: Number(data.get('workflows')),
            workflowRunsPerMonth: Number(data.get('workflowRunsPerMonth')),
            workflowActionsPerMonth: Number(data.get('workflowActionsPerMonth')),
            forms: Number(data.get('forms')),
            formSubmissionsPerMonth: Number(data.get('formSubmissionsPerMonth')),
            landingPages: Number(data.get('landingPages')),
            funnels: Number(data.get('funnels')),
            funnelSteps: Number(data.get('funnelSteps')),
            pageViewsPerMonth: Number(data.get('pageViewsPerMonth')),
            reviewRequestsPerMonth: Number(data.get('reviewRequestsPerMonth')),
            reviews: Number(data.get('reviews')),
            reviewWidgets: Number(data.get('reviewWidgets')),
            surveys: Number(data.get('surveys')),
            surveyResponsesPerMonth: Number(data.get('surveyResponsesPerMonth')),
            coupons: Number(data.get('coupons')),
            couponRedemptionsPerMonth: Number(data.get('couponRedemptionsPerMonth')),
            referralPrograms: Number(data.get('referralPrograms')),
            referralsPerMonth: Number(data.get('referralsPerMonth'))
          },
          includedModules: platformPlanModules,
          status: 'active'
        }),
      `Plan "${name}" creado.`
    );
    if (created) {
      form.reset();
      setPlatformPlanModules(PLATFORM_MODULES);
    }
  }

  async function handleEditPlan(plan) {
    const name = window.prompt('Nombre del plan', plan.name);
    if (!name) return;
    const price = window.prompt('Precio', plan.price);
    if (price === null) return;
    await mutate(
      `plan-edit-${plan._id}`,
      () => updatePlatformPlan(plan._id, { name, price: Number(price) }),
      `Plan "${name}" actualizado.`
    );
  }

  async function handlePlanStatus(plan) {
    const status = plan.status === 'active' ? 'inactive' : 'active';
    await mutate(
      `plan-status-${plan._id}`,
      () => updatePlatformPlan(plan._id, { status }),
      `Plan ${status === 'active' ? 'activado' : 'desactivado'}.`
    );
  }

  async function handleCreateSubscription(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    let terms;
    try {
      terms = subscriptionPayload({
        planId: data.get('platformPlanId'),
        status: data.get('status'),
        startsAt: data.get('startsAt'),
        trialEndsAt: data.get('trialEndsAt')
      });
    } catch (validationError) {
      setError(validationError.message);
      return;
    }
    const created = await mutate(
      'subscription-create',
      () =>
        createPlatformSubscription({
          distributorId: data.get('distributorId'),
          platformPlanId: terms.planId,
          status: terms.status,
          startsAt: terms.startsAt,
          ...(terms.trialEndsAt ? { trialEndsAt: terms.trialEndsAt } : {}),
          paymentProvider: 'manual'
        }),
      'Suscripcion de plataforma creada.'
    );
    if (created) {
      form.reset();
      setSelectedPlatformPlanId('');
      setPlatformSubscriptionStatus('trial');
    }
  }

  async function handleSubscriptionStatus(subscription) {
    const status =
      subscription.status === 'trial' || subscription.status === 'suspended'
        ? 'active'
        : 'suspended';
    await mutate(
      `subscription-status-${subscription._id}`,
      () => updatePlatformSubscription(subscription._id, { status }),
      `Suscripcion ${status}.`
    );
  }

  function handleInvoiceSubscription(subscriptionId) {
    setInvoiceSubscriptionId(subscriptionId);
    const subscription = subscriptions.find((item) => item._id === subscriptionId);
    const plan = subscription?.platformPlanId;
    setInvoiceCurrency(plan?.currency || 'USD');
    setInvoiceAmount(plan?.price === undefined ? '' : String(plan.price));
    setInvoiceDescription(
      plan ? `Suscripcion ${plan.name} - ${plan.billingCycle}` : ''
    );
  }

  function handlePaymentInvoice(invoiceId) {
    setPaymentInvoiceId(invoiceId);
    const invoice = invoices.find((item) => item._id === invoiceId);
    const defaults = paymentDefaults(
      invoice,
      distributorNames.get(String(invoice?.customerId)) || ''
    );
    setPaymentAmount(defaults.amount);
    setPaymentCurrency(defaults.currency);
    setPaymentDescription(defaults.description);
    setPaymentDate(defaults.paidAt);
  }

  async function handleCreateInvoice(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await mutate(
      'invoice-create',
      () =>
        createPlatformInvoice({
          distributorId: selectedInvoiceSubscription?.distributorId?._id,
          subscriptionId: invoiceSubscriptionId,
          currency: invoiceCurrency,
          tax: Number(data.get('tax') || 0),
          dueDate: data.get('dueDate'),
          status: 'open',
          lineItems: [
            {
              description: invoiceDescription,
              quantity: 1,
              unitPrice: Number(invoiceAmount)
            }
          ]
        }),
      'Factura manual creada.'
    );
    if (created) {
      form.reset();
      setInvoiceSubscriptionId('');
      setInvoiceCurrency('USD');
      setInvoiceAmount('');
      setInvoiceDescription('');
      setInvoiceDueDate(addDaysInput(15));
    }
  }

  async function handleCreatePayment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await mutate(
      'payment-create',
      () =>
        createPlatformPayment({
          invoiceId: data.get('invoiceId'),
          amount: Number(data.get('amount')),
          currency: data.get('currency'),
          method: data.get('method'),
          paidAt: data.get('paidAt'),
          status: 'succeeded',
          metadata: { description: data.get('description') }
        }),
      'Pago manual registrado.'
    );
    if (created) {
      form.reset();
      setPaymentInvoiceId('');
      setPaymentAmount('');
      setPaymentCurrency('USD');
      setPaymentDescription('');
      setPaymentDate(localDateInput());
    }
  }

  async function handleEntitlement(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const updated = await mutate(
      'module-update',
      () =>
        updateModuleEntitlement({
          scopeType: data.get('scopeType'),
          scopeId: data.get('scopeId'),
          moduleKey: data.get('moduleKey'),
          enabled: data.get('enabled') === 'true'
        }),
      'Configuracion de modulo actualizada.'
    );
    if (updated) form.reset();
  }

  if (loading) {
    return (
      <PageShell
        eyebrow="Control de plataforma"
        title="Panel del programador"
        description="Cargando operaciones SaaS desde la API..."
      >
        <LoadingState label="Cargando distribuidores, planes y operacion global..." />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Control de plataforma"
      title="Panel del programador"
      description="Gobierno de distribuidores, planes internos, billing, modulos y auditoria."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          {notice ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              {notice}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
              {error}
            </div>
          ) : null}
        </div>
        <Button variant="secondary" onClick={() => loadDashboard()} disabled={Boolean(busy)}>
          <RefreshCcw className="h-4 w-4" />
          Refrescar
        </Button>
      </div>

      {show('overview') ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Distribuidores" value={overview?.distributorsTotal ?? 0} helper={`${overview?.distributorsActive ?? 0} activos`} icon={Building2} tone="cyan" />
          <MetricCard label="Suspendidos" value={overview?.distributorsSuspended ?? 0} helper="Acceso bloqueado en backend" icon={FileWarning} tone="rose" />
          <MetricCard label="Ingreso mensual" value={money(overview?.expectedMonthlyRevenue)} helper={`${overview?.activeSubscriptions ?? 0} suscripciones activas/trial`} icon={DollarSign} tone="emerald" />
          <MetricCard label="Facturas pendientes" value={overview?.pendingInvoices ?? 0} helper={`${overview?.registeredModules ?? 0} modulos registrados`} icon={CreditCard} tone="amber" />
        </div>
      ) : null}

      {show('distributors') ? (
        <>
          <Card id="distributors">
            <CardHeader title="Distribuidores" description="Owners, estado y acceso controlado al tenant." />
            <Table
              data={distributors.map((item) => ({ ...item, id: item._id }))}
              emptyText="No hay distribuidores registrados"
              columns={[
                { key: 'name', header: 'Distribuidor' },
                { key: 'slug', header: 'Slug' },
                { key: 'email', header: 'Email' },
                { key: 'region', header: 'Region' },
                {
                  key: 'ownerUser',
                  header: 'Usuario',
                  render: (row) => row.ownerUser?.email || 'Sin usuario'
                },
                {
                  key: 'status',
                  header: 'Estado',
                  render: (row) => <Badge tone={row.status}>{row.status}</Badge>
                },
                {
                  key: 'actions',
                  header: 'Acciones',
                  render: (row) => (
                    <div className="flex gap-2">
                      <Button className="px-3" variant="secondary" onClick={() => handleEditDistributor(row)}>Editar</Button>
                      <Button className="px-3" variant={row.status === 'suspended' ? 'primary' : 'danger'} onClick={() => handleDistributorStatus(row)}>
                        {row.status === 'suspended' ? 'Reactivar' : 'Suspender'}
                      </Button>
                      <Button className="px-3" variant="secondary" disabled={!['active', 'trial'].includes(row.status) || !row.ownerUser} onClick={() => handleImpersonate(row)}>
                        <LogIn className="h-4 w-4" /> Entrar
                      </Button>
                    </div>
                  )
                }
              ]}
            />
          </Card>

          <Card>
            <CardHeader title="Crear distribuidor" description="Crea el tenant y su usuario DISTRIBUTOR en un solo flujo." />
            <form className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleCreateDistributor}>
              <FormField label="Nombre comercial" htmlFor="distributor-name" required>
                <input id="distributor-name" required name="name" className={inputClass} placeholder="Ej. Partner Ecuador" />
              </FormField>
              <FormField label="Slug" htmlFor="distributor-slug" hint="Identificador unico en minusculas y con guiones." required>
                <input id="distributor-slug" required name="slug" className={inputClass} placeholder="partner-ecuador" />
              </FormField>
              <FormField label="Nombre del responsable" htmlFor="distributor-owner" required>
                <input id="distributor-owner" required name="ownerName" className={inputClass} placeholder="Nombre completo" />
              </FormField>
              <FormField label="Email comercial" htmlFor="distributor-email" required>
                <input id="distributor-email" required type="email" name="email" className={inputClass} placeholder="ventas@partner.com" />
              </FormField>
              <FormField label="Telefono" htmlFor="distributor-phone">
                <input id="distributor-phone" name="phone" className={inputClass} placeholder="+593..." />
              </FormField>
              <FormField label="Region" htmlFor="distributor-region">
                <input id="distributor-region" name="region" className={inputClass} placeholder="Region" defaultValue="LatAm" />
              </FormField>
              <FormField label="Email de acceso" htmlFor="distributor-user-email" hint="Credencial del usuario DISTRIBUTOR." required>
                <input id="distributor-user-email" required type="email" name="userEmail" className={inputClass} placeholder="admin@partner.com" />
              </FormField>
              <FormField label="Contrasena temporal" htmlFor="distributor-password" hint="Minimo 8 caracteres." required>
                <input id="distributor-password" required minLength="8" type="password" name="password" className={inputClass} placeholder="Minimo 8 caracteres" />
              </FormField>
              <FormField label="Estado inicial" htmlFor="distributor-status">
                <select id="distributor-status" name="status" className={inputClass}>
                  <option value="trial">Trial</option>
                  <option value="active">Activo</option>
                </select>
              </FormField>
              <Button className="md:col-span-2 xl:col-span-3" type="submit" disabled={Boolean(busy)}>
                <Plus className="h-4 w-4" />
                {busy === 'distributor-create' ? 'Creando...' : 'Crear distribuidor y usuario'}
              </Button>
            </form>
          </Card>
        </>
      ) : null}

      {show('plans') ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.65fr]">
          <Card id="platform-plans">
            <CardHeader title="Planes de plataforma" description="Planes que la plataforma vende a distribuidores." />
            <Table
              data={plans.map((plan) => ({
                ...plan,
                id: plan._id,
                priceLabel: money(plan.price, plan.currency),
                limitsLabel: `${plan.limits?.companies ?? 0} empresas / ${plan.limits?.users ?? 0} usuarios / ${plan.limits?.contacts ?? 0} contactos`
              }))}
              emptyText="No hay planes de plataforma"
              columns={[
                { key: 'name', header: 'Plan' },
                { key: 'code', header: 'Codigo' },
                { key: 'priceLabel', header: 'Precio' },
                { key: 'billingCycle', header: 'Ciclo' },
                { key: 'limitsLabel', header: 'Limites' },
                { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
                {
                  key: 'actions',
                  header: 'Acciones',
                  render: (row) => (
                    <div className="flex gap-2">
                      <Button className="px-3" variant="secondary" onClick={() => handleEditPlan(row)}>Editar</Button>
                      <Button className="px-3" variant="secondary" onClick={() => handlePlanStatus(row)}>
                        {row.status === 'active' ? 'Desactivar' : 'Activar'}
                      </Button>
                    </div>
                  )
                }
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Crear plan interno" description="Limites aplicados por el backend." />
            <form className="space-y-3 p-5" onSubmit={handleCreatePlan}>
              <FormSection step="1" title="Informacion basica" description="Define la identidad, precio y ciclo del plan de plataforma.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Nombre" htmlFor="platform-plan-name" required>
                    <input id="platform-plan-name" required name="name" className={inputClass} placeholder="Ej. Partner Pro" />
                  </FormField>
                  <FormField label="Codigo unico" htmlFor="platform-plan-code" hint="Usa minusculas, numeros y guiones." required>
                    <input id="platform-plan-code" required name="code" className={inputClass} placeholder="partner-pro" />
                  </FormField>
                  <FormField label="Precio" htmlFor="platform-plan-price" required>
                    <input id="platform-plan-price" required min="0" step="0.01" type="number" name="price" className={inputClass} placeholder="0.00" />
                  </FormField>
                  <FormField label="Moneda" htmlFor="platform-plan-currency">
                    <CurrencySelect id="platform-plan-currency" name="currency" className={inputClass} defaultValue="USD" />
                  </FormField>
                  <FormField label="Ciclo de facturacion" htmlFor="platform-plan-cycle">
                    <select id="platform-plan-cycle" name="billingCycle" className={inputClass}>
                      <option value="monthly">Mensual</option>
                      <option value="yearly">Anual</option>
                    </select>
                  </FormField>
                  <FormField label="Descripcion" htmlFor="platform-plan-description" className="sm:col-span-2">
                    <textarea id="platform-plan-description" name="description" className={`${inputClass} min-h-20`} placeholder="Describe el alcance comercial del plan." />
                  </FormField>
                </div>
              </FormSection>
              <FormSection step="2" title="Limites operativos" description="El valor 0 mantiene el limite sin tope configurado.">
                <div className="grid grid-cols-2 gap-3">
                  {platformPlanLimits.map((field) => (
                    <FormField key={field.name} label={field.label} htmlFor={`platform-plan-${field.name}`} hint={field.hint} required>
                      <input
                        id={`platform-plan-${field.name}`}
                        required
                        min="0"
                        type="number"
                        name={field.name}
                        className={inputClass}
                        placeholder="0"
                      />
                    </FormField>
                  ))}
                </div>
              </FormSection>
              <FormSection step="3" title="Modulos incluidos" description="Estos modulos definen el techo disponible para el distribuidor.">
                <div className="grid gap-2 sm:grid-cols-2">
                  {PLATFORM_MODULES.map((moduleKey) => (
                    <label key={moduleKey} className="flex items-center gap-2 rounded-md border border-slate-200 p-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={platformPlanModules.includes(moduleKey)}
                        onChange={(event) =>
                          setPlatformPlanModules((current) =>
                            event.target.checked
                              ? [...new Set([...current, moduleKey])]
                              : current.filter((item) => item !== moduleKey)
                          )
                        }
                      />
                      {moduleKey}
                    </label>
                  ))}
                </div>
              </FormSection>
              <FormSection step="4" title="Revision" description="El plan se crea activo y podra asignarse a distribuidores.">
                <Button className="w-full" type="submit" disabled={Boolean(busy)}>Crear plan</Button>
              </FormSection>
            </form>
          </Card>
        </div>
      ) : null}

      {show('subscriptions') ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.65fr]">
          <Card id="subscriptions">
            <CardHeader title="Suscripciones de distribuidores" description="Plan vigente y periodos de cada tenant." />
            <Table
              data={subscriptions.map((item) => ({
                ...item,
                id: item._id,
                distributorLabel: item.distributorId?.name || '-',
                planLabel: item.platformPlanId?.name || '-',
                periodLabel: `${dateLabel(item.currentPeriodStart)} - ${dateLabel(item.currentPeriodEnd)}`
              }))}
              emptyText="No hay suscripciones de plataforma"
              columns={[
                { key: 'distributorLabel', header: 'Distribuidor' },
                { key: 'planLabel', header: 'Plan' },
                { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
                { key: 'periodLabel', header: 'Periodo' },
                {
                  key: 'actions',
                  header: 'Acciones',
                  render: (row) => (
                    <Button className="px-3" variant="secondary" onClick={() => handleSubscriptionStatus(row)}>
                      {row.status === 'trial' ? 'Activar' : row.status === 'suspended' ? 'Reactivar' : 'Suspender'}
                    </Button>
                  )
                }
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Asignar plan" description="Solo una suscripcion vigente por distribuidor." />
            <form className="space-y-3 p-5" onSubmit={handleCreateSubscription}>
              <FormField label="Distribuidor" htmlFor="platform-subscription-distributor" required>
                <select id="platform-subscription-distributor" required name="distributorId" defaultValue="" className={inputClass}>
                  <option value="" disabled>Selecciona distribuidor</option>
                  {distributors.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                </select>
              </FormField>
              <FormField label="Plan de plataforma" htmlFor="platform-subscription-plan" required>
                <select id="platform-subscription-plan" required name="platformPlanId" value={selectedPlatformPlanId} onChange={(event) => setSelectedPlatformPlanId(event.target.value)} className={inputClass}>
                  <option value="" disabled>Selecciona plan</option>
                  {plans.filter((item) => item.status === 'active').map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                </select>
              </FormField>
              <FormField label="Estado inicial" htmlFor="platform-subscription-status" hint="El trial no genera facturas hasta que la suscripcion se active.">
                <select id="platform-subscription-status" name="status" value={platformSubscriptionStatus} onChange={(event) => setPlatformSubscriptionStatus(event.target.value)} className={inputClass}>
                  <option value="trial">Trial</option>
                  <option value="active">Activa</option>
                </select>
              </FormField>
              <FormField label="Inicio" htmlFor="platform-subscription-start">
                <input id="platform-subscription-start" type="datetime-local" name="startsAt" defaultValue={localDateTimeInput()} className={inputClass} />
              </FormField>
              {platformSubscriptionStatus === 'trial' ? (
                <FormField label="Fin de trial" htmlFor="platform-subscription-trial-end" hint="Durante el trial no se pueden generar facturas." required>
                  <input id="platform-subscription-trial-end" required type="datetime-local" name="trialEndsAt" defaultValue={addDaysDateTimeInput(14)} className={inputClass} />
                </FormField>
              ) : null}
              <BillingPlanSummary plan={selectedPlatformPlan} trial={platformSubscriptionStatus === 'trial'} />
              <Button className="w-full" type="submit" disabled={Boolean(busy)}>Crear suscripcion</Button>
            </form>
          </Card>
        </div>
      ) : null}

      {show('billing') ? (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card id="billing">
              <CardHeader title="Facturas plataforma → distribuidor" description="Facturacion manual preparada para proveedor futuro." />
              <Table
                data={invoices.map((invoice) => ({
                  ...invoice,
                  id: invoice._id,
                  distributorLabel: distributorNames.get(String(invoice.customerId)) || String(invoice.customerId),
                  totalLabel: money(invoice.total, invoice.currency),
                  balanceLabel: money(invoice.balanceDue ?? invoice.total, invoice.currency),
                  dueLabel: dateLabel(invoice.dueDate)
                }))}
                emptyText="No hay facturas"
                columns={[
                  { key: 'number', header: 'Numero' },
                  { key: 'distributorLabel', header: 'Distribuidor' },
                  { key: 'totalLabel', header: 'Total' },
                  { key: 'balanceLabel', header: 'Pendiente' },
                  { key: 'dueLabel', header: 'Vence' },
                  { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
                  {
                    key: 'actions',
                    header: 'Accion',
                    render: (row) =>
                      ['open', 'overdue'].includes(row.status) ? 'Registrar pago abajo' : '-'
                  }
                ]}
              />
            </Card>
            <Card>
              <CardHeader title="Pagos recientes" description="Registros manuales, sin pasarela real." />
              <Table
                data={payments.map((payment) => ({
                  ...payment,
                  id: payment._id,
                  invoiceLabel: payment.invoiceId?.number || '-',
                  payerLabel: distributorNames.get(String(payment.payerId)) || String(payment.payerId),
                  amountLabel: money(payment.amount, payment.currency),
                  paidLabel: dateLabel(payment.paidAt)
                }))}
                emptyText="No hay pagos"
                columns={[
                  { key: 'invoiceLabel', header: 'Factura' },
                  { key: 'payerLabel', header: 'Distribuidor' },
                  { key: 'amountLabel', header: 'Monto' },
                  { key: 'method', header: 'Metodo' },
                  { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
                  { key: 'paidLabel', header: 'Fecha' }
                ]}
              />
            </Card>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Crear factura manual" description="Subtotal y total se calculan en servidor." />
              <form className="grid gap-3 p-5 md:grid-cols-2" onSubmit={handleCreateInvoice}>
                <FormField label="Suscripcion activa" htmlFor="invoice-subscription" required>
                  <select id="invoice-subscription" required name="subscriptionId" value={invoiceSubscriptionId} onChange={(event) => handleInvoiceSubscription(event.target.value)} className={inputClass}>
                    <option value="" disabled>Selecciona una suscripcion</option>
                    {subscriptions.filter((item) => item.status === 'active').map((item) => <option key={item._id} value={item._id}>{item.distributorId?.name} - {item.platformPlanId?.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Distribuidor vinculado" htmlFor="invoice-distributor">
                  <input id="invoice-distributor" value={selectedInvoiceSubscription?.distributorId?.name || ''} readOnly className={inputClass} />
                </FormField>
                <FormField label="Concepto" htmlFor="invoice-description" required>
                  <input id="invoice-description" required name="description" value={invoiceDescription} onChange={(event) => setInvoiceDescription(event.target.value)} className={inputClass} placeholder="Suscripcion mensual" />
                </FormField>
                <FormField label="Monto" htmlFor="invoice-amount" required>
                  <input id="invoice-amount" required min="0" step="0.01" type="number" name="amount" value={invoiceAmount} onChange={(event) => setInvoiceAmount(event.target.value)} className={inputClass} placeholder="0.00" />
                </FormField>
                <FormField label="Impuesto" htmlFor="invoice-tax">
                  <input id="invoice-tax" min="0" step="0.01" type="number" name="tax" className={inputClass} placeholder="0.00" defaultValue="0" />
                </FormField>
                <FormField label="Moneda" htmlFor="invoice-currency" hint="La moneda proviene del plan seleccionado.">
                  <input id="invoice-currency" name="currency" className={inputClass} value={invoiceCurrency} readOnly />
                </FormField>
                <FormField label="Fecha de vencimiento" htmlFor="invoice-due-date" required>
                  <input id="invoice-due-date" required type="date" name="dueDate" value={invoiceDueDate} onChange={(event) => setInvoiceDueDate(event.target.value)} className={inputClass} />
                </FormField>
                <Button type="submit" disabled={Boolean(busy) || !selectedInvoiceSubscription}>Crear factura</Button>
              </form>
            </Card>
            <Card>
              <CardHeader title="Registrar pago manual" description="Marca la factura pagada al cubrir su total." />
              <form className="grid gap-3 p-5 md:grid-cols-2" onSubmit={handleCreatePayment}>
                <FormField label="Factura pendiente" htmlFor="payment-invoice" required>
                  <select id="payment-invoice" required name="invoiceId" value={paymentInvoiceId} onChange={(event) => handlePaymentInvoice(event.target.value)} className={inputClass}>
                    <option value="" disabled>Selecciona una factura</option>
                    {invoices.filter((item) => ['open', 'overdue'].includes(item.status)).map((item) => <option key={item._id} value={item._id}>{item.number} - {money(item.balanceDue ?? item.total, item.currency)}</option>)}
                  </select>
                </FormField>
                <FormField label="Monto recibido" htmlFor="payment-amount" required>
                  <input id="payment-amount" required min="0.01" max={selectedPaymentInvoice?.balanceDue ?? selectedPaymentInvoice?.total} step="0.01" type="number" name="amount" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className={inputClass} placeholder="0.00" />
                </FormField>
                <FormField label="Moneda" htmlFor="payment-currency">
                  <input id="payment-currency" name="currency" className={inputClass} value={paymentCurrency} readOnly />
                </FormField>
                <FormField label="Metodo" htmlFor="payment-method">
                  <select id="payment-method" name="method" className={inputClass}>
                    <option value="transfer">Transferencia</option>
                    <option value="cash">Efectivo</option>
                    <option value="manual">Manual</option>
                  </select>
                </FormField>
                <FormField label="Descripcion" htmlFor="payment-description">
                  <input id="payment-description" name="description" value={paymentDescription} onChange={(event) => setPaymentDescription(event.target.value)} className={inputClass} placeholder="Referencia o comprobante" />
                </FormField>
                <FormField label="Fecha de pago" htmlFor="payment-date" required>
                  <input id="payment-date" required type="date" name="paidAt" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className={inputClass} />
                </FormField>
                <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 md:col-span-2">
                  Distribuidor: {distributorNames.get(String(selectedPaymentInvoice?.customerId)) || '-'}
                  {' | '}Suscripcion: {selectedPaymentInvoice?.subscriptionId || '-'}
                </div>
                <Button className="md:col-span-2" type="submit" disabled={Boolean(busy) || !selectedPaymentInvoice}>Registrar pago</Button>
              </form>
            </Card>
          </div>
        </>
      ) : null}

      {show('modules') ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.65fr]">
          <Card id="modules">
            <CardHeader title="Registro de modulos" description="Catalogo central; los modulos futuros siguen desactivados." />
            <Table
              data={modules.registry.map((item) => ({ ...item, id: item.key }))}
              emptyText="No hay modulos registrados"
              columns={[
                { key: 'name', header: 'Modulo' },
                { key: 'key', header: 'Key' },
                { key: 'description', header: 'Descripcion' },
                { key: 'version', header: 'Version' },
                { key: 'enabledByDefault', header: 'Default', render: (row) => row.enabledByDefault ? 'Activo' : 'Inactivo' },
                { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> }
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Entitlement" description="Override por distribuidor o plan." />
            <form className="space-y-3 p-5" onSubmit={handleEntitlement}>
              <FormField label="Tipo de alcance" htmlFor="entitlement-scope-type" hint="El override puede afectar a un distribuidor o a un plan completo." required>
                <select
                  id="entitlement-scope-type"
                  required
                  name="scopeType"
                  className={inputClass}
                  value={moduleScopeType}
                  onChange={(event) => setModuleScopeType(event.target.value)}
                >
                  <option value="distributor">Distribuidor</option>
                  <option value="platform_plan">Plan plataforma</option>
                </select>
              </FormField>
              <FormField label="Distribuidor o plan" htmlFor="entitlement-scope" required>
                <select id="entitlement-scope" required name="scopeId" defaultValue="" className={inputClass}>
                  <option value="" disabled>Selecciona el alcance</option>
                  {moduleScopeType === 'distributor'
                    ? distributors.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)
                    : plans.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                </select>
              </FormField>
              <FormField label="Modulo" htmlFor="entitlement-module" required>
                <select id="entitlement-module" required name="moduleKey" defaultValue="" className={inputClass}>
                  <option value="" disabled>Selecciona modulo</option>
                  {modules.registry.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
                </select>
              </FormField>
              <FormField label="Disponibilidad" htmlFor="entitlement-enabled" hint="Este valor reemplaza la configuracion heredada para el alcance seleccionado.">
                <select id="entitlement-enabled" name="enabled" className={inputClass}>
                  <option value="true">Activado</option>
                  <option value="false">Desactivado</option>
                </select>
              </FormField>
              <Button className="w-full" type="submit" disabled={Boolean(busy)}>Guardar entitlement</Button>
            </form>
            <div className="border-t border-slate-100 p-5 text-sm text-slate-500">
              {modules.entitlements.length
                ? `${modules.entitlements.length} overrides configurados.`
                : 'No hay overrides; se usan los modulos incluidos en el plan de plataforma.'}
            </div>
          </Card>
        </div>
      ) : null}

      {show('audit') ? (
        <Card id="audit">
          <CardHeader title="Auditoria" description="Acciones sensibles de plataforma e impersonacion." />
          <Table
            data={audit.map((item) => ({
              ...item,
              id: item._id,
              dateLabel: dateLabel(item.createdAt),
              actorLabel: `${item.userId?.name || 'Sistema'} (${item.userId?.role || '-'})`,
              distributorLabel: item.distributorId?.name || '-'
            }))}
            emptyText="No hay eventos de auditoria"
            columns={[
              { key: 'dateLabel', header: 'Fecha' },
              { key: 'actorLabel', header: 'Actor' },
              { key: 'distributorLabel', header: 'Distribuidor' },
              { key: 'type', header: 'Tipo' },
              { key: 'summary', header: 'Resumen' }
            ]}
          />
        </Card>
      ) : null}
    </PageShell>
  );
}
