import {
  DISTRIBUTOR_FINANCE_TABS,
  DISTRIBUTOR_SETTINGS_TABS,
  DISTRIBUTOR_TABS,
  DistributorShell
} from './DistributorShell.jsx';
import { useDistributorWorkspace } from './useDistributorWorkspace.js';
import { DistributorAdminsSection } from './sections/DistributorAdminsSection.jsx';
import { DistributorBrandingSection } from './sections/DistributorBrandingSection.jsx';
import { DistributorCompaniesSection } from './sections/DistributorCompaniesSection.jsx';
import { DistributorFinanceSection } from './sections/DistributorFinanceSection.jsx';
import { DistributorInvoicesSection } from './sections/DistributorInvoicesSection.jsx';
import { DistributorModulesSection } from './sections/DistributorModulesSection.jsx';
import { DistributorOnboardingSection } from './sections/DistributorOnboardingSection.jsx';
import { DistributorOverviewSection } from './sections/DistributorOverviewSection.jsx';
import { DistributorPaymentsSection } from './sections/DistributorPaymentsSection.jsx';
import { DistributorPlansSection } from './sections/DistributorPlansSection.jsx';
import { DistributorPlatformSection } from './sections/DistributorPlatformSection.jsx';
import { DistributorSettingsSection } from './sections/DistributorSettingsSection.jsx';
import { DistributorSubscriptionsSection } from './sections/DistributorSubscriptionsSection.jsx';

export function DistributorDashboardPage() {
  const workspace = useDistributorWorkspace([
    'companies',
    'plans',
    'users',
    'subscriptions',
    'activities'
  ]);

  return (
    <DistributorShell
      title="Resumen del distribuidor"
      description="Estado general de empresas, planes, suscripciones y actividad reciente."
      workspace={workspace}
    >
      <DistributorOverviewSection
        companies={workspace.companies}
        plans={workspace.plans}
        subscriptions={workspace.subscriptions}
        users={workspace.users}
        activities={workspace.activities}
      />
    </DistributorShell>
  );
}

export function DistributorCompaniesPage() {
  const workspace = useDistributorWorkspace(['commerceCompanies', 'settings']);

  return (
    <DistributorShell
      title="Empresas y clientes"
      description="Empresas de tu cartera con plan, deuda y acceso delegado."
      width="full"
      workspace={workspace}
      loadingVariant="table"
    >
      <DistributorCompaniesSection workspace={workspace} />
    </DistributorShell>
  );
}

export function DistributorAdminsPage() {
  const workspace = useDistributorWorkspace(['companies', 'users']);

  return (
    <DistributorShell
      title="Administradores"
      description="Responsables ADMIN de cada empresa de tu cartera."
      workspace={workspace}
      loadingVariant="table"
    >
      <DistributorAdminsSection workspace={workspace} />
    </DistributorShell>
  );
}

export function DistributorPlansPage() {
  const workspace = useDistributorWorkspace(['plans', 'modules']);

  return (
    <DistributorShell
      title="Planes comerciales"
      description="Planes que vendes a tus empresas, con limites y modulos incluidos."
      width="full"
      workspace={workspace}
      loadingVariant="table"
    >
      <DistributorPlansSection workspace={workspace} />
    </DistributorShell>
  );
}

export function DistributorSubscriptionsPage() {
  const workspace = useDistributorWorkspace([
    'companies',
    'commerceCompanies',
    'plans',
    'subscriptions'
  ]);

  return (
    <DistributorShell
      title="Suscripciones"
      description="Alta y cambio de plan de las empresas de tu cartera."
      workspace={workspace}
      loadingVariant="table"
    >
      <DistributorSubscriptionsSection workspace={workspace} />
    </DistributorShell>
  );
}

