import { Activity, Building2, CreditCard, UsersRound } from 'lucide-react';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { MetricCard } from '../../../components/MetricCard.jsx';
import { Table } from '../../../components/Table.jsx';
import { formatDate } from '../../../utils/contacts.js';

export function DistributorOverviewSection({
  companies = [],
  plans = [],
  subscriptions = [],
  users = [],
  activities = []
}) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Empresas totales"
          value={companies.length}
          helper={`${companies.filter((company) => company.status === 'active').length} activas`}
          icon={Building2}
          tone="emerald"
        />
        <MetricCard
          label="Planes activos"
          value={plans.filter((plan) => plan.status === 'active').length}
          helper={`${plans.length} planes totales`}
          icon={CreditCard}
          tone="cyan"
        />
        <MetricCard
          label="Suscripciones activas"
          value={subscriptions.filter((item) => item.status === 'active').length}
          helper={`${subscriptions.filter((item) => item.status === 'trial').length} en prueba`}
          icon={Activity}
          tone="rose"
        />
        <MetricCard
          label="Admins creados"
          value={users.filter((user) => user.role === 'ADMIN').length}
          helper="Empresas con responsable"
          icon={UsersRound}
          tone="amber"
        />
      </div>

      <Card>
        <CardHeader
          title="Actividad del distribuidor"
          description="Altas e impersonaciones registradas por la API."
        />
        <Table
          data={activities.map((item) => ({
            ...item,
            id: item._id,
            dateLabel: formatDate(item.createdAt),
            companyLabel: item.companyId?.name || '-',
            userLabel: item.userId?.name || 'Usuario'
          }))}
          emptyText="No hay actividad registrada"
          columns={[
            { key: 'dateLabel', header: 'Fecha', nowrap: true },
            { key: 'companyLabel', header: 'Empresa', truncate: true, width: '12rem' },
            { key: 'userLabel', header: 'Usuario', truncate: true, width: '12rem', hideBelow: 'md' },
            { key: 'type', header: 'Tipo', nowrap: true, hideBelow: 'sm' },
            { key: 'summary', header: 'Resumen' }
          ]}
        />
      </Card>
    </>
  );
}
