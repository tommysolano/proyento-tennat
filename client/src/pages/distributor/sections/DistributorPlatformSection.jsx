import { Badge } from '../../../components/Badge.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { EmptyState } from '../../../components/EmptyState.jsx';
import { formatMoney } from '../../../utils/billing.js';

export function DistributorPlatformSection({ workspace }) {
  const {
    platformSubscription,
    platformInvoices = [],
    platformPayments = [],
    platformUsage = { current: {}, records: [] }
  } = workspace;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Mi plan de plataforma"
          description="Suscripcion del distribuidor con la plataforma."
        />
        <div className="space-y-4 p-5">
          {platformSubscription ? (
            <>
              <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-4">
                <div>
                  <p className="text-sm text-slate-500">Plan</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">
                    {platformSubscription.platformPlanId?.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatMoney(
                      platformSubscription.platformPlanId?.price,
                      platformSubscription.platformPlanId?.currency
                    )}{' '}
                    / {platformSubscription.platformPlanId?.billingCycle}
                  </p>
                </div>
                <Badge tone={platformSubscription.status}>{platformSubscription.status}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {['companies', 'users', 'contacts'].map((metric) => (
                  <div key={metric} className="rounded-lg bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">{metric}</p>
                    <p className="mt-1 text-xl font-semibold text-slate-950">
                      {platformUsage.current?.[metric] ?? 0}
                      <span className="text-sm font-normal text-slate-400">
                        {' '}
                        / {platformSubscription.platformPlanId?.limits?.[metric] ?? '-'}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-500">
                Modulos incluidos:{' '}
                {platformSubscription.platformPlanId?.includedModules?.join(', ') ||
                  'Sin modulos'}
              </p>
            </>
          ) : (
            <EmptyState
              title="Sin suscripcion de plataforma"
              description="No hay una suscripcion de plataforma visible para este distribuidor."
            />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Facturas y pagos de plataforma"
          description="Solo datos del distribuidor autenticado."
        />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <div>
            <p className="mb-3 text-sm font-semibold text-slate-950">Facturas</p>
            <div className="space-y-2">
              {platformInvoices.length ? (
                platformInvoices.slice(0, 5).map((invoice) => (
                  <div key={invoice._id} className="rounded-md border border-slate-200 p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="font-semibold">{invoice.number}</span>
                      <Badge tone={invoice.status}>{invoice.status}</Badge>
                    </div>
                    <p className="mt-2 text-slate-500">
                      {formatMoney(invoice.total, invoice.currency)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Sin facturas.</p>
              )}
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-slate-950">Pagos</p>
            <div className="space-y-2">
              {platformPayments.length ? (
                platformPayments.slice(0, 5).map((payment) => (
                  <div key={payment._id} className="rounded-md border border-slate-200 p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="font-semibold">
                        {payment.invoiceId?.number || 'Pago manual'}
                      </span>
                      <Badge tone={payment.status}>{payment.status}</Badge>
                    </div>
                    <p className="mt-2 text-slate-500">
                      {formatMoney(payment.amount, payment.currency)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Sin pagos.</p>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
