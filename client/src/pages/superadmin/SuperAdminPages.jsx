import { Building2, CreditCard, DollarSign, FileWarning } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { Table } from '../../components/Table.jsx';
import { formatMoney } from '../../utils/billing.js';
import { SuperAdminShell } from './SuperAdminShell.jsx';
import { useSuperAdminWorkspace } from './useSuperAdminWorkspace.js';
import { SuperAdminBillingSection } from './sections/SuperAdminBillingSection.jsx';
import { SuperAdminDistributorsSection } from './sections/SuperAdminDistributorsSection.jsx';
import { SuperAdminModulesSection } from './sections/SuperAdminModulesSection.jsx';
import { SuperAdminPlansSection } from './sections/SuperAdminPlansSection.jsx';
import { SuperAdminSubscriptionsSection } from './sections/SuperAdminSubscriptionsSection.jsx';

function dateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function SuperAdminOverviewPage() {
  const workspace = useSuperAdminWorkspace(['overview']);
  const { overview } = workspace;

  return (
    <SuperAdminShell
      title="Panel del programador"
      description="Estado global de distribuidores, ingresos y cartera de la plataforma."
      workspace={workspace}
      loadingVariant="page"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Distribuidores"
          value={overview?.distributorsTotal ?? 0}
          helper={`${overview?.distributorsActive ?? 0} activos`}
          icon={Building2}
          tone="cyan"
        />
        <MetricCard
          label="Suspendidos"
          value={overview?.distributorsSuspended ?? 0}
          helper="Acceso bloqueado en backend"
          icon={FileWarning}
          tone="rose"
        />
        <MetricCard
          label="Ingreso mensual"
          value={formatMoney(overview?.expectedMonthlyRevenue)}
          helper={`${overview?.activeSubscriptions ?? 0} suscripciones activas/trial`}
          icon={DollarSign}
          tone="emerald"
        />
        <MetricCard
          label="Facturas pendientes"
          value={overview?.pendingInvoices ?? 0}
          helper={`${overview?.registeredModules ?? 0} modulos registrados`}
          icon={CreditCard}
          tone="amber"
        />
      </div>
    </SuperAdminShell>
  );
}

export function SuperAdminDistributorsPage() {
  const workspace = useSuperAdminWorkspace(['distributors']);

  return (
    <SuperAdminShell
      title="Distribuidores"
      description="Alta, estado y acceso delegado de cada tenant de la plataforma."
      width="full"
      workspace={workspace}
      loadingVariant="table"
    >
      <SuperAdminDistributorsSection workspace={workspace} />
    </SuperAdminShell>
  );
}

export function SuperAdminPlansPage() {
  const workspace = useSuperAdminWorkspace(['plans']);

  return (
    <SuperAdminShell
      title="Planes de plataforma"
      description="Planes internos que la plataforma vende a distribuidores."
      width="full"
      workspace={workspace}
      loadingVariant="table"
    >
      <SuperAdminPlansSection workspace={workspace} />
    </SuperAdminShell>
  );
}

export function SuperAdminSubscriptionsPage() {
  const workspace = useSuperAdminWorkspace(['subscriptions', 'distributors', 'plans']);

  return (
    <SuperAdminShell
      title="Suscripciones de plataforma"
      description="Plan vigente y periodo de cada distribuidor."
      workspace={workspace}
      loadingVariant="table"
    >
      <SuperAdminSubscriptionsSection workspace={workspace} />
    </SuperAdminShell>
  );
}

export function SuperAdminBillingPage() {
  const workspace = useSuperAdminWorkspace([
    'invoices',
    'payments',
    'subscriptions',
    'distributors'
  ]);

  return (
    <SuperAdminShell
      title="Facturacion de plataforma"
      description="Facturas y pagos manuales entre la plataforma y sus distribuidores."
      width="full"
      workspace={workspace}
      loadingVariant="table"
    >
      <SuperAdminBillingSection workspace={workspace} />
    </SuperAdminShell>
  );
}

export function SuperAdminModulesPage() {
  const workspace = useSuperAdminWorkspace(['modules', 'distributors', 'plans']);

  return (
    <SuperAdminShell
      title="Modulos"
      description="Catalogo central y overrides por distribuidor o plan."
      width="full"
      workspace={workspace}
      loadingVariant="table"
    >
      <SuperAdminModulesSection workspace={workspace} />
    </SuperAdminShell>
  );
}

export function SuperAdminAuditPage() {
  const workspace = useSuperAdminWorkspace(['audit']);

  return (
    <SuperAdminShell
      title="Auditoria"
      description="Acciones sensibles de plataforma e impersonacion."
      width="full"
      workspace={workspace}
      loadingVariant="table"
    >
      <Card>
        <CardHeader
          title="Eventos registrados"
          description="Trazabilidad de operaciones de plataforma."
        />
        <Table
          data={(workspace.audit || []).map((item) => ({
            ...item,
            id: item._id,
            dateLabel: dateLabel(item.createdAt),
            actorLabel: `${item.userId?.name || 'Sistema'} (${item.userId?.role || '-'})`,
            distributorLabel: item.distributorId?.name || '-'
          }))}
          emptyText="No hay eventos de auditoria"
          columns={[
            { key: 'dateLabel', header: 'Fecha', nowrap: true },
            { key: 'actorLabel', header: 'Actor', truncate: true, width: '14rem' },
            { key: 'distributorLabel', header: 'Distribuidor', truncate: true, width: '12rem', hideBelow: 'md' },
            { key: 'type', header: 'Tipo', nowrap: true, hideBelow: 'sm' },
            { key: 'summary', header: 'Resumen' }
          ]}
        />
      </Card>
    </SuperAdminShell>
  );
}
