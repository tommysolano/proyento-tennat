import { Activity, Building2, CreditCard, LogIn, Plus, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createCompany,
  createPlan,
  createSubscription,
  createUser,
  getActivityLogs,
  getCompanies,
  getDistributorModules,
  getMyPlatformInvoices,
  getMyPlatformPayments,
  getMyPlatformSubscription,
  getMyUsage,
  getPlans,
  getSubscriptions,
  getUsers,
  updatePlan
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
import { formatDate, idOf } from '../../utils/contacts.js';
import {
  addDaysDateTimeInput,
  formatMoney,
  localDateTimeInput,
  subscriptionPayload
} from '../../utils/billing.js';

const cycleLabels = {
  monthly: 'Mensual',
  yearly: 'Anual'
};

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

const distributorPlanLimits = [
  { name: 'users', label: 'Usuarios', hint: 'Usuarios internos permitidos en la empresa.' },
  { name: 'contacts', label: 'Contactos' },
  { name: 'messages', label: 'Mensajes', hint: 'Cantidad maxima de mensajes del plan.' },
  { name: 'storageMb', label: 'Almacenamiento general (MB)' },
  { name: 'whatsappMessages', label: 'Mensajes WhatsApp por mes' },
  { name: 'mediaStorageMb', label: 'Media (MB)', hint: 'Espacio maximo para archivos multimedia.' },
  { name: 'mediaFiles', label: 'Archivos multimedia', hint: 'Cantidad maxima de archivos permitidos.' },
  { name: 'conversations', label: 'Conversaciones por mes' },
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
  { name: 'referralsPerMonth', label: 'Referidos por mes' },
  { name: 'modules', label: 'Modulos' }
];

function formatLimits(limits = {}) {
  return `${limits.users ?? 0} usuarios / ${limits.contacts ?? 0} contactos / ${limits.whatsappMessages ?? 0} WA / ${limits.mediaStorageMb ?? 0} MB media`;
}

function formatPrice(price, currency = 'USD') {
  return formatMoney(price, currency);
}

export function DistributorDashboard() {
  const navigate = useNavigate();
  const { impersonateAdmin } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [plans, setPlans] = useState([]);
  const [users, setUsers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [activities, setActivities] = useState([]);
  const [moduleCatalog, setModuleCatalog] = useState({
    modules: [],
    authorizedModuleKeys: []
  });
  const [platformSubscription, setPlatformSubscription] = useState(null);
  const [platformInvoices, setPlatformInvoices] = useState([]);
  const [platformPayments, setPlatformPayments] = useState([]);
  const [platformUsage, setPlatformUsage] = useState({ current: {}, records: [] });
  const [platformBillingError, setPlatformBillingError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState('active');
  const [subscriptionCompanyId, setSubscriptionCompanyId] = useState('');
  const [adminCompanyId, setAdminCompanyId] = useState('');

  const loadDashboard = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const [
        companyData,
        planData,
        userData,
        subscriptionData,
        activityData,
        moduleData
      ] = await Promise.all([
          getCompanies(),
          getPlans(),
          getUsers(),
          getSubscriptions(),
          getActivityLogs(),
          getDistributorModules()
      ]);
      setCompanies(companyData);
      setPlans(planData);
      setUsers(userData);
      setSubscriptions(subscriptionData);
      setActivities(activityData);
      setModuleCatalog(moduleData);

      const platformData = await Promise.all([
        getMyPlatformSubscription(),
        getMyPlatformInvoices(),
        getMyPlatformPayments(),
        getMyUsage()
      ]).catch((requestError) => {
        setPlatformBillingError(requestError.message);
        return null;
      });
      if (platformData) {
        setPlatformBillingError('');
        setPlatformSubscription(platformData[0]);
        setPlatformInvoices(platformData[1]);
        setPlatformPayments(platformData[2]);
        setPlatformUsage(platformData[3]);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const visiblePlans = useMemo(
    () =>
      plans.map((plan) => ({
        ...plan,
        id: plan._id,
        priceLabel: formatPrice(plan.price, plan.currency),
        cycleLabel: cycleLabels[plan.billingCycle] || plan.billingCycle,
        limitsLabel: formatLimits(plan.limits),
        featuresLabel: plan.features?.join(', ') || 'Sin funciones'
      })),
    [plans]
  );

  const visibleCompanies = useMemo(
    () =>
      companies.map((company) => {
        const subscription = subscriptions.find(
          (item) =>
            idOf(item.companyId) === company._id &&
            ['active', 'trial', 'past_due', 'suspended'].includes(item.status)
        );
        const admin =
          (typeof company.adminId === 'object' && company.adminId) ||
          users.find(
            (user) => user.role === 'ADMIN' && idOf(user.companyId) === company._id
          );
        return {
          ...company,
          id: company._id,
          adminEmail: admin?.email || '',
          planName: subscription?.planId?.name || 'Sin plan',
          subscriptionStatus: subscription?.status || 'sin_suscripcion'
        };
      }),
    [companies, subscriptions, users]
  );

  const companiesWithoutAdmin = companies.filter(
    (company) => !company.adminId || company.adminId.status !== 'active'
  );
  const subscribedCompanyIds = new Set(
    subscriptions
      .filter((subscription) =>
        ['active', 'trial', 'past_due', 'suspended'].includes(subscription.status)
      )
      .map((subscription) => idOf(subscription.companyId))
  );
  const companiesWithoutSubscription = companies.filter(
    (company) => !subscribedCompanyIds.has(company._id)
  );

  async function runMutation(key, action, successMessage) {
    setSubmitting(key);
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
      setSubmitting('');
    }
  }

  async function handleCreatePlan(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = data.get('name');
    const created = await runMutation(
      'plan',
      () =>
        createPlan({
          name,
          price: Number(data.get('price')),
          billingCycle: data.get('billingCycle'),
          description: data.get('description'),
          limits: {
            users: Number(data.get('users')),
            contacts: Number(data.get('contacts')),
            messages: Number(data.get('messages')),
            storageMb: Number(data.get('storageMb')),
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
            referralsPerMonth: Number(data.get('referralsPerMonth')),
            modules: Number(data.get('modules'))
          },
          code: data.get('code'),
          currency: data.get('currency'),
          includedModules: data.getAll('includedModules'),
          features: String(data.get('features') || '')
            .split(',')
            .map((feature) => feature.trim())
            .filter(Boolean),
          status: data.get('status')
        }),
      `Plan "${name}" creado correctamente.`
    );
    if (created) form.reset();
  }

  async function handleEditPlan(plan) {
    const name = window.prompt('Nombre del plan', plan.name);
    if (!name) return;
    const price = window.prompt('Precio', plan.price);
    if (price === null) return;
    await runMutation(
      `plan-edit-${plan._id}`,
      () => updatePlan(plan._id, { name, price: Number(price) }),
      `Plan "${name}" actualizado.`
    );
  }

  async function handlePlanStatus(plan) {
    const status = plan.status === 'active' ? 'inactive' : 'active';
    await runMutation(
      `plan-status-${plan._id}`,
      () => updatePlan(plan._id, { status }),
      `Plan ${status === 'active' ? 'activado' : 'desactivado'}.`
    );
  }

  async function handleCreateCompany(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = data.get('name');
    const created = await runMutation(
      'company',
      () =>
        createCompany({
          name,
          taxId: data.get('taxId'),
          industry: data.get('industry'),
          status: data.get('status')
        }),
      `Empresa "${name}" creada correctamente.`
    );
    if (created) form.reset();
  }

  async function handleCreateAdmin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = data.get('name');
    const created = await runMutation(
      'admin',
      () =>
        createUser({
          name,
          email: data.get('email'),
          password: data.get('password'),
          role: 'ADMIN',
          companyId: data.get('companyId')
        }),
      `Administrador "${name}" creado correctamente.`
    );
    if (created) {
      form.reset();
      setAdminCompanyId('');
    }
  }

  async function handleCreateSubscription(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await runMutation(
      'subscription',
      () =>
        createSubscription(subscriptionPayload({
          companyId: data.get('companyId'),
          planId: data.get('planId'),
          status: data.get('status'),
          startsAt: data.get('startsAt'),
          trialEndsAt: data.get('trialEndsAt'),
          endsAt: data.get('endsAt')
        })),
      'Suscripcion creada correctamente.'
    );
    if (created) {
      form.reset();
      setSubscriptionCompanyId('');
      setSelectedPlanId('');
      setSubscriptionStatus('active');
    }
  }

  async function handleEnterAdmin(company) {
    setError('');
    try {
      const data = await impersonateAdmin(company._id);
      navigate(data.redirectPath, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (loading) {
    return (
      <PageShell
        eyebrow="Operacion comercial"
        title="Dashboard del distribuidor"
        description="Cargando empresas, planes, administradores y suscripciones..."
      >
        <LoadingState label="Cargando empresas, planes y suscripciones..." />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Operacion comercial"
      title="Dashboard del distribuidor"
      description="Gestion real e independiente de empresas, administradores, planes y suscripciones."
    >
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

      <div id="estadisticas" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Empresas totales" value={companies.length} helper={`${companies.filter((company) => company.status === 'active').length} activas`} icon={Building2} tone="emerald" />
        <MetricCard label="Planes activos" value={plans.filter((plan) => plan.status === 'active').length} helper={`${plans.length} planes totales`} icon={CreditCard} tone="cyan" />
        <MetricCard label="Suscripciones activas" value={subscriptions.filter((item) => item.status === 'active').length} helper={`${subscriptions.filter((item) => item.status === 'trial').length} en prueba`} icon={Activity} tone="rose" />
        <MetricCard label="Admins creados" value={users.filter((user) => user.role === 'ADMIN').length} helper="Empresas con responsable" icon={UsersRound} tone="amber" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.72fr]">
        <Card id="planes">
          <CardHeader title="Planes de suscripcion" description="Planes persistidos para este distribuidor." />
          <Table
            data={visiblePlans}
            emptyText="Todavia no hay planes creados"
            columns={[
              { key: 'name', header: 'Nombre' },
              { key: 'code', header: 'Codigo' },
              { key: 'priceLabel', header: 'Precio' },
              { key: 'cycleLabel', header: 'Ciclo' },
              { key: 'limitsLabel', header: 'Limites' },
              { key: 'featuresLabel', header: 'Funciones' },
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
                    <Button className="px-3" variant="secondary" onClick={() => handleEditPlan(row)}>
                      Editar
                    </Button>
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
          <CardHeader title="Crear plan" description="Precio, ciclo, limites y funciones validados." />
          <form className="space-y-4 p-5" onSubmit={handleCreatePlan}>
            <FormSection step="1" title="Informacion basica" description="Define como se mostrara y cobrara el plan.">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Nombre del plan" htmlFor="plan-name" required>
                  <input id="plan-name" required name="name" className={inputClass} placeholder="Ej. Crecimiento" />
                </FormField>
                <FormField label="Codigo unico" htmlFor="plan-code" hint="Usa minusculas, numeros y guiones." required>
                  <input id="plan-code" required name="code" className={inputClass} placeholder="crecimiento-mensual" />
                </FormField>
                <FormField label="Precio" htmlFor="plan-price" required>
                  <input id="plan-price" required min="0" step="0.01" type="number" name="price" className={inputClass} placeholder="0.00" />
                </FormField>
                <FormField label="Moneda" htmlFor="plan-currency">
                  <CurrencySelect id="plan-currency" name="currency" defaultValue="USD" className={inputClass} />
                </FormField>
                <FormField label="Ciclo de facturacion" htmlFor="plan-cycle">
                  <select id="plan-cycle" name="billingCycle" className={inputClass}>
                    <option value="monthly">Mensual</option>
                    <option value="yearly">Anual</option>
                  </select>
                </FormField>
                <FormField label="Descripcion" htmlFor="plan-description" className="sm:col-span-2">
                  <textarea id="plan-description" name="description" className={`${inputClass} min-h-20`} placeholder="Explica para que tipo de cliente es este plan." />
                </FormField>
              </div>
            </FormSection>

            <FormSection step="2" title="Limites operativos" description="El valor 0 mantiene el limite sin tope configurado.">
              <div className="grid gap-3 sm:grid-cols-2">
                {distributorPlanLimits.map((field) => (
                  <FormField
                    key={field.name}
                    label={field.label}
                    htmlFor={`plan-${field.name}`}
                    hint={field.hint}
                    required
                  >
                    <input
                      id={`plan-${field.name}`}
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

            <FormSection step="3" title="Modulos incluidos" description="Solo se muestran modulos autorizados por SUPERADMIN para este distribuidor.">
              <div className="grid gap-2 sm:grid-cols-2">
                {moduleCatalog.modules
                  .filter((module) => module.authorized)
                  .map((module) => (
                    <label key={module.key} className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        name="includedModules"
                        value={module.key}
                        defaultChecked={['core', 'crm', 'contacts'].includes(module.key)}
                      />
                      <span>
                        <span className="block font-medium">{module.name}</span>
                        <span className="block text-xs text-slate-500">{module.description}</span>
                      </span>
                    </label>
                  ))}
              </div>
              {!moduleCatalog.authorizedModuleKeys.length ? (
                <p className="text-sm text-amber-700">
                  No hay modulos comerciales autorizados para crear planes.
                </p>
              ) : null}
            </FormSection>

            <FormSection step="4" title="Revision y estado" description="Agrega beneficios visibles y decide si el plan puede asignarse de inmediato.">
              <div className="space-y-3">
                <FormField label="Funciones visibles" htmlFor="plan-features" hint="Separa cada beneficio con una coma.">
                  <input id="plan-features" name="features" className={inputClass} placeholder="Inbox, CRM, calendario" />
                </FormField>
                <FormField label="Estado del plan" htmlFor="plan-status">
                  <select id="plan-status" name="status" className={inputClass}>
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </FormField>
                <Button className="w-full" type="submit" disabled={Boolean(submitting)}>
                  {submitting === 'plan' ? 'Guardando...' : 'Crear plan'}
                </Button>
              </div>
            </FormSection>
          </form>
        </Card>
      </div>

      <Card id="modulos-autorizados">
        <CardHeader
          title="Opciones autorizadas"
          description="Solo estos modulos pueden incluirse en planes o configuraciones del distribuidor."
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {moduleCatalog.modules.map((module) => (
            <div
              key={module.key}
              className={`rounded-md border p-3 ${
                module.authorized
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{module.name}</p>
                <Badge tone={module.authorized ? 'active' : 'inactive'}>
                  {module.authorized ? 'Autorizado' : 'No autorizado'}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">{module.description}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card id="empresas">
        <CardHeader title="Empresas / clientes" description="Empresas, admins y planes asociados desde MongoDB." />
        <Table
          data={visibleCompanies}
          emptyText="Todavia no hay empresas creadas"
          columns={[
            { key: 'name', header: 'Empresa' },
            { key: 'industry', header: 'Industria' },
            { key: 'adminEmail', header: 'Administrador', render: (row) => row.adminEmail || 'Sin admin' },
            { key: 'planName', header: 'Plan' },
            {
              key: 'subscriptionStatus',
              header: 'Suscripcion',
              render: (row) => <Badge tone={row.subscriptionStatus}>{row.subscriptionStatus}</Badge>
            },
            {
              key: 'status',
              header: 'Empresa',
              render: (row) => <Badge tone={row.status}>{row.status}</Badge>
            },
            {
              key: 'access',
              header: 'Acceso',
              render: (row) => (
                <Button
                  className="min-h-9 px-3"
                  variant="secondary"
                  disabled={!row.adminEmail || Boolean(submitting)}
                  onClick={() => handleEnterAdmin(row)}
                >
                  <LogIn className="h-4 w-4" />
                  Entrar como admin
                </Button>
              )
            }
          ]}
        />
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card id="crear-empresa">
          <CardHeader title="Crear empresa" description="El distributorId se toma del JWT." />
          <form className="space-y-4 p-5" onSubmit={handleCreateCompany}>
            <FormField label="Nombre de la empresa" htmlFor="company-name" required>
              <input id="company-name" required name="name" className={inputClass} placeholder="Ej. Empresa Andina" />
            </FormField>
            <FormField label="RUC / Tax ID" htmlFor="company-tax-id" hint="Identificador fiscal opcional.">
              <input id="company-tax-id" name="taxId" className={inputClass} placeholder="0999999999001" />
            </FormField>
            <FormField label="Industria" htmlFor="company-industry">
              <input id="company-industry" name="industry" className={inputClass} placeholder="Ej. Servicios profesionales" />
            </FormField>
            <FormField label="Estado inicial" htmlFor="company-status">
              <select id="company-status" name="status" className={inputClass}>
                <option value="active">Activa</option>
                <option value="trial">Prueba</option>
                <option value="suspended">Suspendida</option>
              </select>
            </FormField>
            <Button className="w-full" type="submit" disabled={Boolean(submitting)}>
              <Plus className="h-4 w-4" />
              {submitting === 'company' ? 'Creando...' : 'Crear empresa'}
            </Button>
          </form>
        </Card>

        <Card id="admins">
          <CardHeader title="Crear administrador" description="Solo para una empresa propia sin admin activo." />
          <form className="space-y-4 p-5" onSubmit={handleCreateAdmin}>
            <FormField label="Empresa" htmlFor="admin-company" required>
              <select id="admin-company" required name="companyId" value={adminCompanyId} onChange={(event) => setAdminCompanyId(event.target.value)} className={inputClass}>
                <option value="" disabled>Selecciona una empresa</option>
                {companiesWithoutAdmin.map((company) => (
                  <option key={company._id} value={company._id}>{company.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Nombre del administrador" htmlFor="admin-name" required>
              <input id="admin-name" required name="name" className={inputClass} placeholder="Nombre completo" />
            </FormField>
            <FormField label="Email de acceso" htmlFor="admin-email" required>
              <input id="admin-email" required type="email" name="email" className={inputClass} placeholder="admin@empresa.com" />
            </FormField>
            <FormField label="Contrasena temporal" htmlFor="admin-password" hint="Minimo 8 caracteres. Comparte la clave por un canal seguro." required>
              <input id="admin-password" required minLength="8" type="password" name="password" className={inputClass} placeholder="Minimo 8 caracteres" />
            </FormField>
            <Button className="w-full" type="submit" disabled={Boolean(submitting) || !companiesWithoutAdmin.length}>
              <Plus className="h-4 w-4" />
              {submitting === 'admin' ? 'Creando...' : 'Crear admin'}
            </Button>
          </form>
        </Card>

        <Card id="suscripciones">
          <CardHeader title="Crear suscripcion" description="No permite otra activa o trial para la misma empresa." />
          <form className="space-y-4 p-5" onSubmit={handleCreateSubscription}>
            <FormField label="Empresa" htmlFor="subscription-company" required>
              <select
                id="subscription-company"
                required
                name="companyId"
                value={subscriptionCompanyId}
                onChange={(event) => {
                  setSubscriptionCompanyId(event.target.value);
                  setSelectedPlanId('');
                }}
                className={inputClass}
              >
                <option value="" disabled>Selecciona una empresa</option>
                {companiesWithoutSubscription.map((company) => (
                  <option key={company._id} value={company._id}>{company.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Plan comercial" htmlFor="subscription-plan" required>
              <select required disabled={!subscriptionCompanyId} id="subscription-plan" name="planId" value={selectedPlanId} onChange={(event) => setSelectedPlanId(event.target.value)} className={inputClass}>
                <option value="" disabled>Selecciona un plan</option>
                {(subscriptionCompanyId ? plans : []).filter((plan) => plan.status === 'active').map((plan) => (
                  <option key={plan._id} value={plan._id}>{plan.name} - {formatPrice(plan.price, plan.currency)}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Estado inicial" htmlFor="subscription-status" hint="El trial no genera facturas mientras permanezca en prueba.">
              <select id="subscription-status" name="status" value={subscriptionStatus} onChange={(event) => setSubscriptionStatus(event.target.value)} className={inputClass}>
                <option value="active">Activa</option>
                <option value="trial">Prueba</option>
              </select>
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Inicio" htmlFor="subscription-start">
                <input id="subscription-start" type="datetime-local" name="startsAt" defaultValue={localDateTimeInput()} className={inputClass} />
              </FormField>
              <FormField label="Fin opcional" htmlFor="subscription-end">
                <input id="subscription-end" type="datetime-local" name="endsAt" className={inputClass} />
              </FormField>
            </div>
            {subscriptionStatus === 'trial' ? (
              <FormField label="Fin de trial" htmlFor="subscription-trial-end" hint="Durante el trial no se pueden generar facturas." required>
                <input id="subscription-trial-end" required type="datetime-local" name="trialEndsAt" defaultValue={addDaysDateTimeInput(14)} className={inputClass} />
              </FormField>
            ) : null}
            <BillingPlanSummary
              plan={plans.find((plan) => plan._id === selectedPlanId)}
              trial={subscriptionStatus === 'trial'}
            />
            <Button className="w-full" type="submit" disabled={Boolean(submitting) || !companiesWithoutSubscription.length || !plans.some((plan) => plan.status === 'active')}>
              <Plus className="h-4 w-4" />
              {submitting === 'subscription' ? 'Creando...' : 'Crear suscripcion'}
            </Button>
          </form>
        </Card>
      </div>

      <Card id="actividad">
        <CardHeader title="Actividad del distribuidor" description="Altas e impersonaciones registradas por la API." />
        <Table
          data={activities.map((item) => ({
            ...item,
            id: item._id,
            dateLabel: formatDate(item.createdAt),
            companyLabel: item.companyId?.name || '-',
            userLabel: item.userId?.name || 'Usuario'
          }))}
          emptyText="No hay actividad registrada"
          columns={[
            { key: 'dateLabel', header: 'Fecha' },
            { key: 'companyLabel', header: 'Empresa' },
            { key: 'userLabel', header: 'Usuario' },
            { key: 'type', header: 'Tipo' },
            { key: 'summary', header: 'Resumen' }
          ]}
        />
      </Card>

      <div id="plataforma" className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Mi plan de plataforma" description="Suscripcion del distribuidor con la plataforma." />
          <div className="space-y-4 p-5">
            {platformBillingError ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {platformBillingError}
              </p>
            ) : platformSubscription ? (
              <>
                <div className="flex items-start justify-between rounded-lg border border-slate-200 p-4">
                  <div>
                    <p className="text-sm text-slate-500">Plan</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">
                      {platformSubscription.platformPlanId?.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatPrice(platformSubscription.platformPlanId?.price, platformSubscription.platformPlanId?.currency)} / {platformSubscription.platformPlanId?.billingCycle}
                    </p>
                  </div>
                  <Badge tone={platformSubscription.status}>{platformSubscription.status}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {['companies', 'users', 'contacts'].map((metric) => (
                    <div key={metric} className="rounded-lg bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase text-slate-500">{metric}</p>
                      <p className="mt-1 text-xl font-semibold text-slate-950">
                        {platformUsage.current?.[metric] ?? 0}
                        <span className="text-sm font-normal text-slate-400">
                          {' '}/ {platformSubscription.platformPlanId?.limits?.[metric] ?? '-'}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-slate-500">
                  Modulos incluidos: {platformSubscription.platformPlanId?.includedModules?.join(', ') || 'Sin modulos'}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">No hay una suscripcion de plataforma visible.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Facturas y pagos de plataforma" description="Solo datos del distribuidor autenticado." />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-950">Facturas</p>
              <div className="space-y-2">
                {platformInvoices.length ? platformInvoices.slice(0, 5).map((invoice) => (
                  <div key={invoice._id} className="rounded-md border border-slate-200 p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="font-semibold">{invoice.number}</span>
                      <Badge tone={invoice.status}>{invoice.status}</Badge>
                    </div>
                    <p className="mt-2 text-slate-500">{formatPrice(invoice.total, invoice.currency)}</p>
                  </div>
                )) : <p className="text-sm text-slate-500">Sin facturas.</p>}
              </div>
            </div>
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-950">Pagos</p>
              <div className="space-y-2">
                {platformPayments.length ? platformPayments.slice(0, 5).map((payment) => (
                  <div key={payment._id} className="rounded-md border border-slate-200 p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="font-semibold">{payment.invoiceId?.number || 'Pago manual'}</span>
                      <Badge tone={payment.status}>{payment.status}</Badge>
                    </div>
                    <p className="mt-2 text-slate-500">{formatPrice(payment.amount, payment.currency)}</p>
                  </div>
                )) : <p className="text-sm text-slate-500">Sin pagos.</p>}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
