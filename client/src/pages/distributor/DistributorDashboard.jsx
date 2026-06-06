import { Building2, CreditCard, LogIn, Plus, TrendingUp, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createCompany,
  createPlan,
  createSubscription,
  createUser,
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

const cycleLabels = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  yearly: 'Anual'
};

function idOf(value) {
  return typeof value === 'object' && value ? value._id : value;
}

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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [companyData, planData, userData, subscriptionData] = await Promise.all([
        getCompanies(),
        getPlans(),
        getUsers(),
        getSubscriptions()
      ]);
      setCompanies(companyData);
      setPlans(planData);
      setUsers(userData);
      setSubscriptions(subscriptionData);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
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
        limitsLabel: formatLimits(plan.limits)
      })),
    [plans]
  );

  const visibleCompanies = useMemo(
    () =>
      companies.map((company) => {
        const companyId = company._id;
        const subscription = subscriptions.find(
          (item) => idOf(item.companyId) === companyId
        );
        const admin =
          (typeof company.adminId === 'object' && company.adminId) ||
          users.find(
            (user) => user.role === 'ADMIN' && idOf(user.companyId) === companyId
          );

        return {
          ...company,
          id: companyId,
          adminEmail: admin?.email || '',
          planName:
            (typeof subscription?.planId === 'object' && subscription.planId?.name) ||
            plans.find((plan) => plan._id === idOf(subscription?.planId))?.name ||
            'Sin plan',
          usersCount: users.filter((user) => idOf(user.companyId) === companyId).length,
          subscriptionStatus: subscription?.status || 'Sin suscripcion'
        };
      }),
    [companies, plans, subscriptions, users]
  );

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleCreatePlan(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSubmitting('plan');
    setNotice('');
    setError('');

    try {
      const plan = await createPlan({
        name: formData.get('name'),
        price: Number(formData.get('price')),
        billingCycle: formData.get('billingCycle'),
        description: formData.get('description'),
        limits: {
          users: Number(formData.get('users')),
          contacts: Number(formData.get('contacts')),
          channels: Number(formData.get('channels'))
        },
        status: 'active'
      });
      form.reset();
      setNotice(`Plan "${plan.name}" creado correctamente.`);
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting('');
    }
  }

  async function handleCreateTenant(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const planId = formData.get('planId');
    let companyCreated = false;

    setSubmitting('tenant');
    setNotice('');
    setError('');

    try {
      if (!planId) throw new Error('Primero debes crear o seleccionar un plan');

      const company = await createCompany({
        name: formData.get('company'),
        taxId: formData.get('taxId'),
        industry: formData.get('industry'),
        status: 'trial'
      });
      companyCreated = true;

      await createUser({
        name: formData.get('admin'),
        email: formData.get('email'),
        password: formData.get('password'),
        role: 'ADMIN',
        companyId: company._id
      });

      await createSubscription({
        companyId: company._id,
        planId,
        status: 'trial'
      });

      form.reset();
      setNotice(`Empresa "${company.name}", administrador y suscripcion creados correctamente.`);
      await loadDashboard();
    } catch (requestError) {
      const message = companyCreated
        ? `${requestError.message}. La empresa fue creada; revisa el administrador o la suscripcion.`
        : requestError.message;
      await loadDashboard();
      setError(message);
    } finally {
      setSubmitting('');
    }
  }

  async function handleEnterAdmin(company) {
    setError('');

    try {
      const data = await impersonateAdmin(company.adminEmail);
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
        description="Cargando empresas, planes, usuarios y suscripciones..."
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
      description="Gestion real de planes, empresas cliente, suscripciones y administradores."
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

      <div id="estadisticas" className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Empresas activas"
          value={companies.filter((company) => company.status === 'active').length}
          helper={`${companies.length} empresas totales`}
          icon={Building2}
          tone="emerald"
        />
        <MetricCard
          label="Planes activos"
          value={plans.filter((plan) => plan.status === 'active').length}
          helper={`${subscriptions.length} suscripciones`}
          icon={CreditCard}
          tone="cyan"
        />
        <MetricCard
          label="Usuarios creados"
          value={users.length}
          helper={`${users.filter((user) => user.role === 'ADMIN').length} administradores`}
          icon={UsersRound}
          tone="amber"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.75fr]">
        <Card id="planes">
          <CardHeader
            title="Planes de suscripcion"
            description="Planes persistidos para este distribuidor."
            action={
              <Button onClick={() => scrollTo('crear-plan')}>
                <Plus className="h-4 w-4" />
                Nuevo plan
              </Button>
            }
          />
          <Table
            data={visiblePlans}
            emptyText="Todavia no hay planes creados"
            columns={[
              { key: 'name', header: 'Nombre' },
              { key: 'priceLabel', header: 'Precio' },
              { key: 'cycleLabel', header: 'Ciclo' },
              { key: 'limitsLabel', header: 'Limites' },
              {
                key: 'status',
                header: 'Estado',
                render: (row) => <Badge tone={row.status}>{row.status}</Badge>
              }
            ]}
          />
        </Card>

        <Card>
          <CardHeader title="Crear plan" description="El plan se guarda en MongoDB." />
          <form id="crear-plan" className="space-y-4 p-5" onSubmit={handleCreatePlan}>
            <input
              required
              name="name"
              className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm"
              placeholder="Nombre del plan"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                required
                min="0"
                step="0.01"
                type="number"
                name="price"
                className="rounded-md border border-slate-200 px-3 py-2.5 text-sm"
                placeholder="Precio USD"
              />
              <select
                name="billingCycle"
                className="rounded-md border border-slate-200 px-3 py-2.5 text-sm"
              >
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
            <textarea
              name="description"
              className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm"
              placeholder="Descripcion"
            />
            <Button className="w-full" variant="secondary" type="submit" disabled={Boolean(submitting)}>
              {submitting === 'plan' ? 'Guardando...' : 'Crear plan'}
            </Button>
          </form>
        </Card>
      </div>

      <Card id="empresas">
        <CardHeader
          title="Empresas / clientes"
          description="Empresas, administradores y suscripciones obtenidos desde la API."
        />
        <Table
          data={visibleCompanies}
          emptyText="Todavia no hay empresas creadas"
          columns={[
            { key: 'name', header: 'Empresa' },
            { key: 'industry', header: 'Industria' },
            { key: 'planName', header: 'Plan contratado' },
            { key: 'usersCount', header: 'Usuarios' },
            {
              key: 'status',
              header: 'Estado',
              render: (row) => <Badge tone={row.status}>{row.status}</Badge>
            },
            {
              key: 'access',
              header: 'Cuenta admin',
              render: (row) => (
                <Button
                  className="min-h-9 px-3"
                  variant="secondary"
                  disabled={!row.adminEmail || Boolean(submitting)}
                  onClick={() => handleEnterAdmin(row)}
                >
                  <LogIn className="h-4 w-4" />
                  Entrar
                </Button>
              )
            }
          ]}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[0.85fr_1fr]">
        <Card id="admins">
          <CardHeader
            title="Crear empresa y administrador"
            description="Alta persistente del tenant y su suscripcion inicial."
          />
          <form className="space-y-4 p-5" onSubmit={handleCreateTenant}>
            <input required name="company" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Nombre de empresa" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="taxId" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="RUC / Tax ID" />
              <input name="industry" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Industria" />
            </div>
            <input required name="admin" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Nombre del administrador" />
            <input required type="email" name="email" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Email del administrador" />
            <input required minLength="8" type="password" name="password" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Password (minimo 8 caracteres)" />
            <select required name="planId" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" defaultValue="">
              <option value="" disabled>Selecciona un plan</option>
              {plans
                .filter((plan) => plan.status === 'active')
                .map((plan) => (
                  <option key={plan._id} value={plan._id}>
                    {plan.name} - {formatPrice(plan.price)}
                  </option>
                ))}
            </select>
            <Button className="w-full" type="submit" disabled={Boolean(submitting) || !plans.length}>
              <Plus className="h-4 w-4" />
              {submitting === 'tenant' ? 'Creando...' : 'Crear empresa, admin y suscripcion'}
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Pulso del negocio" description="Resumen calculado con datos reales." />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            {[
              ['Suscripciones activas', subscriptions.filter((item) => item.status === 'active').length, 'Planes en operacion'],
              ['Empresas en trial', companies.filter((item) => item.status === 'trial').length, 'Pendientes de activacion'],
              ['Administradores', users.filter((item) => item.role === 'ADMIN').length, 'Cuentas de empresa']
            ].map(([label, value, helper]) => (
              <div key={label} className="rounded-lg border border-slate-200 p-4">
                <TrendingUp className="mb-3 h-5 w-5 text-cyan-700" />
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{helper}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
