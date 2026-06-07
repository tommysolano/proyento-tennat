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
  updatePlatformInvoice,
  updatePlatformPlan,
  updatePlatformSubscription
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const inputClass = 'w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm';
const PLATFORM_MODULES = ['core', 'crm', 'contacts', 'calendar', 'bookings', 'automations', 'workflows', 'billing', 'reporting'];

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
            workflowActionsPerMonth: Number(data.get('workflowActionsPerMonth'))
          },
          includedModules: PLATFORM_MODULES,
          status: 'active'
        }),
      `Plan "${name}" creado.`
    );
    if (created) form.reset();
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
    const created = await mutate(
      'subscription-create',
      () =>
        createPlatformSubscription({
          distributorId: data.get('distributorId'),
          platformPlanId: data.get('platformPlanId'),
          status: data.get('status'),
          startsAt: data.get('startsAt') || new Date().toISOString(),
          trialEndsAt: data.get('trialEndsAt') || null,
          currentPeriodEnd: data.get('currentPeriodEnd') || null,
          paymentProvider: 'manual'
        }),
      'Suscripcion de plataforma creada.'
    );
    if (created) form.reset();
  }

  async function handleSubscriptionStatus(subscription) {
    const status = subscription.status === 'suspended' ? 'active' : 'suspended';
    await mutate(
      `subscription-status-${subscription._id}`,
      () => updatePlatformSubscription(subscription._id, { status }),
      `Suscripcion ${status}.`
    );
  }

  async function handleCreateInvoice(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await mutate(
      'invoice-create',
      () =>
        createPlatformInvoice({
          distributorId: data.get('distributorId'),
          subscriptionId: data.get('subscriptionId') || null,
          currency: data.get('currency'),
          tax: Number(data.get('tax') || 0),
          dueDate: data.get('dueDate'),
          status: 'open',
          lineItems: [
            {
              description: data.get('description'),
              quantity: 1,
              unitPrice: Number(data.get('amount'))
            }
          ]
        }),
      'Factura manual creada.'
    );
    if (created) form.reset();
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
          status: 'succeeded'
        }),
      'Pago manual registrado.'
    );
    if (created) form.reset();
  }

  async function handleMarkInvoicePaid(invoice) {
    await mutate(
      `invoice-paid-${invoice._id}`,
      () => updatePlatformInvoice(invoice._id, { status: 'paid' }),
      `Factura ${invoice.number} marcada como pagada.`
    );
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
        <Card className="p-8 text-center text-sm text-slate-500">Cargando plataforma...</Card>
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
              <input required name="name" className={inputClass} placeholder="Nombre comercial" />
              <input required name="slug" className={inputClass} placeholder="slug-unico" />
              <input required name="ownerName" className={inputClass} placeholder="Nombre del owner" />
              <input required type="email" name="email" className={inputClass} placeholder="Email comercial" />
              <input name="phone" className={inputClass} placeholder="Telefono" />
              <input name="region" className={inputClass} placeholder="Region" defaultValue="LatAm" />
              <input required type="email" name="userEmail" className={inputClass} placeholder="Email de acceso" />
              <input required minLength="8" type="password" name="password" className={inputClass} placeholder="Password demo/dev" />
              <select name="status" className={inputClass}>
                <option value="trial">Trial</option>
                <option value="active">Activo</option>
              </select>
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
              <input required name="name" className={inputClass} placeholder="Nombre" />
              <input required name="code" className={inputClass} placeholder="codigo-unico" />
              <textarea name="description" className={inputClass} placeholder="Descripcion" />
              <div className="grid grid-cols-2 gap-3">
                <input required min="0" step="0.01" type="number" name="price" className={inputClass} placeholder="Precio" />
                <input name="currency" className={inputClass} defaultValue="USD" />
              </div>
              <select name="billingCycle" className={inputClass}>
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input required min="0" type="number" name="companies" className={inputClass} placeholder="Empresas" />
                <input required min="0" type="number" name="users" className={inputClass} placeholder="Usuarios" />
                <input required min="0" type="number" name="contacts" className={inputClass} placeholder="Contactos" />
                <input required min="0" type="number" name="modules" className={inputClass} placeholder="Modulos" />
                <input required min="0" type="number" name="storageMb" className={inputClass} placeholder="Storage MB" />
                <input required min="0" type="number" name="messages" className={inputClass} placeholder="Mensajes" />
                <input required min="0" type="number" name="whatsappMessages" className={inputClass} placeholder="Mensajes WhatsApp" />
                <input required min="0" type="number" name="mediaStorageMb" className={inputClass} placeholder="Media MB" />
                <input required min="0" type="number" name="mediaFiles" className={inputClass} placeholder="Archivos media" />
                <input required min="0" type="number" name="conversations" className={inputClass} placeholder="Conversaciones" />
                <input required min="0" type="number" name="calendars" className={inputClass} placeholder="Calendarios" />
                <input required min="0" type="number" name="appointments" className={inputClass} placeholder="Citas/mes" />
                <input required min="0" type="number" name="bookingLinks" className={inputClass} placeholder="Enlaces de reserva" />
                <input required min="0" type="number" name="workflows" className={inputClass} placeholder="Workflows" />
                <input required min="0" type="number" name="workflowRunsPerMonth" className={inputClass} placeholder="Runs workflow/mes" />
                <input required min="0" type="number" name="workflowActionsPerMonth" className={inputClass} placeholder="Acciones workflow/mes" />
              </div>
              <Button className="w-full" type="submit" disabled={Boolean(busy)}>Crear plan</Button>
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
                      {row.status === 'suspended' ? 'Reactivar' : 'Suspender'}
                    </Button>
                  )
                }
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Asignar plan" description="Solo una suscripcion vigente por distribuidor." />
            <form className="space-y-3 p-5" onSubmit={handleCreateSubscription}>
              <select required name="distributorId" defaultValue="" className={inputClass}>
                <option value="" disabled>Selecciona distribuidor</option>
                {distributors.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
              <select required name="platformPlanId" defaultValue="" className={inputClass}>
                <option value="" disabled>Selecciona plan</option>
                {plans.filter((item) => item.status === 'active').map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
              <select name="status" className={inputClass}>
                <option value="trial">Trial</option>
                <option value="active">Activa</option>
              </select>
              <label className="block text-xs font-semibold text-slate-500">Inicio<input type="datetime-local" name="startsAt" className={`${inputClass} mt-1`} /></label>
              <label className="block text-xs font-semibold text-slate-500">Fin de trial<input type="datetime-local" name="trialEndsAt" className={`${inputClass} mt-1`} /></label>
              <label className="block text-xs font-semibold text-slate-500">Fin del periodo<input type="datetime-local" name="currentPeriodEnd" className={`${inputClass} mt-1`} /></label>
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
                  dueLabel: dateLabel(invoice.dueDate)
                }))}
                emptyText="No hay facturas"
                columns={[
                  { key: 'number', header: 'Numero' },
                  { key: 'distributorLabel', header: 'Distribuidor' },
                  { key: 'totalLabel', header: 'Total' },
                  { key: 'dueLabel', header: 'Vence' },
                  { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
                  {
                    key: 'actions',
                    header: 'Accion',
                    render: (row) => row.status !== 'paid' ? (
                      <Button className="px-3" variant="secondary" onClick={() => handleMarkInvoicePaid(row)}>Marcar pagada</Button>
                    ) : '-'
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
                <select required name="distributorId" defaultValue="" className={inputClass}>
                  <option value="" disabled>Distribuidor</option>
                  {distributors.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                </select>
                <select name="subscriptionId" defaultValue="" className={inputClass}>
                  <option value="">Sin suscripcion</option>
                  {subscriptions.map((item) => <option key={item._id} value={item._id}>{item.distributorId?.name} - {item.platformPlanId?.name}</option>)}
                </select>
                <input required name="description" className={inputClass} placeholder="Concepto" />
                <input required min="0" step="0.01" type="number" name="amount" className={inputClass} placeholder="Monto" />
                <input min="0" step="0.01" type="number" name="tax" className={inputClass} placeholder="Impuesto" defaultValue="0" />
                <input name="currency" className={inputClass} defaultValue="USD" />
                <input required type="date" name="dueDate" className={inputClass} />
                <Button type="submit" disabled={Boolean(busy)}>Crear factura</Button>
              </form>
            </Card>
            <Card>
              <CardHeader title="Registrar pago manual" description="Marca la factura pagada al cubrir su total." />
              <form className="grid gap-3 p-5 md:grid-cols-2" onSubmit={handleCreatePayment}>
                <select required name="invoiceId" defaultValue="" className={inputClass}>
                  <option value="" disabled>Factura pendiente</option>
                  {invoices.filter((item) => !['paid', 'void'].includes(item.status)).map((item) => <option key={item._id} value={item._id}>{item.number} - {money(item.total, item.currency)}</option>)}
                </select>
                <input required min="0.01" step="0.01" type="number" name="amount" className={inputClass} placeholder="Monto" />
                <input name="currency" className={inputClass} defaultValue="USD" />
                <select name="method" className={inputClass}>
                  <option value="transfer">Transferencia</option>
                  <option value="cash">Efectivo</option>
                  <option value="manual">Manual</option>
                </select>
                <Button className="md:col-span-2" type="submit" disabled={Boolean(busy)}>Registrar pago</Button>
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
              <select
                required
                name="scopeType"
                className={inputClass}
                value={moduleScopeType}
                onChange={(event) => setModuleScopeType(event.target.value)}
              >
                <option value="distributor">Distribuidor</option>
                <option value="platform_plan">Plan plataforma</option>
              </select>
              <select required name="scopeId" defaultValue="" className={inputClass}>
                <option value="" disabled>Selecciona scope</option>
                {moduleScopeType === 'distributor'
                  ? distributors.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)
                  : plans.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
              <select required name="moduleKey" defaultValue="" className={inputClass}>
                <option value="" disabled>Selecciona modulo</option>
                {modules.registry.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
              </select>
              <select name="enabled" className={inputClass}>
                <option value="true">Activado</option>
                <option value="false">Desactivado</option>
              </select>
              <Button className="w-full" type="submit" disabled={Boolean(busy)}>Guardar entitlement</Button>
            </form>
            <div className="border-t border-slate-100 p-5 text-sm text-slate-500">
              {modules.entitlements.length
                ? `${modules.entitlements.length} overrides configurados.`
                : 'No hay overrides; se usa el plan o enabledByDefault.'}
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
