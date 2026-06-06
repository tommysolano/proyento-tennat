import { Activity, CircleDollarSign, ContactRound, Headphones, ListTodo, MessageSquare, Plus, Radio, Target, Trophy, UserCog, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addContactNote,
  createContact,
  createUser,
  deleteContact,
  getActivityLogs,
  getCompanyInvoices,
  getCompanyOnboarding,
  getCompanyPayments,
  getCompanySettings,
  getCompanies,
  getContacts,
  getSubscriptions,
  getUsers,
  getCrmDashboard,
  getInboxMetrics,
  updateCompanyOnboarding,
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
  const [companyInvoices, setCompanyInvoices] = useState([]);
  const [companyPayments, setCompanyPayments] = useState([]);
  const [companySettings, setCompanySettings] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [crmSummary, setCrmSummary] = useState(null);
  const [inboxSummary, setInboxSummary] = useState(null);
  const [commercialError, setCommercialError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    setCommercialError('');

    try {
      const [userData, contactData, activityData, companyData, subscriptionData, crmData, inboxData] =
        await Promise.all([
          getUsers(),
          getContacts(),
          getActivityLogs(),
          getCompanies(),
          getSubscriptions(),
          getCrmDashboard(),
          getInboxMetrics()
        ]);
      setUsers(userData);
      setContacts(contactData);
      setActivities(activityData);
      setCompany(companyData[0] || null);
      setSubscription(subscriptionData[0] || null);
      setCrmSummary(crmData);
      setInboxSummary(inboxData);

      const [settingsData, onboardingData] = await Promise.all([
        getCompanySettings(),
        getCompanyOnboarding()
      ]);
      setCompanySettings(settingsData);
      setOnboarding(onboardingData);

      const billingData = await Promise.all([
        getCompanyInvoices(),
        getCompanyPayments()
      ]).catch((billingError) => {
        setCommercialError(billingError.message);
        return null;
      });
      if (billingData) {
        setCommercialError('');
        setCompanyInvoices(billingData[0]);
        setCompanyPayments(billingData[1]);
      }
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

  async function handleProfileOnboarding() {
    await runMutation(
      () => updateCompanyOnboarding({ profile: true }),
      'Perfil de empresa marcado como completado.'
    );
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
      {crmSummary ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Oportunidades abiertas" value={crmSummary.opportunitiesOpen} helper={`$${crmSummary.openValue}`} icon={Target} tone="cyan" />
        <MetricCard label="Ganadas" value={crmSummary.opportunitiesWon} helper={`$${crmSummary.wonValue}`} icon={Trophy} tone="emerald" />
        <MetricCard label="Perdidas" value={crmSummary.opportunitiesLost} helper="Deals cerrados" icon={Activity} tone="rose" />
        <MetricCard label="Tareas pendientes" value={crmSummary.pendingTasks} helper="Operaciones por completar" icon={ListTodo} tone="amber" />
        <MetricCard label="Seguimientos vencidos" value={crmSummary.overdueFollowUps} helper={`${crmSummary.todayFollowUps} para hoy`} icon={ContactRound} tone="rose" />
        <MetricCard label="Valor ganado" value={`$${crmSummary.wonValue}`} helper="Acumulado visible" icon={CircleDollarSign} tone="slate" />
      </div> : null}
      {inboxSummary ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Conversaciones abiertas" value={inboxSummary.open} helper="Inbox de empresa" icon={MessageSquare} tone="cyan" />
        <MetricCard label="Pendientes" value={inboxSummary.pending} helper="Requieren gestion" icon={ListTodo} tone="amber" />
        <MetricCard label="Sin asignar" value={inboxSummary.unassigned} helper="Routing manual" icon={UsersRound} tone="rose" />
        <MetricCard label="Mensajes no leidos" value={inboxSummary.unreadMessages} helper="Entrantes pendientes" icon={MessageSquare} tone="emerald" />
        <MetricCard label="Ultimo mensaje" value={formatDate(inboxSummary.latestMessageAt)} helper={`${inboxSummary.unanswered} sin responder`} icon={Headphones} tone="amber" />
        <MetricCard label="Canales conectados" value={inboxSummary.connectedChannels} helper="Configuraciones activas" icon={Radio} tone="slate" />
      </div> : null}

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

      <div id="facturacion" className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Facturas de la empresa" description="Solo lectura para la empresa autenticada." />
          {commercialError ? (
            <p className="p-5 text-sm text-amber-700">{commercialError}</p>
          ) : (
            <Table
              data={companyInvoices.map((invoice) => ({
                ...invoice,
                id: invoice._id,
                totalLabel: new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: invoice.currency || 'USD'
                }).format(invoice.total || 0),
                dueLabel: new Date(invoice.dueDate).toLocaleDateString('es-EC'),
                paymentsLabel: `${invoice.payments?.length || 0} pago(s)`
              }))}
              emptyText="No hay facturas emitidas"
              columns={[
                { key: 'number', header: 'Numero' },
                { key: 'totalLabel', header: 'Total' },
                { key: 'dueLabel', header: 'Vence' },
                { key: 'paymentsLabel', header: 'Pagos' },
                { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> }
              ]}
            />
          )}
        </Card>
        <Card>
          <CardHeader title="Pagos de la empresa" description="Pagos registrados por el distribuidor." />
          <Table
            data={companyPayments.map((payment) => ({
              ...payment,
              id: payment._id,
              invoiceLabel: payment.invoiceId?.number || '-',
              amountLabel: new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: payment.currency || 'USD'
              }).format(payment.amount || 0),
              paidLabel: payment.paidAt
                ? new Date(payment.paidAt).toLocaleDateString('es-EC')
                : '-'
            }))}
            emptyText="No hay pagos registrados"
            columns={[
              { key: 'invoiceLabel', header: 'Factura' },
              { key: 'amountLabel', header: 'Monto' },
              { key: 'method', header: 'Metodo' },
              { key: 'paidLabel', header: 'Fecha' },
              { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> }
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card id="configuracion">
          <CardHeader title="Configuracion de empresa" description="Vista comercial de solo lectura." />
          <div className="space-y-3 p-5 text-sm text-slate-600">
            <p><strong>Empresa:</strong> {companySettings?.name || company?.name}</p>
            <p><strong>Tax ID:</strong> {companySettings?.taxId || '-'}</p>
            <p><strong>Industria:</strong> {companySettings?.industry || '-'}</p>
            <p><strong>Timezone:</strong> {companySettings?.settings?.timezone || '-'}</p>
            <p><strong>Locale:</strong> {companySettings?.settings?.locale || '-'}</p>
            <p><strong>Marca del distribuidor:</strong> {companySettings?.distributorId?.branding?.companyName || companySettings?.distributorId?.name || '-'}</p>
          </div>
        </Card>
        <Card id="onboarding">
          <CardHeader title="Onboarding de empresa" description="Checklist calculado con datos reales." />
          <div className="space-y-3 p-5">
            {Object.entries(onboarding?.steps || {}).map(([step, completed]) => (
              <div key={step} className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3 text-sm">
                <span className="font-medium text-slate-700">
                  {{
                    profile: 'Completar perfil de empresa',
                    users: 'Crear usuarios',
                    contacts: 'Crear o importar contactos',
                    firstAssignment: 'Asignar contactos'
                  }[step] || step}
                </span>
                <Badge tone={completed ? 'active' : 'pending'}>
                  {completed ? 'completo' : 'pendiente'}
                </Badge>
              </div>
            ))}
            {!onboarding?.steps?.profile ? (
              <Button onClick={handleProfileOnboarding} disabled={busy}>
                Marcar perfil completado
              </Button>
            ) : null}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
