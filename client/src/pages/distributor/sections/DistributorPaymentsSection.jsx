import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createDistributorPayment } from '../../../api.js';
import { Badge } from '../../../components/Badge.jsx';
import { Button } from '../../../components/Button.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { Drawer } from '../../../components/Drawer.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormGrid, FormGridFull } from '../../../components/FormGrid.jsx';
import { Table } from '../../../components/Table.jsx';
import { formatMoney, localDateInput, paymentDefaults } from '../../../utils/billing.js';

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

const PAYMENT_STATUSES = ['pending', 'succeeded', 'failed', 'refunded'];

function dateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(new Date(value));
}

export function DistributorPaymentsSection({ workspace }) {
  const { commerceCompanies = [], invoices = [], payments = [], busy, mutate } = workspace;

  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');
  const [paidAt, setPaidAt] = useState(localDateInput());

  const companyNames = useMemo(
    () => new Map(commerceCompanies.map((company) => [company._id, company.name])),
    [commerceCompanies]
  );
  const visiblePayments = payments.filter(
    (payment) =>
      (!statusFilter || payment.status === statusFilter) &&
      (!companyFilter || String(payment.payerId) === companyFilter)
  );
  const pendingInvoices = invoices.filter((invoice) =>
    ['open', 'overdue'].includes(invoice.status)
  );
  const selectedInvoice = invoices.find((invoice) => invoice._id === invoiceId);

  function handleInvoice(nextInvoiceId) {
    setInvoiceId(nextInvoiceId);
    const invoice = invoices.find((item) => item._id === nextInvoiceId);
    const defaults = paymentDefaults(
      invoice,
      companyNames.get(String(invoice?.customerId)) || ''
    );
    setAmount(defaults.amount);
    setCurrency(defaults.currency);
    setDescription(defaults.description);
    setPaidAt(defaults.paidAt);
  }

  async function handleCreatePayment(event) {
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
      setInvoiceId('');
      setAmount('');
      setCurrency('USD');
      setDescription('');
      setPaidAt(localDateInput());
      setOpen(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Pagos recibidos"
          description="Pagos manuales de empresas al distribuidor."
          action={
            <Button
              onClick={() => setOpen(true)}
              disabled={Boolean(busy) || !pendingInvoices.length}
            >
              <Plus className="h-4 w-4" />
              Registrar pago
            </Button>
          }
        />
        <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2">
          <FormField label="Empresa" htmlFor="payment-filter-company">
            <select
              id="payment-filter-company"
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
          <FormField label="Estado" htmlFor="payment-filter-status">
            <select
              id="payment-filter-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={inputClass}
            >
              <option value="">Todos los estados</option>
              {PAYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <Table
          data={visiblePayments.map((payment) => ({
            ...payment,
            id: payment._id,
            invoiceLabel: payment.invoiceId?.number || '-',
            companyLabel: companyNames.get(String(payment.payerId)) || '-',
            amountLabel: formatMoney(payment.amount, payment.currency),
            paidLabel: dateLabel(payment.paidAt || payment.createdAt)
          }))}
          emptyText="No hay pagos para este filtro"
          columns={[
            { key: 'invoiceLabel', header: 'Factura', nowrap: true },
            { key: 'companyLabel', header: 'Empresa', truncate: true, width: '14rem' },
            { key: 'amountLabel', header: 'Monto', nowrap: true, align: 'right' },
            { key: 'method', header: 'Metodo', nowrap: true, hideBelow: 'sm' },
            {
              key: 'status',
              header: 'Estado',
              nowrap: true,
              render: (row) => <Badge tone={row.status}>{row.status}</Badge>
            },
            { key: 'paidLabel', header: 'Fecha', nowrap: true, hideBelow: 'md' }
          ]}
        />
      </Card>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar pago"
        description="La factura cambia a paid cuando la suma cubre el total."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="distributor-payment-form"
              disabled={Boolean(busy) || !selectedInvoice}
            >
              {busy === 'payment' ? 'Registrando...' : 'Registrar pago'}
            </Button>
          </>
        }
      >
        <form id="distributor-payment-form" onSubmit={handleCreatePayment}>
          <FormGrid columns={1}>
            <FormField label="Factura pendiente" htmlFor="commerce-payment-invoice" required>
              <select
                id="commerce-payment-invoice"
                required
                name="invoiceId"
                value={invoiceId}
                onChange={(event) => handleInvoice(event.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Selecciona una factura
                </option>
                {pendingInvoices.map((invoice) => (
                  <option key={invoice._id} value={invoice._id}>
                    {invoice.number} - {companyNames.get(String(invoice.customerId))} -{' '}
                    {formatMoney(invoice.balanceDue ?? invoice.total, invoice.currency)}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Monto recibido" htmlFor="commerce-payment-amount" required>
                <input
                  id="commerce-payment-amount"
                  required
                  min="0.01"
                  max={selectedInvoice?.balanceDue ?? selectedInvoice?.total}
                  step="0.01"
                  type="number"
                  name="amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className={inputClass}
                  placeholder="0.00"
                />
              </FormField>
              <FormField label="Moneda" htmlFor="commerce-payment-currency">
                <input
                  id="commerce-payment-currency"
                  name="currency"
                  className={inputClass}
                  value={currency}
                  readOnly
                />
              </FormField>
            </div>
            <FormField label="Metodo" htmlFor="commerce-payment-method">
              <select id="commerce-payment-method" name="method" className={inputClass}>
                <option value="transfer">Transferencia</option>
                <option value="cash">Efectivo</option>
                <option value="manual">Manual</option>
              </select>
            </FormField>
            <FormField label="Descripcion" htmlFor="commerce-payment-description">
              <input
                id="commerce-payment-description"
                name="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className={inputClass}
                placeholder="Referencia o comprobante"
              />
            </FormField>
            <FormField label="Fecha de pago" htmlFor="commerce-payment-date" required>
              <input
                id="commerce-payment-date"
                required
                type="date"
                name="paidAt"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormGridFull>
              <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Empresa: {companyNames.get(String(selectedInvoice?.customerId)) || '-'}
                <br />
                Suscripcion: {selectedInvoice?.subscriptionId || '-'}
              </div>
            </FormGridFull>
          </FormGrid>
        </form>
      </Drawer>
    </>
  );
}
