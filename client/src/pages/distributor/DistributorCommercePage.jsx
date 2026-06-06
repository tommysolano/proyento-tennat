import {
  Building2,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileText,
  Plus,
  RefreshCcw,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createDistributorInvoice,
  createDistributorPayment,
  getDistributorBillingOverview,
  getDistributorCompanies,
  getDistributorInvoices,
  getDistributorOnboarding,
  getDistributorPayments,
  getDistributorSettings,
  getPlans,
  reactivateCompany,
  setCompanySubscription,
  suspendCompany,
  updateDistributorBranding,
  updateDistributorInvoice,
  updateDistributorSettings
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const inputClass = 'w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm';

function money(value, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function dateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(new Date(value));
}

const onboardingLabels = {
  profile: 'Completar perfil comercial',
  branding: 'Configurar marca',
  firstPlan: 'Crear primer plan',
  firstCompany: 'Crear primera empresa',
  firstAdmin: 'Crear primer admin',
  firstSubscription: 'Crear primera suscripcion'
};

export function DistributorCommercePage({ section = 'finance' }) {
  const { refreshSession } = useAuth();
  const [overview, setOverview] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [plans, setPlans] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [settings, setSettings] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [lineItems, setLineItems] = useState([
    { description: '', quantity: 1, unitPrice: 0, moduleKey: '' }
  ]);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('');
  const [invoiceCompanyFilter, setInvoiceCompanyFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [paymentCompanyFilter, setPaymentCompanyFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadPage = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const [companyData, planData, settingsData, onboardingData] = await Promise.all([
        getDistributorCompanies(),
        getPlans(),
        getDistributorSettings(),
        getDistributorOnboarding()
      ]);
      setCompanies(companyData);
      setPlans(planData);
      setSettings(settingsData);
      setOnboarding(onboardingData);

      const billingData = await Promise.all([
        getDistributorBillingOverview(),
        getDistributorInvoices(),
        getDistributorPayments()
      ]).catch((billingError) => {
        if (['finance', 'invoices', 'payments'].includes(section)) {
          setError(billingError.message);
        }
        return null;
      });
      if (billingData) {
        setOverview(billingData[0]);
        setInvoices(billingData[1]);
        setPayments(billingData[2]);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const companyNames = useMemo(
    () => new Map(companies.map((company) => [company._id, company.name])),
    [companies]
  );
  const visibleInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          (!invoiceStatusFilter || invoice.status === invoiceStatusFilter) &&
          (!invoiceCompanyFilter || String(invoice.customerId) === invoiceCompanyFilter)
      ),
    [invoices, invoiceStatusFilter, invoiceCompanyFilter]
  );
  const visiblePayments = useMemo(
    () =>
      payments.filter(
        (payment) =>
          (!paymentStatusFilter || payment.status === paymentStatusFilter) &&
          (!paymentCompanyFilter || String(payment.payerId) === paymentCompanyFilter)
      ),
    [payments, paymentStatusFilter, paymentCompanyFilter]
  );

  async function mutate(key, action, successMessage, refreshBranding = false) {
    setBusy(key);
    setNotice('');
    setError('');
    try {
      await action();
      await loadPage(false);
      if (refreshBranding) await refreshSession();
      setNotice(successMessage);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setBusy('');
    }
  }

  async function handleCompanyStatus(company) {
    const reactivating = company.status === 'suspended';
    await mutate(
      `company-${company._id}`,
      () => (reactivating ? reactivateCompany(company._id) : suspendCompany(company._id)),
      `Empresa ${reactivating ? 'reactivada' : 'suspendida'}.`
    );
  }

  async function handleSubscription(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await mutate(
      'subscription',
      () =>
        setCompanySubscription(data.get('companyId'), {
          planId: data.get('planId'),
          status: data.get('status'),
          currentPeriodEnd: data.get('currentPeriodEnd') || null
        }),
      'Plan asignado a la empresa.'
    );
    if (ok) form.reset();
  }

  function updateLineItem(index, field, value) {
    setLineItems((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: ['quantity', 'unitPrice'].includes(field) ? Number(value) : value
            }
          : item
      )
    );
  }

  async function handleInvoice(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await mutate(
      'invoice',
      () =>
        createDistributorInvoice({
          companyId: data.get('companyId'),
          subscriptionId: data.get('subscriptionId') || null,
          currency: data.get('currency'),
          taxRate: Number(data.get('taxRate') || 0),
          dueDate: data.get('dueDate'),
          status: data.get('status'),
          lineItems
        }),
      'Factura creada y numerada por el servidor.'
    );
    if (ok) {
      form.reset();
      setLineItems([{ description: '', quantity: 1, unitPrice: 0, moduleKey: '' }]);
    }
  }

  async function handleVoidInvoice(invoice) {
    await mutate(
      `void-${invoice._id}`,
      () => updateDistributorInvoice(invoice._id, { status: 'void' }),
      `Factura ${invoice.number} anulada.`
    );
  }

  async function handlePayment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await mutate(
      'payment',
      () =>
        createDistributorPayment({
          invoiceId: data.get('invoiceId'),
          amount: Number(data.get('amount')),
          currency: data.get('currency'),
          method: data.get('method'),
          status: 'succeeded'
        }),
      'Pago manual registrado.'
    );
    if (ok) form.reset();
  }

  async function handleSettings(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate(
      'settings',
      () =>
        updateDistributorSettings({
          name: data.get('name'),
          phone: data.get('phone'),
          settings: {
            defaultCurrency: data.get('defaultCurrency'),
            defaultLocale: data.get('defaultLocale'),
            defaultTimezone: data.get('defaultTimezone'),
            termsUrl: data.get('termsUrl'),
            privacyUrl: data.get('privacyUrl')
          },
          billingSettings: {
            currency: data.get('currency'),
            taxRate: Number(data.get('taxRate')),
            invoicePrefix: data.get('invoicePrefix'),
            paymentInstructions: data.get('paymentInstructions'),
            termsAndConditions: data.get('termsAndConditions'),
            gracePeriodDays: Number(data.get('gracePeriodDays'))
          }
        }),
      'Configuracion comercial guardada.',
      true
    );
  }

  async function handleBranding(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate(
      'branding',
      () =>
        updateDistributorBranding({
          branding: {
            companyName: data.get('companyName'),
            logoUrl: data.get('logoUrl'),
            faviconUrl: data.get('faviconUrl'),
            loginBackgroundUrl: data.get('loginBackgroundUrl'),
            primaryColor: data.get('primaryColor'),
            secondaryColor: data.get('secondaryColor'),
            accentColor: data.get('accentColor'),
            supportEmail: data.get('supportEmail'),
            supportPhone: data.get('supportPhone')
          },
          customDomain: { domain: data.get('domain') }
        }),
      'Branding actualizado.',
      true
    );
  }

  if (loading) {
    return (
      <PageShell eyebrow="Capa comercial" title="Operacion del distribuidor">
        <Card className="p-8 text-center text-sm text-slate-500">
          Cargando datos comerciales...
        </Card>
      </PageShell>
    );
  }

  const pendingInvoices = invoices.filter((invoice) =>
    ['open', 'overdue'].includes(invoice.status)
  );
  const branding = settings?.branding || {};
  const billingSettings = settings?.billingSettings || {};
  const generalSettings = settings?.settings || {};

  return (
    <PageShell
      eyebrow="Capa comercial"
      title={
        section === 'settings'
          ? 'Configuracion comercial'
          : section === 'branding'
            ? 'White label'
            : section === 'onboarding'
              ? 'Onboarding'
              : section === 'companies'
                ? 'Empresas y clientes'
                : 'Finanzas del distribuidor'
      }
      description="Planes, empresas, facturas, pagos y marca controlados por el distribuidor autenticado."
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
        <Button variant="secondary" onClick={() => loadPage()} disabled={Boolean(busy)}>
          <RefreshCcw className="h-4 w-4" />
          Refrescar
        </Button>
      </div>

      {section === 'finance' ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Ingreso mensual esperado" value={money(overview?.expectedMonthlyRevenue, billingSettings.currency)} helper={`${overview?.activeSubscriptions || 0} suscripciones activas`} icon={DollarSign} tone="emerald" />
            <MetricCard label="Empresas activas" value={overview?.activeCompanies || 0} helper={`${overview?.suspendedCompanies || 0} suspendidas`} icon={Building2} tone="cyan" />
            <MetricCard label="Facturas pendientes" value={overview?.pendingInvoices || 0} helper={`${overview?.paidInvoices || 0} pagadas`} icon={FileText} tone="amber" />
            <MetricCard label="Suscripciones vencidas" value={overview?.pastDueSubscriptions || 0} helper="Estado past_due" icon={ShieldAlert} tone="rose" />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Planes mas usados" description="Suscripciones vigentes por plan comercial." />
              <Table
                data={(overview?.popularPlans || []).map((item) => ({ ...item, id: item.planId }))}
                emptyText="No hay suscripciones para calcular popularidad"
                columns={[
                  { key: 'name', header: 'Plan' },
                  { key: 'subscriptions', header: 'Suscripciones' }
                ]}
              />
            </Card>
            <Card>
              <CardHeader title="Pagos recientes" description="Ultimos pagos recibidos de empresas." />
              <Table
                data={(overview?.recentPayments || []).map((payment) => ({
                  ...payment,
                  id: payment._id,
                  companyLabel: companyNames.get(String(payment.payerId)) || '-',
                  amountLabel: money(payment.amount, payment.currency),
                  dateLabel: dateLabel(payment.paidAt || payment.createdAt)
                }))}
                emptyText="No hay pagos recibidos"
                columns={[
                  { key: 'companyLabel', header: 'Empresa' },
                  { key: 'amountLabel', header: 'Monto' },
                  { key: 'method', header: 'Metodo' },
                  { key: 'dateLabel', header: 'Fecha' }
                ]}
              />
            </Card>
          </div>
        </>
      ) : null}

      {section === 'companies' ? (
        <>
          <Card>
            <CardHeader title="Estado comercial de empresas" description="Plan, deuda pendiente y ultimo pago." />
            <Table
              data={companies.map((company) => ({
                ...company,
                id: company._id,
                adminLabel: company.adminId?.email || 'Sin admin',
                planLabel: company.subscription?.planId?.name || 'Sin plan',
                subscriptionLabel: company.subscription?.status || 'sin_suscripcion',
                pendingLabel: `${company.pendingInvoices?.count || 0} / ${money(company.pendingInvoices?.total, billingSettings.currency)}`,
                lastPaymentLabel: company.lastPayment
                  ? `${money(company.lastPayment.amount, company.lastPayment.currency)} - ${dateLabel(company.lastPayment.paidAt)}`
                  : 'Sin pagos',
                createdLabel: dateLabel(company.createdAt)
              }))}
              emptyText="No hay empresas"
              columns={[
                { key: 'name', header: 'Empresa' },
                { key: 'adminLabel', header: 'Admin' },
                { key: 'planLabel', header: 'Plan' },
                { key: 'subscriptionLabel', header: 'Suscripcion', render: (row) => <Badge tone={row.subscriptionLabel}>{row.subscriptionLabel}</Badge> },
                { key: 'pendingLabel', header: 'Pendientes' },
                { key: 'lastPaymentLabel', header: 'Ultimo pago' },
                { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
                {
                  key: 'actions',
                  header: 'Acciones',
                  render: (row) => (
                    <div className="flex gap-2">
                      <Button as={Link} to={`/distributor/companies/${row._id}`} className="px-3" variant="secondary">Detalle</Button>
                      <Button className="px-3" variant={row.status === 'suspended' ? 'primary' : 'danger'} onClick={() => handleCompanyStatus(row)}>
                        {row.status === 'suspended' ? 'Reactivar' : 'Suspender'}
                      </Button>
                    </div>
                  )
                }
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Asignar o cambiar plan" description="Actualiza la suscripcion vigente de una empresa propia." />
            <form className="grid gap-3 p-5 md:grid-cols-4" onSubmit={handleSubscription}>
              <select required name="companyId" defaultValue="" className={inputClass}>
                <option value="" disabled>Empresa</option>
                {companies.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}
              </select>
              <select required name="planId" defaultValue="" className={inputClass}>
                <option value="" disabled>Plan</option>
                {plans.filter((plan) => plan.status === 'active').map((plan) => <option key={plan._id} value={plan._id}>{plan.name}</option>)}
              </select>
              <select name="status" className={inputClass}>
                <option value="active">Activa</option>
                <option value="trial">Trial</option>
                <option value="past_due">Past due</option>
                <option value="suspended">Suspendida</option>
              </select>
              <input type="date" name="currentPeriodEnd" className={inputClass} />
              <Button className="md:col-span-4" type="submit" disabled={Boolean(busy)}>Guardar suscripcion</Button>
            </form>
          </Card>
        </>
      ) : null}

      {section === 'invoices' ? (
        <>
          <Card>
            <CardHeader title="Facturas emitidas" description="Filtrado local sobre datos tenant-safe de la API." />
            <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2">
              <select value={invoiceCompanyFilter} onChange={(event) => setInvoiceCompanyFilter(event.target.value)} className={inputClass}>
                <option value="">Todas las empresas</option>
                {companies.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}
              </select>
              <select value={invoiceStatusFilter} onChange={(event) => setInvoiceStatusFilter(event.target.value)} className={inputClass}>
                <option value="">Todos los estados</option>
                {['draft', 'open', 'paid', 'overdue', 'void', 'uncollectible'].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <Table
              data={visibleInvoices.map((invoice) => ({
                ...invoice,
                id: invoice._id,
                companyLabel: companyNames.get(String(invoice.customerId)) || '-',
                totalLabel: money(invoice.total, invoice.currency),
                dueLabel: dateLabel(invoice.dueDate)
              }))}
              emptyText="No hay facturas para este filtro"
              columns={[
                { key: 'number', header: 'Numero' },
                { key: 'companyLabel', header: 'Empresa' },
                { key: 'totalLabel', header: 'Total' },
                { key: 'dueLabel', header: 'Vence' },
                { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
                {
                  key: 'actions',
                  header: 'Accion',
                  render: (row) => !['paid', 'void'].includes(row.status) ? (
                    <Button variant="secondary" className="px-3" onClick={() => handleVoidInvoice(row)}>Anular</Button>
                  ) : '-'
                }
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Crear factura manual" description="Subtotal, impuesto, total y numero se calculan en backend." />
            <form className="space-y-4 p-5" onSubmit={handleInvoice}>
              <div className="grid gap-3 md:grid-cols-4">
                <select required name="companyId" defaultValue="" className={inputClass}>
                  <option value="" disabled>Empresa</option>
                  {companies.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}
                </select>
                <select name="subscriptionId" defaultValue="" className={inputClass}>
                  <option value="">Sin suscripcion</option>
                  {companies.filter((company) => company.subscription).map((company) => <option key={company.subscription._id} value={company.subscription._id}>{company.name} - {company.subscription.planId?.name}</option>)}
                </select>
                <input required type="date" name="dueDate" className={inputClass} />
                <select name="status" className={inputClass}><option value="open">Open</option><option value="draft">Draft</option></select>
                <input name="currency" className={inputClass} defaultValue={billingSettings.currency || 'USD'} />
                <input min="0" step="0.01" type="number" name="taxRate" className={inputClass} defaultValue={billingSettings.taxRate || 0} placeholder="Impuesto %" />
              </div>
              <div className="space-y-3">
                {lineItems.map((item, index) => (
                  <div key={index} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[2fr_0.6fr_0.8fr_1fr_auto]">
                    <input required value={item.description} onChange={(event) => updateLineItem(index, 'description', event.target.value)} className={inputClass} placeholder="Descripcion" />
                    <input required min="0" step="0.01" type="number" value={item.quantity} onChange={(event) => updateLineItem(index, 'quantity', event.target.value)} className={inputClass} placeholder="Cantidad" />
                    <input required min="0" step="0.01" type="number" value={item.unitPrice} onChange={(event) => updateLineItem(index, 'unitPrice', event.target.value)} className={inputClass} placeholder="Precio" />
                    <input value={item.moduleKey} onChange={(event) => updateLineItem(index, 'moduleKey', event.target.value)} className={inputClass} placeholder="Modulo opcional" />
                    <Button variant="danger" className="px-3" disabled={lineItems.length === 1} onClick={() => setLineItems((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Quitar</Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => setLineItems((items) => [...items, { description: '', quantity: 1, unitPrice: 0, moduleKey: '' }])}>
                  <Plus className="h-4 w-4" /> Agregar item
                </Button>
                <Button type="submit" disabled={Boolean(busy)}>Crear factura</Button>
              </div>
            </form>
          </Card>
        </>
      ) : null}

      {section === 'payments' ? (
        <>
          <Card>
            <CardHeader title="Pagos recibidos" description="Pagos manuales de empresas al distribuidor." />
            <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2">
              <select value={paymentCompanyFilter} onChange={(event) => setPaymentCompanyFilter(event.target.value)} className={inputClass}>
                <option value="">Todas las empresas</option>
                {companies.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}
              </select>
              <select value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value)} className={inputClass}>
                <option value="">Todos los estados</option>
                {['pending', 'succeeded', 'failed', 'refunded'].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <Table
              data={visiblePayments.map((payment) => ({
                ...payment,
                id: payment._id,
                invoiceLabel: payment.invoiceId?.number || '-',
                companyLabel: companyNames.get(String(payment.payerId)) || '-',
                amountLabel: money(payment.amount, payment.currency),
                paidLabel: dateLabel(payment.paidAt || payment.createdAt)
              }))}
              emptyText="No hay pagos para este filtro"
              columns={[
                { key: 'invoiceLabel', header: 'Factura' },
                { key: 'companyLabel', header: 'Empresa' },
                { key: 'amountLabel', header: 'Monto' },
                { key: 'method', header: 'Metodo' },
                { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
                { key: 'paidLabel', header: 'Fecha' }
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Registrar pago" description="La factura cambia a paid cuando la suma cubre el total." />
            <form className="grid gap-3 p-5 md:grid-cols-4" onSubmit={handlePayment}>
              <select required name="invoiceId" defaultValue="" className={inputClass}>
                <option value="" disabled>Factura pendiente</option>
                {pendingInvoices.map((invoice) => <option key={invoice._id} value={invoice._id}>{invoice.number} - {companyNames.get(String(invoice.customerId))} - {money(invoice.total, invoice.currency)}</option>)}
              </select>
              <input required min="0.01" step="0.01" type="number" name="amount" className={inputClass} placeholder="Monto" />
              <input name="currency" className={inputClass} defaultValue={billingSettings.currency || 'USD'} />
              <select name="method" className={inputClass}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="manual">Manual</option></select>
              <Button className="md:col-span-4" type="submit" disabled={Boolean(busy)}>Registrar pago</Button>
            </form>
          </Card>
        </>
      ) : null}

      {section === 'settings' ? (
        <Card>
          <CardHeader title="Configuracion comercial y billing" description="Valores usados al emitir facturas a empresas." />
          <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={handleSettings}>
            <input required name="name" className={inputClass} defaultValue={settings?.name} placeholder="Nombre comercial" />
            <input name="phone" className={inputClass} defaultValue={settings?.phone} placeholder="Telefono" />
            <input name="defaultCurrency" className={inputClass} defaultValue={generalSettings.defaultCurrency || 'USD'} placeholder="Moneda por defecto" />
            <input name="defaultLocale" className={inputClass} defaultValue={generalSettings.defaultLocale || 'es-EC'} placeholder="Idioma / locale" />
            <input name="defaultTimezone" className={inputClass} defaultValue={generalSettings.defaultTimezone || 'America/Guayaquil'} placeholder="Zona horaria" />
            <input name="currency" className={inputClass} defaultValue={billingSettings.currency || 'USD'} placeholder="Moneda de facturacion" />
            <input required name="invoicePrefix" className={inputClass} defaultValue={billingSettings.invoicePrefix || 'FAC'} placeholder="Prefijo de facturas" />
            <input min="0" step="0.01" type="number" name="taxRate" className={inputClass} defaultValue={billingSettings.taxRate || 0} placeholder="Impuesto %" />
            <input min="0" type="number" name="gracePeriodDays" className={inputClass} defaultValue={billingSettings.gracePeriodDays || 0} placeholder="Dias de gracia" />
            <input name="termsUrl" className={inputClass} defaultValue={generalSettings.termsUrl} placeholder="URL de terminos" />
            <input name="privacyUrl" className={inputClass} defaultValue={generalSettings.privacyUrl} placeholder="URL de privacidad" />
            <textarea name="paymentInstructions" className={inputClass} defaultValue={billingSettings.paymentInstructions} placeholder="Instrucciones de pago" />
            <textarea name="termsAndConditions" className={`${inputClass} md:col-span-2`} defaultValue={billingSettings.termsAndConditions} placeholder="Terminos y condiciones de facturacion" />
            <Button className="md:col-span-2" type="submit" disabled={Boolean(busy)}>
              <Settings className="h-4 w-4" /> Guardar configuracion
            </Button>
          </form>
        </Card>
      ) : null}

      {section === 'branding' ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.65fr]">
          <Card>
            <CardHeader title="White label" description="Marca, soporte y dominio preparado sin validacion DNS real." />
            <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={handleBranding}>
              <input name="companyName" className={inputClass} defaultValue={branding.companyName} placeholder="Nombre de marca" />
              <input name="logoUrl" className={inputClass} defaultValue={branding.logoUrl} placeholder="Logo URL" />
              <input name="faviconUrl" className={inputClass} defaultValue={branding.faviconUrl} placeholder="Favicon URL" />
              <input name="loginBackgroundUrl" className={inputClass} defaultValue={branding.loginBackgroundUrl} placeholder="Fondo de login URL" />
              <label className="text-xs font-semibold text-slate-500">Color principal<input type="color" name="primaryColor" className={`${inputClass} mt-1 h-12`} defaultValue={branding.primaryColor || '#0e7490'} /></label>
              <label className="text-xs font-semibold text-slate-500">Color secundario<input type="color" name="secondaryColor" className={`${inputClass} mt-1 h-12`} defaultValue={branding.secondaryColor || '#0f172a'} /></label>
              <label className="text-xs font-semibold text-slate-500">Color de acento<input type="color" name="accentColor" className={`${inputClass} mt-1 h-12`} defaultValue={branding.accentColor || '#06b6d4'} /></label>
              <input type="email" name="supportEmail" className={inputClass} defaultValue={branding.supportEmail} placeholder="Email de soporte" />
              <input name="supportPhone" className={inputClass} defaultValue={branding.supportPhone} placeholder="Telefono de soporte" />
              <input name="domain" className={inputClass} defaultValue={settings?.customDomain?.domain} placeholder="crm.midominio.com" />
              <Button className="md:col-span-2" type="submit" disabled={Boolean(busy)}>Guardar branding</Button>
            </form>
          </Card>
          <Card>
            <CardHeader title="Preview" description="Vista basica con fallback." />
            <div className="space-y-5 p-5">
              <div className="rounded-lg border border-slate-200 p-5" style={{ borderTopColor: branding.primaryColor, borderTopWidth: 6 }}>
                {branding.logoUrl ? <img src={branding.logoUrl} alt="" className="mb-4 h-14 max-w-full object-contain" /> : null}
                <p className="text-xl font-semibold" style={{ color: branding.secondaryColor || '#0f172a' }}>{branding.companyName || settings?.name || 'TenantDesk'}</p>
                <p className="mt-2 text-sm text-slate-500">{branding.supportEmail || 'soporte@ejemplo.com'}</p>
                <button type="button" className="mt-5 rounded-md px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: branding.primaryColor || '#0e7490' }}>Accion principal</button>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 text-sm">
                <p><strong>Dominio:</strong> {settings?.customDomain?.domain || 'No configurado'}</p>
                <p className="mt-2"><strong>Estado:</strong> {settings?.customDomain?.status || 'not_configured'}</p>
                {settings?.customDomain?.verificationToken ? <p className="mt-2 break-all"><strong>Token:</strong> {settings.customDomain.verificationToken}</p> : null}
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {section === 'onboarding' ? (
        <Card>
          <CardHeader title="Checklist del distribuidor" description="Los pasos se recalculan desde datos reales." />
          <div className="grid gap-3 p-5 md:grid-cols-2">
            {Object.entries(onboarding?.steps || {}).map(([step, completed]) => (
              <div key={step} className={`flex items-center gap-3 rounded-lg border p-4 ${completed ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'}`}>
                <CheckCircle2 className={`h-5 w-5 ${completed ? 'text-emerald-600' : 'text-slate-300'}`} />
                <span className="text-sm font-semibold text-slate-700">{onboardingLabels[step] || step}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 p-5 text-sm text-slate-500">
            Estado general: <Badge tone={onboarding?.completed ? 'active' : 'pending'}>{onboarding?.completed ? 'completado' : 'pendiente'}</Badge>
          </div>
        </Card>
      ) : null}
    </PageShell>
  );
}
