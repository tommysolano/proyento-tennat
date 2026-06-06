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
  getPlans,
  getSubscriptions,
  getUsers
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
  quarterly: 'Trimestral',
  yearly: 'Anual'
};

function formatLimits(limits = {}) {
  return `${limits.users ?? 0} usuarios / ${limits.contacts ?? 0} contactos / ${limits.channels ?? 0} canales`;
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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const [companyData, planData, userData, subscriptionData, activityData] =
        await Promise.all([
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
            ['active', 'trial'].includes(item.status)
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
      .filter((subscription) => ['active', 'trial'].includes(subscription.status))
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
            channels: Number(data.get('channels'))
          },
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
              { key: 'priceLabel', header: 'Precio' },
              { key: 'cycleLabel', header: 'Ciclo' },
              { key: 'limitsLabel', header: 'Limites' },
              { key: 'featuresLabel', header: 'Funciones' },
              {
                key: 'status',
                header: 'Estado',
                render: (row) => <Badge tone={row.status}>{row.status}</Badge>
              }
            ]}
          />
        </Card>

        <Card>
          <CardHeader title="Crear plan" description="Precio, ciclo, limites y funciones validados." />
          <form className="space-y-4 p-5" onSubmit={handleCreatePlan}>
            <input required name="name" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Nombre del plan" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input required min="0" step="0.01" type="number" name="price" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Precio USD" />
              <select name="billingCycle" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm">
                <option value="monthly">Mensual</option>
                <option value="quarterly">Trimestral</option>
                <option value="yearly">Anual</option>
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <input required min="0" type="number" name="users" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Usuarios" />
              <input required min="0" type="number" name="contacts" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Contactos" />
              <input required min="0" type="number" name="channels" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Canales" />
            </div>
            <textarea name="description" className="min-h-20 w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Descripcion" />
            <input name="features" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Funciones separadas por coma" />
            <select name="status" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm">
              <option value="active">Activo</option>
              <option value="draft">Borrador</option>
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
              <option value="inactive">Inactiva</option>
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
    </PageShell>
  );
}
