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
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDate, idOf } from '../../utils/contacts.js';

const cycleLabels = {
  monthly: 'Mensual',
  yearly: 'Anual'
};

function formatLimits(limits = {}) {
  return `${limits.users ?? 0} usuarios / ${limits.contacts ?? 0} contactos / ${limits.whatsappMessages ?? 0} WA / ${limits.mediaStorageMb ?? 0} MB media`;
}

function formatPrice(price) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(Number(price) || 0);
}

export function DistributorDashboard() {
  const navigate = useNavigate();
  const { impersonateAdmin } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [plans, setPlans] = useState([]);
  const [users, setUsers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [activities, setActivities] = useState([]);
  const [platformSubscription, setPlatformSubscription] = useState(null);
  const [platformInvoices, setPlatformInvoices] = useState([]);
  const [platformPayments, setPlatformPayments] = useState([]);
  const [platformUsage, setPlatformUsage] = useState({ current: {}, records: [] });
  const [platformBillingError, setPlatformBillingError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const [companyData, planData, userData, subscriptionData, activityData] = await Promise.all([
          getCompanies(),
          getPlans(),
          getUsers(),
          getSubscriptions(),
          getActivityLogs()
      ]);
      setCompanies(companyData);
      setPlans(planData);
      setUsers(userData);
      setSubscriptions(subscriptionData);
      setActivities(activityData);

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
        priceLabel: formatPrice(plan.price),
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
            modules: Number(data.get('modules'))
          },
          code: data.get('code'),
          currency: data.get('currency'),
          includedModules: String(data.get('includedModules') || '')
            .split(',')
            .map((moduleKey) => moduleKey.trim())
            .filter(Boolean),
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
    if (created) form.reset();
  }

  async function handleCreateSubscription(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await runMutation(
      'subscription',
      () =>
        createSubscription({
          companyId: data.get('companyId'),
          planId: data.get('planId'),
          status: data.get('status'),
          startsAt: data.get('startsAt') || new Date().toISOString(),
          endsAt: data.get('endsAt') || null
        }),
      'Suscripcion creada correctamente.'
    );
    if (created) form.reset();
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
        <Card className="p-8 text-center text-sm text-slate-500">
          Cargando datos reales desde la API...
        </Card>
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
            <input required name="name" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Nombre del plan" />
            <input required name="code" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="codigo-del-plan" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input required min="0" step="0.01" type="number" name="price" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Precio USD" />
              <select name="billingCycle" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm">
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
              </select>
            </div>
            <input name="currency" defaultValue="USD" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Moneda" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input required min="0" type="number" name="users" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Usuarios" />
              <input required min="0" type="number" name="contacts" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Contactos" />
              <input required min="0" type="number" name="messages" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Mensajes" />
              <input required min="0" type="number" name="storageMb" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Storage MB" />
              <input required min="0" type="number" name="whatsappMessages" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Mensajes WhatsApp/mes" />
              <input required min="0" type="number" name="mediaStorageMb" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Media MB/mes" />
              <input required min="0" type="number" name="mediaFiles" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Archivos media/mes" />
              <input required min="0" type="number" name="conversations" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Conversaciones/mes" />
              <input required min="0" type="number" name="calendars" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Calendarios" />
              <input required min="0" type="number" name="appointments" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Citas/mes" />
              <input required min="0" type="number" name="bookingLinks" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Enlaces de reserva" />
              <input required min="0" type="number" name="workflows" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Workflows" />
              <input required min="0" type="number" name="workflowRunsPerMonth" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Runs workflow/mes" />
              <input required min="0" type="number" name="workflowActionsPerMonth" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Acciones workflow/mes" />
              <input required min="0" type="number" name="forms" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Formularios" />
              <input required min="0" type="number" name="formSubmissionsPerMonth" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Submissions/mes" />
              <input required min="0" type="number" name="landingPages" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Landing pages" />
              <input required min="0" type="number" name="funnels" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Funnels" />
              <input required min="0" type="number" name="funnelSteps" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Steps de funnel" />
              <input required min="0" type="number" name="pageViewsPerMonth" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Page views/mes" />
              <input required min="0" type="number" name="modules" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Modulos" />
            </div>
            <p className="text-xs text-slate-500">En limites operativos, 0 significa sin limite configurado.</p>
            <textarea name="description" className="min-h-20 w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Descripcion" />
            <input name="includedModules" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Modulos incluidos separados por coma" defaultValue="core,crm,contacts,conversations,inbox,whatsapp,media,notifications,realtime,calendar,bookings,automations,workflows,forms,surveys,landing_pages,funnels" />
            <input name="features" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Funciones separadas por coma" />
            <select name="status" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm">
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
            <Button className="w-full" type="submit" disabled={Boolean(submitting)}>
              {submitting === 'plan' ? 'Guardando...' : 'Crear plan'}
            </Button>
          </form>
        </Card>
      </div>

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
            <input required name="name" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Nombre de empresa" />
            <input name="taxId" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="RUC / Tax ID" />
            <input name="industry" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Industria" />
            <select name="status" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm">
              <option value="active">Activa</option>
              <option value="trial">Prueba</option>
              <option value="suspended">Suspendida</option>
            </select>
            <Button className="w-full" type="submit" disabled={Boolean(submitting)}>
              <Plus className="h-4 w-4" />
              {submitting === 'company' ? 'Creando...' : 'Crear empresa'}
            </Button>
          </form>
        </Card>

        <Card id="admins">
          <CardHeader title="Crear administrador" description="Solo para una empresa propia sin admin activo." />
          <form className="space-y-4 p-5" onSubmit={handleCreateAdmin}>
            <select required name="companyId" defaultValue="" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm">
              <option value="" disabled>Selecciona una empresa</option>
              {companiesWithoutAdmin.map((company) => (
                <option key={company._id} value={company._id}>{company.name}</option>
              ))}
            </select>
            <input required name="name" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Nombre del administrador" />
            <input required type="email" name="email" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Email" />
            <input required minLength="8" type="password" name="password" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Password (minimo 8 caracteres)" />
            <Button className="w-full" type="submit" disabled={Boolean(submitting) || !companiesWithoutAdmin.length}>
              <Plus className="h-4 w-4" />
              {submitting === 'admin' ? 'Creando...' : 'Crear admin'}
            </Button>
          </form>
        </Card>

        <Card id="suscripciones">
          <CardHeader title="Crear suscripcion" description="No permite otra activa o trial para la misma empresa." />
          <form className="space-y-4 p-5" onSubmit={handleCreateSubscription}>
            <select required name="companyId" defaultValue="" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm">
              <option value="" disabled>Selecciona una empresa</option>
              {companiesWithoutSubscription.map((company) => (
                <option key={company._id} value={company._id}>{company.name}</option>
              ))}
            </select>
            <select required name="planId" defaultValue="" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm">
              <option value="" disabled>Selecciona un plan</option>
              {plans.filter((plan) => plan.status === 'active').map((plan) => (
                <option key={plan._id} value={plan._id}>{plan.name} - {formatPrice(plan.price)}</option>
              ))}
            </select>
            <select name="status" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm">
              <option value="active">Activa</option>
              <option value="trial">Prueba</option>
            </select>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs font-semibold text-slate-500">Inicio</span>
                <input type="datetime-local" name="startsAt" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-slate-500">Fin opcional</span>
                <input type="datetime-local" name="endsAt" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
            </div>
            <Button className="w-full" type="submit" disabled={Boolean(submitting) || !companiesWithoutSubscription.length || !plans.length}>
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
                      {formatPrice(platformSubscription.platformPlanId?.price)} / {platformSubscription.platformPlanId?.billingCycle}
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
                    <p className="mt-2 text-slate-500">{formatPrice(invoice.total)}</p>
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
                    <p className="mt-2 text-slate-500">{formatPrice(payment.amount)}</p>
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
