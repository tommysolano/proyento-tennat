import { ArrowLeft, Building2, ContactRound, CreditCard, LogIn, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getDistributorCompanyDetail } from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { ErrorState, LoadingState } from '../../components/AsyncState.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import {
  ImpersonateUserButton,
  ImpersonationSwitcherButton
} from '../../components/ImpersonationSwitcher.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

function money(value, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

export function CompanyDetailForDistributor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { impersonateAdmin } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entering, setEntering] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDetail(await getDistributorCompanyDetail(id));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function handleEnterCompany() {
    setEntering(true);
    setError('');
    try {
      const data = await impersonateAdmin(id);
      navigate(data.redirectPath, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setEntering(false);
    }
  }

  if (loading) {
    return <LoadingState label="Cargando detalle de la empresa..." />;
  }

  if (error || !detail) {
    return (
      <ErrorState
        title={detail ? 'No se pudo actualizar la empresa' : 'No se pudo cargar la empresa'}
        description={error || 'La empresa solicitada no esta disponible.'}
        onAction={loadDetail}
      />
    );
  }

  const { company, users, subscription, invoices, payments, contactsTotal, activeModules } = detail;

  return (
    <PageShell
      eyebrow="Detalle de empresa"
      title={company.name}
      description="Vista consolidada del tenant desde el distribuidor."
    >
      <div className="flex flex-wrap gap-3">
        <Button as={Link} to="/distributor/companies" variant="secondary" className="w-fit">
          <ArrowLeft className="h-4 w-4" /> Volver a empresas
        </Button>
        <Button
          onClick={handleEnterCompany}
          disabled={
            entering ||
            !users.some((user) => user.role === 'ADMIN' && user.status === 'active') ||
            !['active', 'trial'].includes(company.status)
          }
        >
          <LogIn className="h-4 w-4" />
          {entering ? 'Entrando...' : 'Entrar con acceso delegado'}
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Usuarios" value={users.length} helper="Usuarios del tenant" icon={UsersRound} tone="cyan" />
        <MetricCard label="Contactos" value={contactsTotal} helper="Contactos totales" icon={ContactRound} tone="emerald" />
        <MetricCard label="Facturas" value={invoices.length} helper={`${invoices.filter((invoice) => ['open', 'overdue'].includes(invoice.status)).length} pendientes`} icon={CreditCard} tone="amber" />
        <MetricCard label="Estado" value={company.status} helper={subscription?.planId?.name || 'Sin plan'} icon={Building2} tone="rose" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Empresa y suscripcion" description="Datos comerciales y modulos activos." />
          <div className="space-y-3 p-5 text-sm text-slate-600">
            <p><strong>Tax ID:</strong> {company.taxId || '-'}</p>
            <p><strong>Industria:</strong> {company.industry}</p>
            <p><strong>Plan:</strong> {subscription?.planId?.name || 'Sin plan'}</p>
            <p><strong>Suscripcion:</strong> {subscription?.status || 'Sin suscripcion'}</p>
            <p><strong>Modulos:</strong> {activeModules.join(', ') || 'Sin modulos'}</p>
            <p><strong>Onboarding:</strong> {company.onboarding?.completed ? 'Completado' : 'Pendiente'}</p>
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Usuarios principales"
            description="Roles y estado dentro de la empresa."
            action={<ImpersonationSwitcherButton companyId={id} />}
          />
          <Table
            data={users.map((user) => ({ ...user, id: user._id }))}
            emptyText="No hay usuarios"
            columns={[
              { key: 'name', header: 'Nombre', truncate: true, width: '12rem' },
              { key: 'email', header: 'Email', truncate: true, width: '14rem', hideBelow: 'md' },
              { key: 'role', header: 'Rol', nowrap: true },
              { key: 'status', header: 'Estado', nowrap: true, render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
              {
                key: 'impersonate',
                header: 'Acceso delegado',
                render: (row) => <ImpersonateUserButton target={row} onError={setError} />
              }
            ]}
          />
        </Card>
      </div>
      <Card>
        <CardHeader title="Facturas" description="Historial distribuidor → empresa." />
        <Table
          data={invoices.map((invoice) => ({
            ...invoice,
            id: invoice._id,
            totalLabel: money(invoice.total, invoice.currency)
          }))}
          emptyText="No hay facturas"
          columns={[
            { key: 'number', header: 'Numero', nowrap: true },
            { key: 'totalLabel', header: 'Total', nowrap: true, align: 'right' },
            { key: 'status', header: 'Estado', nowrap: true, render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
            { key: 'dueDate', header: 'Vencimiento', nowrap: true, render: (row) => new Date(row.dueDate).toLocaleDateString('es-EC') }
          ]}
        />
      </Card>
      <Card>
        <CardHeader title="Pagos" description="Pagos asociados a facturas de esta empresa." />
        <Table
          data={payments.map((payment) => ({
            ...payment,
            id: payment._id,
            invoiceLabel: payment.invoiceId?.number || '-',
            amountLabel: money(payment.amount, payment.currency)
          }))}
          emptyText="No hay pagos"
          columns={[
            { key: 'invoiceLabel', header: 'Factura', nowrap: true },
            { key: 'amountLabel', header: 'Monto', nowrap: true, align: 'right' },
            { key: 'method', header: 'Metodo', nowrap: true, hideBelow: 'sm' },
            { key: 'status', header: 'Estado', nowrap: true, render: (row) => <Badge tone={row.status}>{row.status}</Badge> }
          ]}
        />
      </Card>
    </PageShell>
  );
}