export function DistributorModulesPage() {
  const workspace = useDistributorWorkspace(['modules']);

  return (
    <DistributorShell
      title="Modulos autorizados"
      description="Modulos que SUPERADMIN habilita para incluir en tus planes."
      workspace={workspace}
    >
      <DistributorModulesSection workspace={workspace} />
    </DistributorShell>
  );
}

export function DistributorPlatformPage() {
  const workspace = useDistributorWorkspace([
    'platformSubscription',
    'platformInvoices',
    'platformPayments',
    'platformUsage'
  ]);

  return (
    <DistributorShell
      title="Mi plataforma"
      description="Tu suscripcion, consumo y facturacion con la plataforma."
      workspace={workspace}
    >
      <DistributorPlatformSection workspace={workspace} />
    </DistributorShell>
  );
}

export function DistributorFinancePage() {
  const workspace = useDistributorWorkspace([
    'billingOverview',
    'commerceCompanies',
    'settings'
  ]);

  return (
    <DistributorShell
      title="Resumen financiero"
      description="Ingresos esperados, cartera y pagos recientes."
      eyebrow="Facturacion del distribuidor"
      tabs={DISTRIBUTOR_FINANCE_TABS}
      workspace={workspace}
    >
      <DistributorFinanceSection workspace={workspace} />
    </DistributorShell>
  );
}

export function DistributorInvoicesPage() {
  const workspace = useDistributorWorkspace([
    'commerceCompanies',
    'invoices',
    'settings',
    'modules'
  ]);

  return (
    <DistributorShell
      title="Facturas"
      description="Facturas emitidas del distribuidor a sus empresas."
      eyebrow="Facturacion del distribuidor"
      tabs={DISTRIBUTOR_FINANCE_TABS}
      width="full"
      workspace={workspace}
      loadingVariant="table"
    >
      <DistributorInvoicesSection workspace={workspace} />
    </DistributorShell>
  );
}

export function DistributorPaymentsPage() {
  const workspace = useDistributorWorkspace([
    'commerceCompanies',
    'invoices',
    'payments'
  ]);

  return (
    <DistributorShell
      title="Pagos"
      description="Pagos recibidos de las empresas de tu cartera."
      eyebrow="Facturacion del distribuidor"
      tabs={DISTRIBUTOR_FINANCE_TABS}
      width="full"
      workspace={workspace}
      loadingVariant="table"
    >
      <DistributorPaymentsSection workspace={workspace} />
    </DistributorShell>
  );
}

export function DistributorSettingsPage() {
  const workspace = useDistributorWorkspace(['settings']);

  return (
    <DistributorShell
      title="Preferencias comerciales"
      description="Identidad, formato regional y ajustes de facturacion."
      eyebrow="Configuracion del distribuidor"
      tabs={DISTRIBUTOR_SETTINGS_TABS}
      width="narrow"
      workspace={workspace}
      loadingVariant="spinner"
    >
      <DistributorSettingsSection workspace={workspace} />
    </DistributorShell>
  );
}

export function DistributorBrandingPage() {
  const workspace = useDistributorWorkspace(['settings']);

  return (
    <DistributorShell
      title="White label"
      description="Marca, colores, soporte y dominio personalizado."
      eyebrow="Configuracion del distribuidor"
      tabs={DISTRIBUTOR_SETTINGS_TABS}
      workspace={workspace}
      loadingVariant="spinner"
    >
      <DistributorBrandingSection workspace={workspace} />
    </DistributorShell>
  );
}

export function DistributorOnboardingPage() {
  const workspace = useDistributorWorkspace(['onboarding']);

  return (
    <DistributorShell
      title="Onboarding"
      description="Checklist recalculado desde los datos reales del tenant."
      eyebrow="Configuracion del distribuidor"
      tabs={DISTRIBUTOR_SETTINGS_TABS}
      width="narrow"
      workspace={workspace}
      loadingVariant="spinner"
    >
      <DistributorOnboardingSection workspace={workspace} />
    </DistributorShell>
  );
}

export { DISTRIBUTOR_TABS };
