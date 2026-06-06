import { Activity, ContactRound, Headphones, Plus, UserCog, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addContactNote,
  createContact,
  createUser,
  deleteContact,
  getActivityLogs,
  getCompanies,
  getContacts,
  getSubscriptions,
  getUsers,
  updateContact
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { ContactManager } from '../../components/ContactManager.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { contactStatusLabel, formatDate } from '../../utils/contacts.js';

export function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activities, setActivities] = useState([]);
  const [company, setCompany] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');

    try {
      const [userData, contactData, activityData, companyData, subscriptionData] =
        await Promise.all([
          getUsers(),
          getContacts(),
          getActivityLogs(),
          getCompanies(),
          getSubscriptions()
        ]);
      setUsers(userData);
      setContacts(contactData);
      setActivities(activityData);
      setCompany(companyData[0] || null);
      setSubscription(subscriptionData[0] || null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const supervisors = useMemo(
    () => users.filter((user) => user.role === 'SUPERVISOR'),
    [users]
  );
  const agents = useMemo(
    () => users.filter((user) => user.role === 'CALLCENTER'),
    [users]
  );

  async function runMutation(action, successMessage) {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await action();
      await loadDashboard(false);
      setNotice(successMessage);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const role = data.get('role');
    const name = data.get('name');
    const created = await runMutation(
      () =>
        createUser({
          name,
          email: data.get('email'),
          password: data.get('password'),
          role,
          supervisorId: role === 'CALLCENTER' ? data.get('supervisorId') || null : null
        }),
      `${role === 'SUPERVISOR' ? 'Supervisor' : 'Agente'} "${name}" creado correctamente.`
    );
    if (created) form.reset();
  }

  const handleCreateContact = (payload) =>
    runMutation(() => createContact(payload), `Contacto "${payload.name}" creado.`);

  const handleUpdateContact = (contactId, payload) =>
    runMutation(() => updateContact(contactId, payload), 'Contacto actualizado.');

  const handleAddNote = (contactId, text) =>
    runMutation(() => addContactNote(contactId, text), 'Nota agregada.');

  async function handleDeleteContact(contactId) {
    if (!window.confirm('Eliminar este contacto de forma permanente?')) return false;
    return runMutation(() => deleteContact(contactId), 'Contacto eliminado.');
  }

  if (loading) {
    return (
      <PageShell
        eyebrow="Tenant empresa"
        title="Dashboard de empresa"
        description="Cargando usuarios, contactos y actividad real..."
      >
        <Card className="p-8 text-center text-sm text-slate-500">
          Cargando datos desde la API...
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Tenant empresa"
      title={company?.name ? `Dashboard de ${company.name}` : 'Dashboard de empresa'}
      description="Gestion real de usuarios, contactos, asignaciones y actividad dentro del tenant."
    >
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Usuarios" value={users.length} helper="Equipo del tenant" icon={UsersRound} tone="cyan" />
        <MetricCard label="Supervisores" value={supervisors.length} helper="Roles de supervision" icon={UserCog} tone="emerald" />
        <MetricCard label="Agentes" value={agents.length} helper="Call center activos e inactivos" icon={Headphones} tone="amber" />
        <MetricCard label="Contactos" value={contacts.length} helper={`${contacts.filter((item) => item.status === 'seguimiento').length} en seguimiento`} icon={ContactRound} tone="rose" />
        <MetricCard label="Cerrados" value={contacts.filter((item) => item.status === 'cerrado').length} helper="Contactos finalizados" icon={Activity} tone="slate" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.72fr]">
        <Card id="usuarios">
          <CardHeader
            title="Usuarios internos"
            description="Supervisores y agentes persistidos en esta empresa."
          />
          <Table
            data={users.map((user) => ({ ...user, id: user._id }))}
            emptyText="No hay usuarios internos"
            columns={[
              { key: 'name', header: 'Nombre' },
              { key: 'email', header: 'Email' },
              { key: 'role', header: 'Rol' },
              {
                key: 'supervisorId',
                header: 'Supervisor',
                render: (row) => row.supervisorId?.name || '-'
              },
              {
                key: 'status',
                header: 'Estado',
                render: (row) => <Badge tone={row.status}>{row.status}</Badge>
              }
            ]}
          />
        </Card>

        <Card>
          <CardHeader
            title="Crear supervisor o agente"
            description="El backend fuerza empresa, distribuidor y rol permitido."
          />
          <form className="space-y-4 p-5" onSubmit={handleCreateUser}>
            <input required name="name" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Nombre completo" />
            <input required type="email" name="email" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Email corporativo" />
            <input required minLength="8" type="password" name="password" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Password (minimo 8 caracteres)" />
            <select name="role" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm">
              <option value="SUPERVISOR">Supervisor</option>
              <option value="CALLCENTER">Call center</option>
            </select>
            <select name="supervisorId" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" defaultValue="">
              <option value="">Sin supervisor</option>
              {supervisors.map((supervisor) => (
                <option key={supervisor._id} value={supervisor._id}>{supervisor.name}</option>
              ))}
            </select>
            <Button className="w-full" type="submit" disabled={busy}>
              <Plus className="h-4 w-4" />
              {busy ? 'Creando...' : 'Crear usuario'}
            </Button>
          </form>
        </Card>
      </div>

      <ContactManager
        contacts={contacts}
        agents={agents.filter((agent) => agent.status === 'active')}
        busy={busy}
        canCreate
        canDelete
        canEditDetails
        canAssign
        onCreate={handleCreateContact}
        onUpdate={handleUpdateContact}
        onDelete={handleDeleteContact}
        onAddNote={handleAddNote}
        title="Contactos de la empresa"
        description="Crear, editar, asignar, filtrar y eliminar contactos reales."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_0.65fr]">
        <Card id="actividad">
          <CardHeader title="Actividad reciente" description="Eventos registrados automaticamente por la API." />
          <Table
            data={activities.map((item) => ({
              ...item,
              id: item._id,
              dateLabel: formatDate(item.createdAt),
              userLabel: item.userId?.name || 'Usuario del sistema'
            }))}
            emptyText="No hay actividad registrada"
            columns={[
              { key: 'dateLabel', header: 'Fecha' },
              { key: 'userLabel', header: 'Usuario' },
              { key: 'type', header: 'Tipo' },
              { key: 'summary', header: 'Resumen' }
            ]}
          />
        </Card>

        <Card id="plan">
          <CardHeader title="Suscripcion actual" description="Plan real asociado a la empresa." />
          <div className="space-y-4 p-5">
            {subscription ? (
              <>
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Plan</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{subscription.planId?.name}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-sm text-slate-500">Estado</p>
                    <Badge tone={subscription.status}>{subscription.status}</Badge>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-sm text-slate-500">Precio</p>
                    <p className="mt-1 font-semibold text-slate-950">${subscription.planId?.price ?? 0}</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">La empresa no tiene una suscripcion visible.</p>
            )}
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              {Object.entries(
                contacts.reduce((counts, contact) => {
                  counts[contact.status] = (counts[contact.status] || 0) + 1;
                  return counts;
                }, {})
              ).map(([status, count]) => (
                <div key={status} className="flex justify-between py-1">
                  <span>{contactStatusLabel(status)}</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
