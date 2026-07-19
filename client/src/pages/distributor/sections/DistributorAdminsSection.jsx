import { Plus } from 'lucide-react';
import { useState } from 'react';
import { createUser } from '../../../api.js';
import { Badge } from '../../../components/Badge.jsx';
import { Button } from '../../../components/Button.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { Drawer } from '../../../components/Drawer.jsx';
import { EmptyState } from '../../../components/EmptyState.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormGrid } from '../../../components/FormGrid.jsx';
import { ImpersonateUserButton } from '../../../components/ImpersonationSwitcher.jsx';
import { Table } from '../../../components/Table.jsx';
import { idOf } from '../../../utils/contacts.js';

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

export function DistributorAdminsSection({ workspace }) {
  const { companies = [], users = [], busy, mutate, setError } = workspace;
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState('');

  const companiesWithoutAdmin = companies.filter(
    (company) => !company.adminId || company.adminId.status !== 'active'
  );
  const admins = users.filter((user) => user.role === 'ADMIN');
  const companyNameById = new Map(companies.map((company) => [company._id, company.name]));

  async function handleCreateAdmin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = data.get('name');
    const created = await mutate(
      'admin',
      () =>
        createUser({
          name,
          email: data.get('email'),
          password: data.get('password'),
          role: 'ADMIN',
          companyId: data.get('companyId')
        }),
      `Administrador "${name}" creado correctamente.`
    );
    if (created) {
      form.reset();
      setCompanyId('');
      setOpen(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Administradores de empresa"
          description="Responsables ADMIN creados para las empresas de tu cartera."
          action={
            <Button
              onClick={() => setOpen(true)}
              disabled={Boolean(busy) || !companiesWithoutAdmin.length}
            >
              <Plus className="h-4 w-4" />
              Crear administrador
            </Button>
          }
        />
        {admins.length ? (
          <Table
            data={admins.map((admin) => ({
              ...admin,
              id: admin._id,
              companyLabel:
                admin.companyId?.name || companyNameById.get(idOf(admin.companyId)) || '-'
            }))}
            emptyText="No hay administradores creados"
            columns={[
              { key: 'name', header: 'Nombre', truncate: true, width: '14rem' },
              { key: 'email', header: 'Email', truncate: true, width: '16rem' },
              { key: 'companyLabel', header: 'Empresa', truncate: true, width: '14rem' },
              {
                key: 'status',
                header: 'Estado',
                nowrap: true,
                render: (row) => <Badge tone={row.status}>{row.status}</Badge>
              },
              {
                key: 'impersonate',
                header: 'Acceso delegado',
                nowrap: true,
                render: (row) => <ImpersonateUserButton target={row} onError={setError} />
              }
            ]}
          />
        ) : (
          <EmptyState
            title="Todavia no hay administradores"
            description="Crea el primer ADMIN para que una empresa pueda operar su propio panel."
            action={
              <Button
                onClick={() => setOpen(true)}
                disabled={!companiesWithoutAdmin.length}
              >
                <Plus className="h-4 w-4" />
                Crear administrador
              </Button>
            }
          />
        )}
        {!companiesWithoutAdmin.length ? (
          <p className="border-t border-slate-100 p-5 text-sm text-slate-500">
            Todas tus empresas ya tienen un administrador activo.
          </p>
        ) : null}
      </Card>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Crear administrador"
        description="Solo para una empresa propia sin admin activo."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="distributor-admin-form"
              disabled={Boolean(busy) || !companiesWithoutAdmin.length}
            >
              <Plus className="h-4 w-4" />
              {busy === 'admin' ? 'Creando...' : 'Crear admin'}
            </Button>
          </>
        }
      >
        <form id="distributor-admin-form" onSubmit={handleCreateAdmin}>
          <FormGrid columns={1}>
            <FormField label="Empresa" htmlFor="admin-company" required>
              <select
                id="admin-company"
                required
                name="companyId"
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Selecciona una empresa
                </option>
                {companiesWithoutAdmin.map((company) => (
                  <option key={company._id} value={company._id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Nombre del administrador" htmlFor="admin-name" required>
              <input
                id="admin-name"
                required
                name="name"
                className={inputClass}
                placeholder="Nombre completo"
              />
            </FormField>
            <FormField label="Email de acceso" htmlFor="admin-email" required>
              <input
                id="admin-email"
                required
                type="email"
                name="email"
                className={inputClass}
                placeholder="admin@empresa.com"
              />
            </FormField>
            <FormField
              label="Contrasena temporal"
              htmlFor="admin-password"
              hint="Minimo 8 caracteres. Comparte la clave por un canal seguro."
              required
            >
              <input
                id="admin-password"
                required
                minLength="8"
                type="password"
                name="password"
                className={inputClass}
                placeholder="Minimo 8 caracteres"
              />
            </FormField>
          </FormGrid>
        </form>
      </Drawer>
    </>
  );
}
