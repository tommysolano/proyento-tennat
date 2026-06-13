import {
  Building2,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileText,
  LogIn,
  Plus,
  RefreshCcw,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createDistributorInvoice,
  createDistributorPayment,
  getDistributorBillingOverview,
  getDistributorCompanies,
  getDistributorInvoices,
  getDistributorModules,
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
import { LoadingState } from '../../components/AsyncState.jsx';
import { BillingPlanSummary } from '../../components/BillingPlanSummary.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { FormField } from '../../components/FormField.jsx';
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
  const navigate = useNavigate();
  const { impersonateAdmin, refreshSession } = useAuth();
  const [overview, setOverview] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [plans, setPlans] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [settings, setSettings] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [moduleCatalog, setModuleCatalog] = useState({
    modules: [],
    authorizedModuleKeys: []
  });
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
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState('active');
  const [subscriptionStartsAt, setSubscriptionStartsAt] = useState(localDateTimeInput());
  const [subscriptionTrialEndsAt, setSubscriptionTrialEndsAt] = useState(
    addDaysDateTimeInput(14)
  );
  const [invoiceSubscriptionId, setInvoiceSubscriptionId] = useState('');
  const [invoiceCurrency, setInvoiceCurrency] = useState('USD');
  const [invoiceDueDate, setInvoiceDueDate] = useState(addDaysInput(15));
  const [paymentInvoiceId, setPaymentInvoiceId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentCurrency, setPaymentCurrency] = useState('USD');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [paymentDate, setPaymentDate] = useState(localDateInput());

  const loadPage = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const [companyData, planData, settingsData, onboardingData, moduleData] = await Promise.all([
        getDistributorCompanies(),
        getPlans(),
        getDistributorSettings(),
        getDistributorOnboarding(),
        getDistributorModules()
      ]);
      setCompanies(companyData);
      setPlans(planData);
      setSettings(settingsData);
      setOnboarding(onboardingData);
      setModuleCatalog(moduleData);

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
  const selectedPlan = plans.find((plan) => plan._id === selectedPlanId);
  const invoiceCompany = companies.find(
    (company) => company.subscription?._id === invoiceSubscriptionId
  );
  const selectedPaymentInvoice = invoices.find(
    (invoice) => invoice._id === paymentInvoiceId
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

  async function handleEnterCompany(company) {
    setBusy(`impersonate-${company._id}`);
    setError('');
    try {
      const data = await impersonateAdmin(company._id);
      navigate(data.redirectPath, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  async function handleSubscription(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await mutate(
      'subscription',
      () =>
        setCompanySubscription(data.get('companyId'), subscriptionPayload({
          planId: data.get('planId'),
          status: data.get('status'),
          startsAt: data.get('startsAt'),
          trialEndsAt: data.get('trialEndsAt')
        })),
      'Plan asignado a la empresa.'
    );
    if (ok) {
      form.reset();
      setSelectedCompanyId('');
      setSelectedPlanId('');
      setSubscriptionStatus('active');
      setSubscriptionStartsAt(localDateTimeInput());
      setSubscriptionTrialEndsAt(addDaysDateTimeInput(14));
    }
  }

  function handleSubscriptionCompany(companyId) {
    setSelectedCompanyId(companyId);
    const company = companies.find((item) => item._id === companyId);
    setSelectedPlanId(company?.subscription?.planId?._id || '');
    setSubscriptionStatus(company?.subscription?.status || 'active');
    setSubscriptionStartsAt(
      company?.subscription?.startsAt
        ? localDateTimeInput(new Date(company.subscription.startsAt))
        : localDateTimeInput()
    );
    setSubscriptionTrialEndsAt(
      company?.subscription?.trialEndsAt
        ? localDateTimeInput(new Date(company.subscription.trialEndsAt))
        : addDaysDateTimeInput(14)
    );
  }

  function handleInvoiceSubscription(subscriptionId) {
    setInvoiceSubscriptionId(subscriptionId);
    const company = companies.find((item) => item.subscription?._id === subscriptionId);
    const plan = company?.subscription?.planId;
    setInvoiceCurrency(plan?.currency || 'USD');
    setLineItems([
      {
        description: plan ? `Suscripcion ${plan.name} - ${plan.billingCycle}` : '',
        quantity: 1,
        unitPrice: Number(plan?.price || 0),
        moduleKey: ''
      }
    ]);
  }

  function handlePaymentInvoice(invoiceId) {
    setPaymentInvoiceId(invoiceId);
    const invoice = invoices.find((item) => item._id === invoiceId);
    const defaults = paymentDefaults(
      invoice,
      companyNames.get(String(invoice?.customerId)) || ''
    );
    setPaymentAmount(defaults.amount);
    setPaymentCurrency(defaults.currency);
    setPaymentDescription(defaults.description);
    setPaymentDate(defaults.paidAt);
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
          companyId: invoiceCompany?._id,
          subscriptionId: invoiceSubscriptionId,
          currency: invoiceCurrency,
          taxRate: Number(data.get('taxRate') || 0),
          dueDate: data.get('dueDate'),
          status: data.get('status'),
          lineItems
        }),
      'Factura creada y numerada por el servidor.'
    );
    if (ok) {
      form.reset();
      setInvoiceSubscriptionId('');
      setInvoiceCurrency('USD');
      setInvoiceDueDate(addDaysInput(15));
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
          paidAt: data.get('paidAt'),
          status: 'succeeded',
          metadata: { description: data.get('description') }
        }),
      'Pago manual registrado.'
    );
    if (ok) {
      form.reset();
      setPaymentInvoiceId('');
      setPaymentAmount('');
      setPaymentCurrency('USD');
      setPaymentDescription('');
      setPaymentDate(localDateInput());
    }
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
        <LoadingState label="Cargando operacion comercial y facturacion..." />
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
                      <Button
                        className="px-3"
                        variant="secondary"
                        disabled={!row.canImpersonate || Boolean(busy)}
                        onClick={() => handleEnterCompany(row)}
                      >
                        <LogIn className="h-4 w-4" /> Entrar
                      </Button>
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
              <FormField label="Empresa" htmlFor="commerce-subscription-company" required>
                <select id="commerce-subscription-company" required name="companyId" value={selectedCompanyId} onChange={(event) => handleSubscriptionCompany(event.target.value)} className={inputClass}>
                  <option value="" disabled>Selecciona una empresa</option>
                  {companies.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}
                </select>
              </FormField>
              <FormField label="Plan comercial" htmlFor="commerce-subscription-plan" required>
                <select id="commerce-subscription-plan" required disabled={!selectedCompanyId} name="planId" value={selectedPlanId} onChange={(event) => setSelectedPlanId(event.target.value)} className={inputClass}>
                  <option value="" disabled>Selecciona un plan</option>
                  {(selectedCompanyId ? plans : [])
                    .filter((plan) => plan.status === 'active' || plan._id === selectedPlanId)
                    .map((plan) => <option key={plan._id} value={plan._id}>{plan.name}</option>)}
                </select>
              </FormField>
              <FormField label="Estado" htmlFor="commerce-subscription-status" hint="El trial no puede facturarse hasta activarse.">
                <select id="commerce-subscription-status" name="status" value={subscriptionStatus} onChange={(event) => setSubscriptionStatus(event.target.value)} className={inputClass}>
                  <option value="active">Activa</option>
                  <option value="trial">Trial</option>
                  <option value="past_due">Past due</option>
                  <option value="suspended">Suspendida</option>
                </select>
              </FormField>
              <FormField label="Fecha de inicio" htmlFor="commerce-subscription-start">
                <input id="commerce-subscription-start" type="datetime-local" name="startsAt" value={subscriptionStartsAt} onChange={(event) => setSubscriptionStartsAt(event.target.value)} className={inputClass} />
              </FormField>
              {subscriptionStatus === 'trial' ? (
                <FormField label="Fin de trial" htmlFor="commerce-subscription-trial-end" hint="Obligatorio. Durante este periodo no se puede facturar." required>
                  <input id="commerce-subscription-trial-end" required type="datetime-local" name="trialEndsAt" value={subscriptionTrialEndsAt} onChange={(event) => setSubscriptionTrialEndsAt(event.target.value)} className={inputClass} />
                </FormField>
              ) : null}
              <div className="md:col-span-4">
                <BillingPlanSummary plan={selectedPlan} trial={subscriptionStatus === 'trial'} />
              </div>
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
              <FormField label="Empresa" htmlFor="invoice-filter-company">
                <select id="invoice-filter-company" value={invoiceCompanyFilter} onChange={(event) => setInvoiceCompanyFilter(event.target.value)} className={inputClass}>
                  <option value="">Todas las empresas</option>
                  {companies.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}
                </select>
              </FormField>
              <FormField label="Estado" htmlFor="invoice-filter-status">
                <select id="invoice-filter-status" value={invoiceStatusFilter} onChange={(event) => setInvoiceStatusFilter(event.target.value)} className={inputClass}>
                  <option value="">Todos los estados</option>
                  {['draft', 'open', 'paid', 'overdue', 'void', 'uncollectible'].map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </FormField>
            </div>
            <Table
              data={visibleInvoices.map((invoice) => ({
                ...invoice,
                id: invoice._id,
                companyLabel: companyNames.get(String(invoice.customerId)) || '-',
                totalLabel: money(invoice.total, invoice.currency),
                balanceLabel: money(invoice.balanceDue ?? invoice.total, invoice.currency),
                dueLabel: dateLabel(invoice.dueDate)
              }))}
              emptyText="No hay facturas para este filtro"
              columns={[
                { key: 'number', header: 'Numero' },
                { key: 'companyLabel', header: 'Empresa' },
                { key: 'totalLabel', header: 'Total' },
                { key: 'balanceLabel', header: 'Pendiente' },
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
                <FormField label="Suscripcion activa" htmlFor="commerce-invoice-subscription" required>
                  <select id="commerce-invoice-subscription" required name="subscriptionId" value={invoiceSubscriptionId} onChange={(event) => handleInvoiceSubscription(event.target.value)} className={inputClass}>
                    <option value="" disabled>Selecciona una suscripcion</option>
                    {companies.filter((company) => company.subscription?.status === 'active').map((company) => <option key={company.subscription._id} value={company.subscription._id}>{company.name} - {company.subscription.planId?.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Empresa vinculada" htmlFor="commerce-invoice-company">
                  <input id="commerce-invoice-company" value={invoiceCompany?.name || ''} readOnly className={inputClass} />
                </FormField>
                <FormField label="Fecha de vencimiento" htmlFor="commerce-invoice-due" required>
                  <input id="commerce-invoice-due" required type="date" name="dueDate" value={invoiceDueDate} onChange={(event) => setInvoiceDueDate(event.target.value)} className={inputClass} />
                </FormField>
                <FormField label="Estado inicial" htmlFor="commerce-invoice-status">
                  <select id="commerce-invoice-status" name="status" className={inputClass}><option value="open">Open</option><option value="draft">Draft</option></select>
                </FormField>
                <FormField label="Moneda" htmlFor="commerce-invoice-currency" hint="Proviene del plan de la suscripcion.">
                  <input id="commerce-invoice-currency" name="currency" className={inputClass} value={invoiceCurrency} readOnly />
                </FormField>
                <FormField label="Impuesto (%)" htmlFor="commerce-invoice-tax">
                  <input id="commerce-invoice-tax" min="0" step="0.01" type="number" name="taxRate" className={inputClass} defaultValue={billingSettings.taxRate || 0} placeholder="0" />
                </FormField>
              </div>
              <div className="space-y-3">
                {lineItems.map((item, index) => (
                  <div key={index} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[2fr_0.6fr_0.8fr_1fr_auto]">
                    <FormField label="Descripcion">
                      <input required value={item.description} onChange={(event) => updateLineItem(index, 'description', event.target.value)} className={inputClass} placeholder="Concepto facturado" />
                    </FormField>
                    <FormField label="Cantidad">
                      <input required min="0" step="0.01" type="number" value={item.quantity} onChange={(event) => updateLineItem(index, 'quantity', event.target.value)} className={inputClass} placeholder="1" />
                    </FormField>
                    <FormField label="Precio unitario">
                      <input required min="0" step="0.01" type="number" value={item.unitPrice} onChange={(event) => updateLineItem(index, 'unitPrice', event.target.value)} className={inputClass} placeholder="0.00" />
                    </FormField>
                    <FormField label="Modulo asociado">
                      <select value={item.moduleKey} onChange={(event) => updateLineItem(index, 'moduleKey', event.target.value)} className={inputClass}>
                        <option value="">Sin modulo</option>
                        {moduleCatalog.modules
                          .filter((module) => module.authorized)
                          .map((module) => (
                            <option key={module.key} value={module.key}>{module.name}</option>
                          ))}
                      </select>
                    </FormField>
                    <Button variant="danger" className="self-end px-3" disabled={lineItems.length === 1} onClick={() => setLineItems((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Quitar</Button>
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
              <FormField label="Empresa" htmlFor="payment-filter-company">
                <select id="payment-filter-company" value={paymentCompanyFilter} onChange={(event) => setPaymentCompanyFilter(event.target.value)} className={inputClass}>
                  <option value="">Todas las empresas</option>
                  {companies.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}
                </select>
              </FormField>
              <FormField label="Estado" htmlFor="payment-filter-status">
                <select id="payment-filter-status" value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value)} className={inputClass}>
                  <option value="">Todos los estados</option>
                  {['pending', 'succeeded', 'failed', 'refunded'].map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </FormField>
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
              <FormField label="Factura pendiente" htmlFor="commerce-payment-invoice" required>
                <select id="commerce-payment-invoice" required name="invoiceId" value={paymentInvoiceId} onChange={(event) => handlePaymentInvoice(event.target.value)} className={inputClass}>
                  <option value="" disabled>Selecciona una factura</option>
                  {pendingInvoices.map((invoice) => <option key={invoice._id} value={invoice._id}>{invoice.number} - {companyNames.get(String(invoice.customerId))} - {money(invoice.balanceDue ?? invoice.total, invoice.currency)}</option>)}
                </select>
              </FormField>
              <FormField label="Monto recibido" htmlFor="commerce-payment-amount" required>
                <input id="commerce-payment-amount" required min="0.01" max={selectedPaymentInvoice?.balanceDue ?? selectedPaymentInvoice?.total} step="0.01" type="number" name="amount" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className={inputClass} placeholder="0.00" />
              </FormField>
              <FormField label="Moneda" htmlFor="commerce-payment-currency">
                <input id="commerce-payment-currency" name="currency" className={inputClass} value={paymentCurrency} readOnly />
              </FormField>
              <FormField label="Metodo" htmlFor="commerce-payment-method">
                <select id="commerce-payment-method" name="method" className={inputClass}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="manual">Manual</option></select>
              </FormField>
              <FormField label="Descripcion" htmlFor="commerce-payment-description" className="md:col-span-2">
                <input id="commerce-payment-description" name="description" value={paymentDescription} onChange={(event) => setPaymentDescription(event.target.value)} className={inputClass} placeholder="Referencia o comprobante" />
              </FormField>
              <FormField label="Fecha de pago" htmlFor="commerce-payment-date" required>
                <input id="commerce-payment-date" required type="date" name="paidAt" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className={inputClass} />
              </FormField>
              <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Empresa: {companyNames.get(String(selectedPaymentInvoice?.customerId)) || '-'}
                <br />
                Suscripcion: {selectedPaymentInvoice?.subscriptionId || '-'}
              </div>
              <Button className="md:col-span-4" type="submit" disabled={Boolean(busy) || !selectedPaymentInvoice}>Registrar pago</Button>
            </form>
          </Card>
        </>
      ) : null}

      {section === 'settings' ? (
        <Card>
          <CardHeader title="Configuracion comercial y billing" description="Valores usados al emitir facturas a empresas." />
          <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={handleSettings}>
            <FormField label="Nombre comercial" htmlFor="settings-name" required>
              <input id="settings-name" required name="name" className={inputClass} defaultValue={settings?.name} placeholder="Nombre visible" />
            </FormField>
            <FormField label="Telefono" htmlFor="settings-phone">
              <input id="settings-phone" name="phone" className={inputClass} defaultValue={settings?.phone} placeholder="+593..." />
            </FormField>
            <FormField label="Moneda por defecto" htmlFor="settings-default-currency" hint="Codigo ISO de tres letras, por ejemplo USD.">
              <input id="settings-default-currency" name="defaultCurrency" className={inputClass} defaultValue={generalSettings.defaultCurrency || 'USD'} placeholder="USD" />
            </FormField>
            <FormField label="Idioma / locale" htmlFor="settings-locale" hint="Formato regional usado en fechas y numeros.">
              <input id="settings-locale" name="defaultLocale" className={inputClass} defaultValue={generalSettings.defaultLocale || 'es-EC'} placeholder="es-EC" />
            </FormField>
            <FormField label="Zona horaria" htmlFor="settings-timezone" hint="Nombre IANA, por ejemplo America/Guayaquil.">
              <input id="settings-timezone" name="defaultTimezone" className={inputClass} defaultValue={generalSettings.defaultTimezone || 'America/Guayaquil'} placeholder="America/Guayaquil" />
            </FormField>
            <FormField label="Moneda de facturacion" htmlFor="settings-billing-currency">
              <input id="settings-billing-currency" name="currency" className={inputClass} defaultValue={billingSettings.currency || 'USD'} placeholder="USD" />
            </FormField>
            <FormField label="Prefijo de facturas" htmlFor="settings-invoice-prefix" hint="Se usa para construir el numero visible de cada factura." required>
              <input id="settings-invoice-prefix" required name="invoicePrefix" className={inputClass} defaultValue={billingSettings.invoicePrefix || 'FAC'} placeholder="FAC" />
            </FormField>
            <FormField label="Impuesto (%)" htmlFor="settings-tax-rate">
              <input id="settings-tax-rate" min="0" step="0.01" type="number" name="taxRate" className={inputClass} defaultValue={billingSettings.taxRate || 0} placeholder="0" />
            </FormField>
            <FormField label="Dias de gracia" htmlFor="settings-grace-days" hint="Dias adicionales antes de considerar vencida una obligacion.">
              <input id="settings-grace-days" min="0" type="number" name="gracePeriodDays" className={inputClass} defaultValue={billingSettings.gracePeriodDays || 0} placeholder="0" />
            </FormField>
            <FormField label="URL de terminos" htmlFor="settings-terms-url">
              <input id="settings-terms-url" type="url" name="termsUrl" className={inputClass} defaultValue={generalSettings.termsUrl} placeholder="https://..." />
            </FormField>
            <FormField label="URL de privacidad" htmlFor="settings-privacy-url">
              <input id="settings-privacy-url" type="url" name="privacyUrl" className={inputClass} defaultValue={generalSettings.privacyUrl} placeholder="https://..." />
            </FormField>
            <FormField label="Instrucciones de pago" htmlFor="settings-payment-instructions">
              <textarea id="settings-payment-instructions" name="paymentInstructions" className={`${inputClass} min-h-24`} defaultValue={billingSettings.paymentInstructions} placeholder="Cuenta bancaria, referencia y pasos." />
            </FormField>
            <FormField label="Terminos de facturacion" htmlFor="settings-billing-terms" className="md:col-span-2">
              <textarea id="settings-billing-terms" name="termsAndConditions" className={`${inputClass} min-h-24`} defaultValue={billingSettings.termsAndConditions} placeholder="Condiciones que apareceran en la factura." />
            </FormField>
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
              <FormField label="Nombre de marca" htmlFor="branding-company-name">
                <input id="branding-company-name" name="companyName" className={inputClass} defaultValue={branding.companyName} placeholder="Nombre visible" />
              </FormField>
              <FormField label="Logo URL" htmlFor="branding-logo-url" hint="URL publica HTTPS de la imagen.">
                <input id="branding-logo-url" type="url" name="logoUrl" className={inputClass} defaultValue={branding.logoUrl} placeholder="https://..." />
              </FormField>
              <FormField label="Favicon URL" htmlFor="branding-favicon-url">
                <input id="branding-favicon-url" type="url" name="faviconUrl" className={inputClass} defaultValue={branding.faviconUrl} placeholder="https://..." />
              </FormField>
              <FormField label="Fondo de login URL" htmlFor="branding-login-background">
                <input id="branding-login-background" type="url" name="loginBackgroundUrl" className={inputClass} defaultValue={branding.loginBackgroundUrl} placeholder="https://..." />
              </FormField>
              <FormField label="Color principal" htmlFor="branding-primary-color">
                <input id="branding-primary-color" type="color" name="primaryColor" className={`${inputClass} h-12`} defaultValue={branding.primaryColor || '#0e7490'} />
              </FormField>
              <FormField label="Color secundario" htmlFor="branding-secondary-color">
                <input id="branding-secondary-color" type="color" name="secondaryColor" className={`${inputClass} h-12`} defaultValue={branding.secondaryColor || '#0f172a'} />
              </FormField>
              <FormField label="Color de acento" htmlFor="branding-accent-color">
                <input id="branding-accent-color" type="color" name="accentColor" className={`${inputClass} h-12`} defaultValue={branding.accentColor || '#06b6d4'} />
              </FormField>
              <FormField label="Email de soporte" htmlFor="branding-support-email">
                <input id="branding-support-email" type="email" name="supportEmail" className={inputClass} defaultValue={branding.supportEmail} placeholder="soporte@empresa.com" />
              </FormField>
              <FormField label="Telefono de soporte" htmlFor="branding-support-phone">
                <input id="branding-support-phone" name="supportPhone" className={inputClass} defaultValue={branding.supportPhone} placeholder="+593..." />
              </FormField>
              <FormField label="Dominio personalizado" htmlFor="branding-domain" hint="Solo configura el valor; la validacion DNS sigue siendo externa.">
                <input id="branding-domain" name="domain" className={inputClass} defaultValue={settings?.customDomain?.domain} placeholder="crm.midominio.com" />
              </FormField>
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
