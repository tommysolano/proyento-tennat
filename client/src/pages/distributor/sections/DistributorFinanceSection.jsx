import { Building2, DollarSign, FileText, ShieldAlert } from 'lucide-react';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { MetricCard } from '../../../components/MetricCard.jsx';
import { Table } from '../../../components/Table.jsx';
import { formatMoney } from '../../../utils/billing.js';

function dateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(new Date(value));
}

export function DistributorFinanceSection({ workspace }) {
  const { billingOverview, commerceCompanies = [], settings } = workspace;
  const currency = settings?.billingSettings?.currency;
  const companyNames = new Map(
    commerceCompanies.map((company) => [company._id, company.name])
  );

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Ingreso mensual esperado"
          value={formatMoney(billingOverview?.expectedMonthlyRevenue, currency)}
          helper={`${billingOverview?.activeSubscriptions || 0} suscripciones activas`}
          icon={DollarSign}
          tone="emerald"
        />
        <MetricCard
          label="Empresas activas"
          value={billingOverview?.activeCompanies || 0}
          helper={`${billingOverview?.suspendedCompanies || 0} suspendidas`}
          icon={Building2}
          tone="cyan"
        />
        <MetricCard
          label="Facturas pendientes"
          value={billingOverview?.pendingInvoices || 0}
          helper={`${billingOverview?.paidInvoices || 0} pagadas`}
          icon={FileText}
          tone="amber"
        />
        <MetricCard
          label="Suscripciones vencidas"
          value={billingOverview?.pastDueSubscriptions || 0}
          helper="Estado past_due"
          icon={ShieldAlert}
          tone="rose"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Planes mas usados"
            description="Suscripciones vigentes por plan comercial."
          />
          <Table
            data={(billingOverview?.popularPlans || []).map((item) => ({
              ...item,
              id: item.planId
            }))}
            emptyText="No hay suscripciones para calcular popularidad"
            columns={[
              { key: 'name', header: 'Plan', truncate: true },
              { key: 'subscriptions', header: 'Suscripciones', nowrap: true, align: 'right' }
            ]}
          />
        </Card>
        <Card>
          <CardHeader
            title="Pagos recientes"
            description="Ultimos pagos recibidos de empresas."
          />
          <Table
            data={(billingOverview?.recentPayments || []).map((payment) => ({
              ...payment,
              id: payment._id,
              companyLabel: companyNames.get(String(payment.payerId)) || '-',
              amountLabel: formatMoney(payment.amount, payment.currency),
              dateLabel: dateLabel(payment.paidAt || payment.createdAt)
            }))}
            emptyText="No hay pagos recibidos"
            columns={[
              { key: 'companyLabel', header: 'Empresa', truncate: true },
              { key: 'amountLabel', header: 'Monto', nowrap: true, align: 'right' },
              { key: 'method', header: 'Metodo', nowrap: true, hideBelow: 'sm' },
              { key: 'dateLabel', header: 'Fecha', nowrap: true }
            ]}
          />
        </Card>
      </div>
    </>
  );
}
