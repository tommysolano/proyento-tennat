import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createDistributorInvoice, updateDistributorInvoice } from '../../../api.js';
import { Badge } from '../../../components/Badge.jsx';
import { Button } from '../../../components/Button.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { Drawer } from '../../../components/Drawer.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormGrid, FormGridFull } from '../../../components/FormGrid.jsx';
import { Table } from '../../../components/Table.jsx';
import { addDaysInput, formatMoney } from '../../../utils/billing.js';

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

const INVOICE_STATUSES = ['draft', 'open', 'paid', 'overdue', 'void', 'uncollectible'];

function dateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(new Date(value));
}

const emptyLineItem = { description: '', quantity: 1, unitPrice: 0, moduleKey: '' };

export function DistributorInvoicesSection({ workspace }) {
  const { commerceCompanies = [], invoices = [], settings, modules, busy, mutate } =
    workspace;
  const moduleCatalog = modules || { modules: [], authorizedModuleKeys: [] };
  const billingSettings = settings?.billingSettings || {};

  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [lineItems, setLineItems] = useState([emptyLineItem]);
  const [subscriptionId, setSubscriptionId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [dueDate, setDueDate] = useState(addDaysInput(15));

  const companyNames = useMemo(
    () => new Map(commerceCompanies.map((company) => [company._id, company.name])),
    [commerceCompanies]
  );
  const visibleInvoices = invoices.filter(
    (invoice) =>
      (!statusFilter || invoice.status === statusFilter) &&
      (!companyFilter || String(invoice.customerId) === companyFilter)
  );
  const invoiceCompany = commerceCompanies.find(
    (company) => company.subscription?._id === subscriptionId
  );

  function handleSubscription(nextSubscriptionId) {
    setSubscriptionId(nextSubscriptionId);
    const company = commerceCompanies.find(
      (item) => item.subscription?._id === nextSubscriptionId
    );
    const plan = company?.subscription?.planId;
    setCurrency(plan?.currency || 'USD');
    setLineItems([
      {
        description: plan ? `Suscripcion ${plan.name} - ${plan.billingCycle}` : '',
        quantity: 1,
        unitPrice: Number(plan?.price || 0),
        moduleKey: ''
      }
    ]);
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

  async function handleCreateInvoice(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await mutate(
      'invoice',
      () =>
        createDistributorInvoice({
          companyId: invoiceCompany?._id,
          subscriptionId,
          currency,
          taxRate: Number(data.get('taxRate') || 0),
          dueDate: data.get('dueDate'),
          status: data.get('status'),
          lineItems
        }),
      'Factura creada y numerada por el servidor.'
    );
    if (ok) {
      form.reset();
      setSubscriptionId('');
      setCurrency('USD');
      setDueDate(addDaysInput(15));
      setLineItems([emptyLineItem]);
      setOpen(false);
    }
  }

  async function handleVoidInvoice(invoice) {
    await mutate(
      `void-${invoice._id}`,
      () => updateDistributorInvoice(invoice._id, { status: 'void' }),
      `Factura ${invoice.number} anulada.`
    );
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Facturas emitidas"
          description="Filtrado local sobre datos tenant-safe de la API."
          action={
            <Button onClick={() => setOpen(true)} disabled={Boolean(busy)}>
              <Plus className="h-4 w-4" />
              Crear factura
            </Button>
          }
        />
        <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2">
          <FormField label="Empresa" htmlFor="invoice-filter-company">
            <select
              id="invoice-filter-company"
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
              className={inputClass}
            >
              <option value="">Todas las empresas</option>
              {commerceCompanies.map((company) => (
                <option key={company._id} value={company._id}>
                  {company.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Estado" htmlFor="invoice-filter-status">
            <select
              id="invoice-filter-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={inputClass}
            >
              <option value="">Todos los estados</option>
              {INVOICE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <Table
          data={visibleInvoices.map((invoice) => ({
            ...invoice,
            id: invoice._id,
            companyLabel: companyNames.get(String(invoice.customerId)) || '-',
            totalLabel: formatMoney(invoice.total, invoice.currency),
            balanceLabel: formatMoney(invoice.balanceDue ?? invoice.total, invoice.currency),
            dueLabel: dateLabel(invoice.dueDate)
          }))}
          emptyText="No hay facturas para este filtro"
          columns={[
            { key: 'number', header: 'Numero', nowrap: true },
            { key: 'companyLabel', header: 'Empresa', truncate: true, width: '14rem' },
            { key: 'totalLabel', header: 'Total', nowrap: true, align: 'right' },
            { key: 'balanceLabel', header: 'Pendiente', nowrap: true, align: 'right', hideBelow: 'sm' },
            { key: 'dueLabel', header: 'Vence', nowrap: true, hideBelow: 'md' },
            {
              key: 'status',
              header: 'Estado',
              nowrap: true,
              render: (row) => <Badge tone={row.status}>{row.status}</Badge>
            },
            {
              key: 'actions',
              header: 'Accion',
              nowrap: true,
              render: (row) =>
                !['paid', 'void'].includes(row.status) ? (
                  <Button variant="secondary" className="px-3" onClick={() => handleVoidInvoice(row)}>
                    Anular
                  </Button>
                ) : (
                  '-'
                )
            }
          ]}
        />
      </Card>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Crear factura manual"
        description="Subtotal, impuesto, total y numero se calculan en backend."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="distributor-invoice-form" disabled={Boolean(busy)}>
              {busy === 'invoice' ? 'Creando...' : 'Crear factura'}
            </Button>
          </>
        }
      >
        <form id="distributor-invoice-form" className="space-y-6" onSubmit={handleCreateInvoice}>
          <FormGrid title="Datos de la factura">
            <FormField label="Suscripcion activa" htmlFor="commerce-invoice-subscription" required>
              <select
                id="commerce-invoice-subscription"
                required
                name="subscriptionId"
                value={subscriptionId}
                onChange={(event) => handleSubscription(event.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Selecciona una suscripcion
                </option>
                {commerceCompanies
                  .filter((company) => company.subscription?.status === 'active')
                  .map((company) => (
                    <option key={company.subscription._id} value={company.subscription._id}>
                      {company.name} - {company.subscription.planId?.name}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField label="Empresa vinculada" htmlFor="commerce-invoice-company">
              <input
                id="commerce-invoice-company"
                value={invoiceCompany?.name || ''}
                readOnly
                className={inputClass}
              />
            </FormField>
            <FormField label="Fecha de vencimiento" htmlFor="commerce-invoice-due" required>
              <input
                id="commerce-invoice-due"
                required
                type="date"
                name="dueDate"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormField label="Estado inicial" htmlFor="commerce-invoice-status">
              <select id="commerce-invoice-status" name="status" className={inputClass}>
                <option value="open">Open</option>
                <option value="draft">Draft</option>
              </select>
            </FormField>
            <FormField
              label="Moneda"
              htmlFor="commerce-invoice-currency"
              hint="Proviene del plan de la suscripcion."
            >
              <input
                id="commerce-invoice-currency"
                name="currency"
                className={inputClass}
                value={currency}
                readOnly
              />
            </FormField>
            <FormField label="Impuesto (%)" htmlFor="commerce-invoice-tax">
              <input
                id="commerce-invoice-tax"
                min="0"
                step="0.01"
                type="number"
                name="taxRate"
                className={inputClass}
                defaultValue={billingSettings.taxRate || 0}
                placeholder="0"
              />
            </FormField>
          </FormGrid>

          <FormGrid title="Conceptos facturados" columns={1}>
            {lineItems.map((item, index) => (
              <div key={index} className="space-y-3 rounded-lg border border-slate-200 p-4">
                <FormField label="Descripcion">
                  <input
                    required
                    value={item.description}
                    onChange={(event) => updateLineItem(index, 'description', event.target.value)}
                    className={inputClass}
                    placeholder="Concepto facturado"
                  />
                </FormField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Cantidad">
                    <input
                      required
                      min="0"
                      step="0.01"
                      type="number"
                      value={item.quantity}
                      onChange={(event) => updateLineItem(index, 'quantity', event.target.value)}
                      className={inputClass}
                      placeholder="1"
                    />
                  </FormField>
                  <FormField label="Precio unitario">
                    <input
                      required
                      min="0"
                      step="0.01"
                      type="number"
                      value={item.unitPrice}
                      onChange={(event) => updateLineItem(index, 'unitPrice', event.target.value)}
                      className={inputClass}
                      placeholder="0.00"
                    />
                  </FormField>
                </div>
                <FormField label="Modulo asociado">
                  <select
                    value={item.moduleKey}
                    onChange={(event) => updateLineItem(index, 'moduleKey', event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Sin modulo</option>
                    {moduleCatalog.modules
                      .filter((module) => module.authorized)
                      .map((module) => (
                        <option key={module.key} value={module.key}>
                          {module.name}
                        </option>
                      ))}
                  </select>
                </FormField>
                <Button
                  variant="danger"
                  className="px-3"
                  disabled={lineItems.length === 1}
                  onClick={() =>
                    setLineItems((items) => items.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  Quitar
                </Button>
              </div>
            ))}
            <FormGridFull>
              <Button
                variant="secondary"
                onClick={() => setLineItems((items) => [...items, emptyLineItem])}
              >
                <Plus className="h-4 w-4" /> Agregar item
              </Button>
            </FormGridFull>
          </FormGrid>
        </form>
      </Drawer>
    </>
  );
}
