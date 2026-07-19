import { LogIn, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDistributor, updateDistributor } from '../../../api.js';
import { Badge } from '../../../components/Badge.jsx';
import { Button } from '../../../components/Button.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { Drawer } from '../../../components/Drawer.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormGrid } from '../../../components/FormGrid.jsx';
import { ImpersonationSwitcherButton } from '../../../components/ImpersonationSwitcher.jsx';
import { Table } from '../../../components/Table.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

export function SuperAdminDistributorsSection({ workspace }) {
  const navigate = useNavigate();
  const { impersonateDistributor } = useAuth();
  const { distributors = [], busy, mutate, setError } = workspace;
  const [open, setOpen] = useState(false);

  async function handleCreateDistributor(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = data.get('name');
    const created = await mutate(
      'distributor-create',
      () =>
        createDistributor({
          name,
          slug: data.get('slug'),
          ownerName: data.get('ownerName'),
          email: data.get('email'),
          phone: data.get('phone'),
          region: data.get('region'),
          status: data.get('status'),
          ownerUser: {
            name: data.get('ownerName'),
            email: data.get('userEmail'),
            password: data.get('password')
          }
        }),
      `Distribuidor "${name}" creado con su usuario.`
    );
    if (created) {
      form.reset();
      setOpen(false);
    }
  }

  async function handleEditDistributor(distributor) {
    const name = window.prompt('Nombre del distribuidor', distributor.name);
    if (!name) return;
    const email = window.prompt('Email del distribuidor', distributor.email);
    if (!email) return;
    const region = window.prompt('Region', distributor.region || 'LatAm');
    if (region === null) return;
    await mutate(
      `distributor-edit-${distributor._id}`,
      () => updateDistributor(distributor._id, { name, email, region }),
      `Distribuidor "${name}" actualizado.`
    );
  }

  async function handleDistributorStatus(distributor) {
    const nextStatus = distributor.status === 'suspended' ? 'active' : 'suspended';
    await mutate(
      `distributor-status-${distributor._id}`,
      () => updateDistributor(distributor._id, { status: nextStatus }),
      `Distribuidor ${nextStatus === 'suspended' ? 'suspendido' : 'reactivado'}.`
    );
  }

  async function handleImpersonate(distributor) {
    setError('');
    try {
      const data = await impersonateDistributor(distributor._id);
      navigate(data.redirectPath, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Distribuidores"
          description="Owners, estado y acceso controlado al tenant."
          action={
            <div className="flex flex-wrap gap-2">
              <ImpersonationSwitcherButton />
              <Button onClick={() => setOpen(true)} disabled={Boolean(busy)}>
                <Plus className="h-4 w-4" />
                Crear distribuidor
              </Button>
            </div>
          }
        />
        <Table
          data={distributors.map((item) => ({ ...item, id: item._id }))}
          emptyText="No hay distribuidores registrados"
          columns={[
            { key: 'name', header: 'Distribuidor', truncate: true, width: '12rem' },
            { key: 'slug', header: 'Slug', nowrap: true, hideBelow: 'lg' },
            { key: 'email', header: 'Email', truncate: true, width: '14rem', hideBelow: 'md' },
            { key: 'region', header: 'Region', nowrap: true, hideBelow: 'lg' },
            {
              key: 'ownerUser',
              header: 'Usuario',
              truncate: true,
              width: '14rem',
              hideBelow: 'lg',
              render: (row) => row.ownerUser?.email || 'Sin usuario'
            },
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
                  <Button className="px-3" variant="secondary" onClick={() => handleEditDistributor(row)}>
                    Editar
                  </Button>
                  <Button
                    className="px-3"
                    variant={row.status === 'suspended' ? 'primary' : 'danger'}
                    onClick={() => handleDistributorStatus(row)}
                  >
                    {row.status === 'suspended' ? 'Reactivar' : 'Suspender'}
                  </Button>
                  <Button
                    className="px-3"
                    variant="secondary"
                    disabled={!['active', 'trial'].includes(row.status) || !row.ownerUser}
                    onClick={() => handleImpersonate(row)}
                  >
                    <LogIn className="h-4 w-4" /> Entrar
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
        title="Crear distribuidor"
        description="Crea el tenant y su usuario DISTRIBUTOR en un solo flujo."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="superadmin-distributor-form" disabled={Boolean(busy)}>
              <Plus className="h-4 w-4" />
              {busy === 'distributor-create' ? 'Creando...' : 'Crear distribuidor y usuario'}
            </Button>
          </>
        }
      >
        <form id="superadmin-distributor-form" className="space-y-8" onSubmit={handleCreateDistributor}>
          <FormGrid title="Datos comerciales">
            <FormField label="Nombre comercial" htmlFor="distributor-name" required>
              <input id="distributor-name" required name="name" className={inputClass} placeholder="Ej. Partner Ecuador" />
            </FormField>
            <FormField
              label="Slug"
              htmlFor="distributor-slug"
              hint="Identificador unico en minusculas y con guiones."
              required
            >
              <input id="distributor-slug" required name="slug" className={inputClass} placeholder="partner-ecuador" />
            </FormField>
            <FormField label="Nombre del responsable" htmlFor="distributor-owner" required>
              <input id="distributor-owner" required name="ownerName" className={inputClass} placeholder="Nombre completo" />
            </FormField>
            <FormField label="Email comercial" htmlFor="distributor-email" required>
              <input id="distributor-email" required type="email" name="email" className={inputClass} placeholder="ventas@partner.com" />
            </FormField>
            <FormField label="Telefono" htmlFor="distributor-phone">
              <input id="distributor-phone" name="phone" className={inputClass} placeholder="+593..." />
            </FormField>
            <FormField label="Region" htmlFor="distributor-region">
              <input id="distributor-region" name="region" className={inputClass} placeholder="Region" defaultValue="LatAm" />
            </FormField>
          </FormGrid>

          <FormGrid
            title="Usuario de acceso"
            description="Credenciales del usuario DISTRIBUTOR que gobernara el tenant."
          >
            <FormField label="Email de acceso" htmlFor="distributor-user-email" required>
              <input id="distributor-user-email" required type="email" name="userEmail" className={inputClass} placeholder="admin@partner.com" />
            </FormField>
            <FormField label="Contrasena temporal" htmlFor="distributor-password" hint="Minimo 8 caracteres." required>
              <input id="distributor-password" required minLength="8" type="password" name="password" className={inputClass} placeholder="Minimo 8 caracteres" />
            </FormField>
            <FormField label="Estado inicial" htmlFor="distributor-status">
              <select id="distributor-status" name="status" className={inputClass}>
                <option value="trial">Trial</option>
                <option value="active">Activo</option>
              </select>
            </FormField>
          </FormGrid>
        </form>
      </Drawer>
    </>
  );
}
