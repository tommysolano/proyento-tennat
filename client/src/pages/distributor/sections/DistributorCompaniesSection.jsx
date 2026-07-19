import { LogIn, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createCompany, reactivateCompany, suspendCompany } from '../../../api.js';
import { Badge } from '../../../components/Badge.jsx';
import { Button } from '../../../components/Button.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { Drawer } from '../../../components/Drawer.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormGrid } from '../../../components/FormGrid.jsx';
import { ImpersonationSwitcherButton } from '../../../components/ImpersonationSwitcher.jsx';
import { Table } from '../../../components/Table.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { formatMoney } from '../../../utils/billing.js';

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

function dateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(new Date(value));
}

export function DistributorCompaniesSection({ workspace }) {
  const navigate = useNavigate();
  const { impersonateAdmin } = useAuth();
  const { commerceCompanies = [], settings, busy, mutate, setError } = workspace;
  const [open, setOpen] = useState(false);

  const currency = settings?.billingSettings?.currency;

  async function handleCreateCompany(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = data.get('name');
    const created = await mutate(
      'company',
      () =>
        createCompany({
          name,
          taxId: data.get('taxId'),
          industry: data.get('industry'),
          status: data.get('status')
        }),
      `Empresa "${name}" creada correctamente.`
    );
    if (created) {
      form.reset();
      setOpen(false);
    }
  }

  async function handleCompanyStatus(company) {
    const reactivating = company.status === 'suspended';
    await mutate(
      `company-${company._id}`,
      () => (reactivating ? reactivateCompany(company._id) : suspendCompany(company._id)),
      `Empresa ${reactivating ? 'reactivada' : 'suspendida'}.`
    );
  }

  async function handleEnterCompany(company) {
    setError('');
    try {
      const data = await impersonateAdmin(company._id);
      navigate(data.redirectPath, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Estado comercial de empresas"
          description="Plan, deuda pendiente, ultimo pago y acceso delegado."
          action={
            <Button onClick={() => setOpen(true)} disabled={Boolean(busy)}>
              <Plus className="h-4 w-4" />
              Crear empresa
            </Button>
          }
        />
        <Table
          data={commerceCompanies.map((company) => ({
            ...company,
            id: company._id,
            adminLabel: company.adminId?.email || 'Sin admin',
            planLabel: company.subscription?.planId?.name || 'Sin plan',
            subscriptionLabel: company.subscription?.status || 'sin_suscripcion',
            pendingLabel: `${company.pendingInvoices?.count || 0} / ${formatMoney(
              company.pendingInvoices?.total,
              currency
            )}`,
            lastPaymentLabel: company.lastPayment
              ? `${formatMoney(company.lastPayment.amount, company.lastPayment.currency)} - ${dateLabel(company.lastPayment.paidAt)}`
              : 'Sin pagos'
          }))}
          emptyText="No hay empresas"
          columns={[
            { key: 'name', header: 'Empresa', truncate: true, width: '13rem' },
            { key: 'adminLabel', header: 'Admin', truncate: true, width: '14rem', hideBelow: 'md' },
            { key: 'planLabel', header: 'Plan', truncate: true, width: '10rem', hideBelow: 'sm' },
            {
              key: 'subscriptionLabel',
              header: 'Suscripcion',
              nowrap: true,
              render: (row) => <Badge tone={row.subscriptionLabel}>{row.subscriptionLabel}</Badge>
            },
            { key: 'pendingLabel', header: 'Pendientes', nowrap: true, align: 'right', hideBelow: 'lg' },
            { key: 'lastPaymentLabel', header: 'Ultimo pago', nowrap: true, hideBelow: 'lg' },
            {
              key: 'status',
              header: 'Estado',
              nowrap: true,
              render: (row) => <Badge tone={row.status}>{row.status}</Badge>
            },
            {
              key: 'actions',
              header: 'Acciones',
              nowrap: true,
              render: (row) => (
                <div className="flex gap-2">
                  <Button
                    as={Link}
                    to={`/distributor/companies/${row._id}`}
                    className="px-3"
                    variant="secondary"
                  >
                    Detalle
                  </Button>
                  <Button
                    className="px-3"
                    variant="secondary"
                    disabled={!row.canImpersonate || Boolean(busy)}
                    onClick={() => handleEnterCompany(row)}
                  >
                    <LogIn className="h-4 w-4" /> Entrar
                  </Button>
                  <ImpersonationSwitcherButton label="Entrar como..." companyId={row._id} />
                  <Button
                    className="px-3"
                    variant={row.status === 'suspended' ? 'primary' : 'danger'}
                    onClick={() => handleCompanyStatus(row)}
                  >
                    {row.status === 'suspended' ? 'Reactivar' : 'Suspender'}
                  </Button>
                </div>
              )
            }
          ]}
        />
      </Card>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Crear empresa"
        description="El distributorId se toma del JWT autenticado."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="distributor-company-form" disabled={Boolean(busy)}>
              <Plus className="h-4 w-4" />
              {busy === 'company' ? 'Creando...' : 'Crear empresa'}
            </Button>
          </>
        }
      >
        <form id="distributor-company-form" onSubmit={handleCreateCompany}>
          <FormGrid columns={1}>
            <FormField label="Nombre de la empresa" htmlFor="company-name" required>
              <input
                id="company-name"
                required
                name="name"
                className={inputClass}
                placeholder="Ej. Empresa Andina"
              />
            </FormField>
            <FormField
              label="RUC / Tax ID"
              htmlFor="company-tax-id"
              hint="Identificador fiscal opcional."
            >
              <input
                id="company-tax-id"
                name="taxId"
                className={inputClass}
                placeholder="0999999999001"
              />
            </FormField>
            <FormField label="Industria" htmlFor="company-industry">
              <input
                id="company-industry"
                name="industry"
                className={inputClass}
                placeholder="Ej. Servicios profesionales"
              />
            </FormField>
            <FormField label="Estado inicial" htmlFor="company-status">
              <select id="company-status" name="status" className={inputClass}>
                <option value="active">Activa</option>
                <option value="trial">Prueba</option>
                <option value="suspended">Suspendida</option>
              </select>
            </FormField>
          </FormGrid>
        </form>
      </Drawer>
    </>
  );
}
