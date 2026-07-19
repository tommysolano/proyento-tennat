import {
  Boxes,
  Building2,
  CreditCard,
  FileText,
  Gauge,
  ListChecks,
  Palette,
  ReceiptText,
  RefreshCcw,
  Settings,
  UsersRound
} from 'lucide-react';
import { LoadingState } from '../../components/AsyncState.jsx';
import { Button } from '../../components/Button.jsx';
import { FeedbackBanners } from '../../components/FeedbackBanners.jsx';
import { PageShell } from '../../components/PageShell.jsx';

export const DISTRIBUTOR_TABS = [
  { label: 'Resumen', to: '/distributor/dashboard', icon: Gauge },
  { label: 'Empresas', to: '/distributor/companies', icon: Building2 },
  { label: 'Administradores', to: '/distributor/admins', icon: UsersRound },
  { label: 'Planes', to: '/distributor/plans', icon: CreditCard },
  { label: 'Suscripciones', to: '/distributor/subscriptions', icon: ReceiptText },
  { label: 'Modulos', to: '/distributor/modules', icon: Boxes },
  { label: 'Mi plataforma', to: '/distributor/platform', icon: CreditCard }
];

export const DISTRIBUTOR_FINANCE_TABS = [
  { label: 'Resumen financiero', to: '/distributor/finance', icon: Gauge },
  { label: 'Facturas', to: '/distributor/invoices', icon: FileText },
  { label: 'Pagos', to: '/distributor/payments', icon: ReceiptText }
];

export const DISTRIBUTOR_SETTINGS_TABS = [
  { label: 'Preferencias', to: '/distributor/settings', icon: Settings },
  { label: 'Marca', to: '/distributor/branding', icon: Palette },
  { label: 'Onboarding', to: '/distributor/onboarding', icon: ListChecks }
];

/**
 * Marco comun de las subrutas del distribuidor: cabecera, pestanas de
 * navegacion real, banners de feedback y estado de carga.
 */
export function DistributorShell({
  title,
  description,
  eyebrow = 'Operacion del distribuidor',
  tabs = DISTRIBUTOR_TABS,
  width,
  actions,
  workspace,
  loadingVariant = 'page',
  children
}) {
  return (
    <PageShell
      eyebrow={eyebrow}
      title={title}
      description={description}
      tabs={tabs}
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
      <FeedbackBanners
        notice={workspace.notice}
        error={workspace.error}
        softError={workspace.softError}
      />
      {workspace.loading ? <LoadingState variant={loadingVariant} /> : children}
    </PageShell>
  );
}
