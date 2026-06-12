const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const SUPPORTED_CURRENCIES =
  typeof Intl.supportedValuesOf === 'function'
    ? new Set(Intl.supportedValuesOf('currency'))
    : null;
const SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'cancelled', 'suspended'];
const PAYABLE_INVOICE_STATUSES = ['open', 'overdue'];

function billingError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function hasOwn(object, field) {
  return Object.prototype.hasOwnProperty.call(object, field);
}

function parseDate(value, field, { nullable = false } = {}) {
  if ((value === null || value === '') && nullable) return null;
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw billingError(`${field} debe ser una fecha valida`);
  }
  return date;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function normalizeCurrency(value, fallback = 'USD') {
  const currency = String(value || fallback || '').trim().toUpperCase();
  if (
    !CURRENCY_PATTERN.test(currency) ||
    (SUPPORTED_CURRENCIES && !SUPPORTED_CURRENCIES.has(currency))
  ) {
    throw billingError('currency debe ser un codigo ISO 4217 valido');
  }
  return currency;
}

export function addBillingCycle(date, billingCycle) {
  const result = new Date(date);
  if (Number.isNaN(result.getTime())) {
    throw billingError('La fecha base del periodo es invalida');
  }
  if (billingCycle === 'monthly') {
    result.setUTCMonth(result.getUTCMonth() + 1);
  } else if (billingCycle === 'yearly') {
    result.setUTCFullYear(result.getUTCFullYear() + 1);
  } else {
    throw billingError('billingCycle invalido');
  }
  return result;
}

export function assertActivePlan(plan) {
  if (!plan) throw billingError('Plan no encontrado', 404);
  if (plan.status !== 'active') {
    throw billingError('Solo se pueden asignar planes activos');
  }
  normalizeCurrency(plan.currency);
  if (!['monthly', 'yearly'].includes(plan.billingCycle)) {
    throw billingError('El plan no tiene un ciclo de cobro valido');
  }
  return plan;
}

export function buildSubscriptionTerms(
  body,
  plan,
  { current = null, defaultStatus = 'active', now = new Date() } = {}
) {
  if (!plan) throw billingError('Plan no encontrado', 404);
  normalizeCurrency(plan.currency);
  if (!['monthly', 'yearly'].includes(plan.billingCycle)) {
    throw billingError('El plan no tiene un ciclo de cobro valido');
  }
  const status = body.status || current?.status || defaultStatus;
  if (!SUBSCRIPTION_STATUSES.includes(status)) {
    throw billingError('status de suscripcion invalido');
  }

  const startsAt = hasOwn(body, 'startsAt')
    ? parseDate(body.startsAt, 'startsAt')
    : current?.startsAt || new Date(now);
  const endsAt = hasOwn(body, 'endsAt')
    ? parseDate(body.endsAt, 'endsAt', { nullable: true })
    : current?.endsAt || null;
  let trialEndsAt = hasOwn(body, 'trialEndsAt')
    ? parseDate(body.trialEndsAt, 'trialEndsAt', { nullable: true })
    : current?.trialEndsAt || null;
  const activatingTrial = current?.status === 'trial' && status === 'active';

  let currentPeriodStart = hasOwn(body, 'currentPeriodStart')
    ? parseDate(body.currentPeriodStart, 'currentPeriodStart')
    : current?.currentPeriodStart || startsAt;
  let currentPeriodEnd = hasOwn(body, 'currentPeriodEnd')
    ? parseDate(body.currentPeriodEnd, 'currentPeriodEnd', { nullable: true })
    : current?.currentPeriodEnd || null;

  if (status === 'trial') {
    if (!trialEndsAt) {
      throw billingError('trialEndsAt es requerido para una suscripcion trial');
    }
    if (trialEndsAt <= startsAt) {
      throw billingError('trialEndsAt debe ser posterior a startsAt');
    }
    currentPeriodStart = startsAt;
    currentPeriodEnd = trialEndsAt;
  } else if (status === 'active') {
    if (activatingTrial) {
      currentPeriodStart = hasOwn(body, 'currentPeriodStart')
        ? currentPeriodStart
        : new Date(now);
      currentPeriodEnd = hasOwn(body, 'currentPeriodEnd')
        ? currentPeriodEnd
        : addBillingCycle(currentPeriodStart, plan.billingCycle);
    } else {
      currentPeriodEnd =
        currentPeriodEnd || addBillingCycle(currentPeriodStart, plan.billingCycle);
    }
  }

  if (endsAt && endsAt <= startsAt) {
    throw billingError('endsAt debe ser posterior a startsAt');
  }
  if (currentPeriodEnd && currentPeriodEnd <= currentPeriodStart) {
    throw billingError('currentPeriodEnd debe ser posterior a currentPeriodStart');
  }

  return {
    status,
    startsAt,
    endsAt,
    trialEndsAt,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: hasOwn(body, 'cancelAtPeriodEnd')
      ? Boolean(body.cancelAtPeriodEnd)
      : Boolean(current?.cancelAtPeriodEnd),
    paymentProvider:
      typeof body.paymentProvider === 'string'
        ? body.paymentProvider.trim()
        : current?.paymentProvider || 'manual',
    providerCustomerId:
      typeof body.providerCustomerId === 'string'
        ? body.providerCustomerId.trim()
        : current?.providerCustomerId || '',
    providerSubscriptionId:
      typeof body.providerSubscriptionId === 'string'
        ? body.providerSubscriptionId.trim()
        : current?.providerSubscriptionId || '',
    metadata: hasOwn(body, 'metadata') ? body.metadata || {} : current?.metadata || {}
  };
}

export function assertBillableSubscription(subscription) {
  if (!subscription) throw billingError('Suscripcion no encontrada', 404);
  if (subscription.status !== 'active') {
    throw billingError('Solo una suscripcion activa puede generar facturas');
  }
  return subscription;
}

export function invoiceBalance(invoice, paidAmount = 0) {
  const paid = roundMoney(paidAmount);
  return {
    paidAmount: paid,
    balanceDue: Math.max(roundMoney(invoice.total) - paid, 0)
  };
}

export function assertPayableInvoice(invoice, paidAmount = 0) {
  if (!invoice) throw billingError('Factura no encontrada', 404);
  if (!PAYABLE_INVOICE_STATUSES.includes(invoice.status)) {
    throw billingError('La factura no esta disponible para registrar pagos');
  }
  const balance = invoiceBalance(invoice, paidAmount);
  if (balance.balanceDue <= 0) {
    throw billingError('La factura no tiene saldo pendiente');
  }
  return balance;
}

export function validatePaymentInput({ invoice, paidAmount = 0, amount, currency }) {
  const balance = assertPayableInvoice(invoice, paidAmount);
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw billingError('amount debe ser numerico y mayor a 0');
  }
  const normalizedAmount = roundMoney(parsedAmount);
  if (normalizedAmount > balance.balanceDue) {
    throw billingError('El pago no puede exceder el saldo pendiente');
  }
  const normalizedCurrency = normalizeCurrency(currency, invoice.currency);
  if (normalizedCurrency !== normalizeCurrency(invoice.currency)) {
    throw billingError('La moneda del pago debe coincidir con la moneda de la factura');
  }
  return {
    amount: normalizedAmount,
    currency: normalizedCurrency,
    ...balance
  };
}
