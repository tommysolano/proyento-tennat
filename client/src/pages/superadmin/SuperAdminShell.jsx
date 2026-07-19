import {
  Activity,
  Boxes,
  Building2,
  CreditCard,
  FileText,
  Gauge,
  ReceiptText,
  RefreshCcw
} from 'lucide-react';
import { LoadingState } from '../../components/AsyncState.jsx';
import { Button } from '../../components/Button.jsx';
import { FeedbackBanners } from '../../components/FeedbackBanners.jsx';
import { PageShell } from '../../components/PageShell.jsx';

export const SUPERADMIN_TABS = [
  { label: 'Resumen', to: '/superadmin', icon: Gauge },
  { label: 'Distribuidores', to: '/superadmin/distributors', icon: Building2 },
  { label: 'Planes', to: '/superadmin/platform-plans', icon: CreditCard },
  { label: 'Suscripciones', to: '/superadmin/subscriptions', icon: ReceiptText },
  { label: 'Facturacion', to: '/superadmin/billing', icon: FileText },
  { label: 'Modulos', to: '/superadmin/modules', icon: Boxes },
  { label: 'Auditoria', to: '/superadmin/audit', icon: Activity }
];

export function SuperAdminShell({
  title,
  description,
  width,
  actions,
  workspace,
  loadingVariant = 'page',
  children
}) {
  return (
    <PageShell
      eyebrow="Control de plataforma"
      title={title}
      description={description}
      tabs={SUPERADMIN_TABS}
      width={width}
      actions={
        <>
          {actions}
          <Button
            variant="secondary"
            onClick={() => workspace.reload()}
            disabled={Boolean(workspace.busy)}
          >
            <RefreshCcw className="h-4 w-4" />
            Refrescar
          </Button>
        </>
      }
    >
      <FeedbackBanners notice={workspace.notice} error={workspace.error} />
      {workspace.loading ? <LoadingState variant={loadingVariant} /> : children}
    </PageShell>
  );
}
