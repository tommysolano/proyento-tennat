import { Plus } from 'lucide-react';
import { useState } from 'react';
import { createPlatformInvoice, createPlatformPayment } from '../../../api.js';
import { Badge } from '../../../components/Badge.jsx';
import { Button } from '../../../components/Button.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { Drawer } from '../../../components/Drawer.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormGrid, FormGridFull } from '../../../components/FormGrid.jsx';
import { Table } from '../../../components/Table.jsx';
import {
  addDaysInput,
  formatMoney,
  localDateInput,
  paymentDefaults
} from '../../../utils/billing.js';

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

function dateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function SuperAdminBillingSection({ workspace }) {
  const {
    invoices = [],
    payments = [],
    subscriptions = [],
    distributorNames,
    busy,
    mutate
  } = workspace;

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

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

  const selectedInvoiceSubscription = subscriptions.find(
    (subscription) => subscription._id === invoiceSubscriptionId
  );
  const selectedPaymentInvoice = invoices.find(
    (invoice) => invoice._id === paymentInvoiceId
  );
  const pendingInvoices = invoices.filter((invoice) =>
    ['open', 'overdue'].includes(invoice.status)
  );

  function handleInvoiceSubscription(subscriptionId) {
    setInvoiceSubscriptionId(subscriptionId);
    const subscription = subscriptions.find((item) => item._id === subscriptionId);
    const plan = subscription?.platformPlanId;
    setInvoiceCurrency(plan?.currency || 'USD');
    setInvoiceAmount(plan?.price === undefined ? '' : String(plan.price));
    setInvoiceDescription(plan ? `Suscripcion ${plan.name} - ${plan.billingCycle}` : '');
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
      setInvoiceOpen(false);
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
      setPaymentOpen(false);
    }
  }

  return (
    <>
      <div className="grid gap-6 2xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Facturas plataforma a distribuidor"
            description="Facturacion manual preparada para proveedor futuro."
            action={
              <Button onClick={() => setInvoiceOpen(true)} disabled={Boolean(busy)}>
                <Plus className="h-4 w-4" />
                Crear factura
              </Button>
            }
          />
          <Table
            data={invoices.map((invoice) => ({
              ...invoice,
              id: invoice._id,
              distributorLabel:
                distributorNames.get(String(invoice.customerId)) ||
                String(invoice.customerId),
              totalLabel: formatMoney(invoice.total, invoice.currency),
              balanceLabel: formatMoney(invoice.balanceDue ?? invoice.total, invoice.currency),
              dueLabel: dateLabel(invoice.dueDate)
            }))}
            emptyText="No hay facturas"
            columns={[
              { key: 'number', header: 'Numero', nowrap: true },
              { key: 'distributorLabel', header: 'Distribuidor', truncate: true, width: '12rem' },
              { key: 'totalLabel', header: 'Total', nowrap: true, align: 'right' },
              { key: 'balanceLabel', header: 'Pendiente', nowrap: true, align: 'right', hideBelow: 'sm' },
              { key: 'dueLabel', header: 'Vence', nowrap: true, hideBelow: 'lg' },
              {
                key: 'status',
                header: 'Estado',
                nowrap: true,
                render: (row) => <Badge tone={row.status}>{row.status}</Badge>
              }
            ]}
          />
        </Card>

        <Card>
          <CardHeader
            title="Pagos recientes"
            description="Registros manuales, sin pasarela real."
            action={
              <Button
                onClick={() => setPaymentOpen(true)}
                disabled={Boolean(busy) || !pendingInvoices.length}
              >
                <Plus className="h-4 w-4" />
                Registrar pago
              </Button>
            }
          />
          <Table
            data={payments.map((payment) => ({
              ...payment,
              id: payment._id,
              invoiceLabel: payment.invoiceId?.number || '-',
              payerLabel:
                distributorNames.get(String(payment.payerId)) || String(payment.payerId),
              amountLabel: formatMoney(payment.amount, payment.currency),
              paidLabel: dateLabel(payment.paidAt)
            }))}
            emptyText="No hay pagos"
            columns={[
              { key: 'invoiceLabel', header: 'Factura', nowrap: true },
              { key: 'payerLabel', header: 'Distribuidor', truncate: true, width: '12rem' },
              { key: 'amountLabel', header: 'Monto', nowrap: true, align: 'right' },
              { key: 'method', header: 'Metodo', nowrap: true, hideBelow: 'md' },
              {
                key: 'status',
                header: 'Estado',
                nowrap: true,
                render: (row) => <Badge tone={row.status}>{row.status}</Badge>
              },
              { key: 'paidLabel', header: 'Fecha', nowrap: true, hideBelow: 'lg' }
            ]}
          />
        </Card>
      </div>

      <Drawer
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        title="Crear factura manual"
        description="Subtotal y total se calculan en servidor."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInvoiceOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="superadmin-invoice-form"
              disabled={Boolean(busy) || !selectedInvoiceSubscription}
            >
              {busy === 'invoice-create' ? 'Creando...' : 'Crear factura'}
            </Button>
          </>
        }
      >
        <form id="superadmin-invoice-form" onSubmit={handleCreateInvoice}>
          <FormGrid columns={1}>
            <FormField label="Suscripcion activa" htmlFor="invoice-subscription" required>
              <select
                id="invoice-subscription"
                required
                name="subscriptionId"
                value={invoiceSubscriptionId}
                onChange={(event) => handleInvoiceSubscription(event.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Selecciona una suscripcion
                </option>
                {subscriptions
                  .filter((item) => item.status === 'active')
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.distributorId?.name} - {item.platformPlanId?.name}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField label="Distribuidor vinculado" htmlFor="invoice-distributor">
              <input
                id="invoice-distributor"
                value={selectedInvoiceSubscription?.distributorId?.name || ''}
                readOnly
                className={inputClass}
              />
            </FormField>
            <FormField label="Concepto" htmlFor="invoice-description" required>
              <input
                id="invoice-description"
                required
                name="description"
                value={invoiceDescription}
                onChange={(event) => setInvoiceDescription(event.target.value)}
                className={inputClass}
                placeholder="Suscripcion mensual"
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Monto" htmlFor="invoice-amount" required>
                <input
                  id="invoice-amount"
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  name="amount"
                  value={invoiceAmount}
                  onChange={(event) => setInvoiceAmount(event.target.value)}
                  className={inputClass}
                  placeholder="0.00"
                />
              </FormField>
              <FormField label="Impuesto" htmlFor="invoice-tax">
                <input
                  id="invoice-tax"
                  min="0"
                  step="0.01"
                  type="number"
                  name="tax"
                  className={inputClass}
                  placeholder="0.00"
                  defaultValue="0"
                />
              </FormField>
            </div>
            <FormField
              label="Moneda"
              htmlFor="invoice-currency"
              hint="La moneda proviene del plan seleccionado."
            >
              <input
                id="invoice-currency"
                name="currency"
                className={inputClass}
                value={invoiceCurrency}
                readOnly
              />
            </FormField>
            <FormField label="Fecha de vencimiento" htmlFor="invoice-due-date" required>
              <input
                id="invoice-due-date"
                required
                type="date"
                name="dueDate"
                value={invoiceDueDate}
                onChange={(event) => setInvoiceDueDate(event.target.value)}
                className={inputClass}
              />
            </FormField>
          </FormGrid>
        </form>
      </Drawer>

      <Drawer
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title="Registrar pago manual"
        description="Marca la factura pagada al cubrir su total."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPaymentOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="superadmin-payment-form"
              disabled={Boolean(busy) || !selectedPaymentInvoice}
            >
              {busy === 'payment-create' ? 'Registrando...' : 'Registrar pago'}
            </Button>
          </>
        }
      >
        <form id="superadmin-payment-form" onSubmit={handleCreatePayment}>
          <FormGrid columns={1}>
            <FormField label="Factura pendiente" htmlFor="payment-invoice" required>
              <select
                id="payment-invoice"
                required
                name="invoiceId"
                value={paymentInvoiceId}
                onChange={(event) => handlePaymentInvoice(event.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Selecciona una factura
                </option>
                {pendingInvoices.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.number} - {formatMoney(item.balanceDue ?? item.total, item.currency)}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Monto recibido" htmlFor="payment-amount" required>
                <input
                  id="payment-amount"
                  required
                  min="0.01"
                  max={selectedPaymentInvoice?.balanceDue ?? selectedPaymentInvoice?.total}
                  step="0.01"
                  type="number"
                  name="amount"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  className={inputClass}
                  placeholder="0.00"
                />
              </FormField>
              <FormField label="Moneda" htmlFor="payment-currency">
                <input
                  id="payment-currency"
                  name="currency"
                  className={inputClass}
                  value={paymentCurrency}
                  readOnly
                />
              </FormField>
            </div>
            <FormField label="Metodo" htmlFor="payment-method">
              <select id="payment-method" name="method" className={inputClass}>
                <option value="transfer">Transferencia</option>
                <option value="cash">Efectivo</option>
                <option value="manual">Manual</option>
              </select>
            </FormField>
            <FormField label="Descripcion" htmlFor="payment-description">
              <input
                id="payment-description"
                name="description"
                value={paymentDescription}
                onChange={(event) => setPaymentDescription(event.target.value)}
                className={inputClass}
                placeholder="Referencia o comprobante"
              />
            </FormField>
            <FormField label="Fecha de pago" htmlFor="payment-date" required>
              <input
                id="payment-date"
                required
                type="date"
                name="paidAt"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormGridFull>
              <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Distribuidor:{' '}
                {distributorNames.get(String(selectedPaymentInvoice?.customerId)) || '-'}
                {' | '}Suscripcion: {selectedPaymentInvoice?.subscriptionId || '-'}
              </div>
            </FormGridFull>
          </FormGrid>
        </form>
      </Drawer>
    </>
  );
}
