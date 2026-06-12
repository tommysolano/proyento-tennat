import { BILLING_CURRENCIES, formatMoney } from '../utils/billing.js';

const limitLabels = {
  companies: 'Empresas',
  users: 'Usuarios',
  contacts: 'Contactos',
  messages: 'Mensajes',
  whatsappMessages: 'Mensajes WhatsApp',
  mediaStorageMb: 'Media MB',
  mediaFiles: 'Archivos media',
  formSubmissionsPerMonth: 'Submissions/mes',
  reviews: 'Reviews'
};

export function CurrencySelect({ className = '', ...props }) {
  return (
    <select className={className} {...props}>
      {BILLING_CURRENCIES.map((currency) => (
        <option key={currency} value={currency}>
          {currency}
        </option>
      ))}
    </select>
  );
}

export function BillingPlanSummary({ plan, trial = false }) {
  if (!plan) {
    return (
      <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
        Selecciona un plan para revisar precio, moneda, ciclo y limites.
      </p>
    );
  }

  const visibleLimits = Object.entries(plan.limits || {}).filter(
    ([key, value]) => limitLabels[key] && Number.isFinite(Number(value))
  );
  const features = plan.features?.length ? plan.features : plan.includedModules || [];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-950">{plan.name}</p>
          <p className="mt-1 text-slate-500">
            {plan.description || 'Sin descripcion configurada.'}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-slate-950">
            {formatMoney(plan.price, plan.currency)}
          </p>
          <p className="text-xs text-slate-500">
            {plan.billingCycle === 'yearly' ? 'Ciclo anual' : 'Ciclo mensual'}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-600">
        Estado inicial sugerido: {trial ? 'trial (sin facturacion)' : 'active'}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Incluye: {features.length ? features.join(', ') : 'sin caracteristicas configuradas'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {visibleLimits.map(([key, value]) => (
          <span key={key} className="rounded bg-white px-2 py-1 text-xs text-slate-600">
            {limitLabels[key]}: {value}
          </span>
        ))}
      </div>
    </div>
  );
}

