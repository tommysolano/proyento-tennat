export const BILLING_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'MXN',
  'COP',
  'PEN',
  'BRL',
  'ARS',
  'CLP'
];

export function formatMoney(value, currency = 'USD') {
  const safeCurrency = /^[A-Z]{3}$/.test(currency || '') ? currency : 'USD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrency,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

export function localDateInput(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function localDateTimeInput(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function addDaysInput(days, date = new Date()) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return localDateInput(result);
}

export function addDaysDateTimeInput(days, date = new Date()) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return localDateTimeInput(result);
}

export function subscriptionPayload(values) {
  const startsAt = values.startsAt ? new Date(values.startsAt).toISOString() : new Date().toISOString();
  const payload = {
    planId: values.planId,
    status: values.status,
    startsAt
  };
  if (values.companyId) payload.companyId = values.companyId;
  if (values.status === 'trial') {
    if (!values.trialEndsAt) throw new Error('La fecha de fin de trial es requerida');
    payload.trialEndsAt = new Date(values.trialEndsAt).toISOString();
  }
  if (values.endsAt) payload.endsAt = new Date(values.endsAt).toISOString();
  if (values.currentPeriodEnd) {
    payload.currentPeriodEnd = new Date(values.currentPeriodEnd).toISOString();
  }
  return payload;
}

export function paymentDefaults(invoice, companyName = '') {
  if (!invoice) {
    return {
      amount: '',
      currency: 'USD',
      description: '',
      paidAt: localDateInput()
    };
  }
  const balanceDue = Number(invoice.balanceDue ?? invoice.total ?? 0);
  return {
    amount: balanceDue > 0 ? String(balanceDue) : '',
    currency: invoice.currency || 'USD',
    description: `Pago factura ${invoice.number}${companyName ? ` - ${companyName}` : ''}`,
    paidAt: localDateInput()
  };
}
