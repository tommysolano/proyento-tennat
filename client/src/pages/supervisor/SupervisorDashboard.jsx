import { CheckCircle2, Headphones, ListTodo, MessageSquare, Target, Trophy, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addContactNote,
  getActivityLogs,
  getContacts,
  getCrmDashboard,
  getInboxMetrics,
  getUsers,
  updateContact
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { LoadingState, ModuleUnavailableState } from '../../components/AsyncState.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { ContactManager } from '../../components/ContactManager.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDate, idOf } from '../../utils/contacts.js';

export function SupervisorDashboard() {
  const { access } = useAuth();
  const permissions = new Set(access.permissions || []);
  const modules = new Set(access.modules || []);
  const canUseContacts =
    modules.has('crm') &&
    modules.has('contacts') &&
    permissions.has('contacts:read_team');
  const canUseInbox =
    modules.has('conversations') &&
    modules.has('inbox') &&
    permissions.has('conversations:read_team');
  const canReadUsers = permissions.has('users:read_team');
  const canReadActivity = permissions.has('activity:read_team');
  const canUpdateContacts = permissions.has('contacts:update_team');
  const canAssignContacts = permissions.has('contacts:assign_team');
  const canAddContactNotes = permissions.has('notes:create_team');
  const [agents, setAgents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activities, setActivities] = useState([]);
  const [crmSummary, setCrmSummary] = useState(null);
  const [inboxSummary, setInboxSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [moduleWarning, setModuleWarning] = useState('');

  const loadDashboard = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    setModuleWarning('');
    try {
      const optionalErrors = [];
      const agentData = canReadUsers
        ? await getUsers().catch((requestError) => {
            optionalErrors.push(requestError.message);
            return [];
          })
        : [];
      const activityData = canReadActivity
        ? await getActivityLogs().catch((requestError) => {
            optionalErrors.push(requestError.message);
            return [];
          })
        : [];
      const [contactData, crmData] = canUseContacts
        ? await Promise.all([getContacts(), getCrmDashboard()]).catch((requestError) => {
            optionalErrors.push(requestError.message);
            return [[], null];
          })
        : [[], null];
      const inboxData = canUseInbox
        ? await getInboxMetrics().catch((requestError) => {
            optionalErrors.push(requestError.message);
            return null;
          })
        : null;
      setAgents(agentData);
      setContacts(contactData);
      setActivities(activityData);
      setCrmSummary(crmData);
      setInboxSummary(inboxData);
      setModuleWarning([...new Set(optionalErrors)].join(' '));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [canReadActivity, canReadUsers, canUseContacts, canUseInbox]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const teamActivities = useMemo(() => {
    const teamIds = new Set(agents.map((agent) => agent._id));
    return activities.filter((item) => {
      const userId = idOf(item.userId);
      return teamIds.has(userId) || item.userId?.role === 'SUPERVISOR';
    });
  }, [activities, agents]);

  async function runMutation(action, message) {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await action();
      await loadDashboard(false);
      setNotice(message);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const handleUpdateContact = (contactId, payload) =>
    runMutation(() => updateContact(contactId, payload), 'Contacto actualizado y equipo refrescado.');

  const handleAddNote = (contactId, text) =>
    runMutation(() => addContactNote(contactId, text), 'Nota agregada al contacto.');

  if (loading) {
    return (
      <PageShell
        eyebrow="Supervision operativa"
        title="Dashboard de supervision"
        description="Cargando equipo y contactos reales..."
      >
        <LoadingState label="Cargando equipo, contactos y actividad..." />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Supervision operativa"
      title="Dashboard de supervision"
      description="Equipo asignado, contactos reales, reasignaciones y actividad persistente."
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
      {moduleWarning ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Algunos modulos no pudieron cargarse: {moduleWarning}
        </div>
      ) : null}

      <div id="metricas" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Agentes del equipo" value={agents.length} helper={`${agents.filter((agent) => agent.status === 'active').length} activos`} icon={UsersRound} tone="cyan" />
        {canUseContacts ? (
          <>
            <MetricCard label="Contactos asignados" value={contacts.length} helper="Solo contactos del equipo" icon={Headphones} tone="emerald" />
            <MetricCard label="En seguimiento" value={contacts.filter((contact) => contact.status === 'seguimiento').length} helper="Pendientes de nueva gestion" icon={ListTodo} tone="amber" />
            <MetricCard label="Cerrados" value={contacts.filter((contact) => contact.status === 'cerrado').length} helper="Gestion finalizada" icon={CheckCircle2} tone="slate" />
          </>
        ) : null}
      </div>
      {crmSummary ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Oportunidades abiertas" value={crmSummary.opportunitiesOpen} helper="Del equipo" icon={Target} tone="cyan" />
        <MetricCard label="Oportunidades ganadas" value={crmSummary.opportunitiesWon} helper={`$${crmSummary.wonValue}`} icon={Trophy} tone="emerald" />
        <MetricCard label="Tareas pendientes" value={crmSummary.pendingTasks} helper="Del equipo" icon={ListTodo} tone="amber" />
        <MetricCard label="Seguimientos vencidos" value={crmSummary.overdueFollowUps} helper={`${crmSummary.todayFollowUps} para hoy`} icon={CheckCircle2} tone="rose" />
      </div> : null}
      {inboxSummary ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Conversaciones abiertas" value={inboxSummary.open} helper="Del equipo" icon={MessageSquare} tone="cyan" />
        <MetricCard label="Pendientes del equipo" value={inboxSummary.pending} helper="Inbox operativo" icon={ListTodo} tone="amber" />
        <MetricCard label="No leidas" value={inboxSummary.unreadMessages} helper="Mensajes entrantes" icon={Headphones} tone="rose" />
        <MetricCard label="Sin responder" value={inboxSummary.unanswered} helper="Ultimo mensaje inbound" icon={MessageSquare} tone="slate" />
      </div> : null}

      {canReadUsers ? <Card id="agentes">
        <CardHeader
          title="Agentes del equipo"
          description="CALLCENTER con supervisorId asociado al supervisor autenticado."
        />
        <Table
          data={agents.map((agent) => ({
            ...agent,
            id: agent._id,
            contactCount: contacts.filter((contact) => idOf(contact.assignedTo) === agent._id).length
          }))}
          emptyText="No hay agentes vinculados a este supervisor"
          columns={[
            { key: 'name', header: 'Agente' },
            { key: 'email', header: 'Email' },
            { key: 'contactCount', header: 'Contactos asignados' },
            {
              key: 'status',
              header: 'Estado',
              render: (row) => <Badge tone={row.status}>{row.status}</Badge>
            }
          ]}
        />
      </Card> : null}

      {canUseContacts ? (
        <ContactManager
          contacts={contacts}
          agents={agents.filter((agent) => agent.status === 'active')}
          busy={busy}
          canEditDetails={canUpdateContacts}
          canAssign={canAssignContacts}
          canUpdate={canUpdateContacts || canAssignContacts}
          canAddNote={canAddContactNotes}
          onUpdate={handleUpdateContact}
          onAddNote={handleAddNote}
          title="Contactos del equipo"
          description="Filtra, edita y reasigna solo entre agentes vinculados a tu equipo."
        />
      ) : (
        <ModuleUnavailableState
          title="CRM del equipo no disponible"
          description="Tu rol no tiene permiso o el plan de la empresa no incluye CRM y contactos."
        />
      )}

      {canReadActivity ? <Card id="actividad">
        <CardHeader title="Actividad del equipo" description="Eventos recientes de agentes y supervisor." />
        <Table
          data={teamActivities.map((item) => ({
            ...item,
            id: item._id,
            dateLabel: formatDate(item.createdAt),
            userLabel: item.userId?.name || 'Usuario'
          }))}
          emptyText="No hay actividad del equipo"
          columns={[
            { key: 'dateLabel', header: 'Fecha' },
            { key: 'userLabel', header: 'Usuario' },
            { key: 'type', header: 'Tipo' },
            { key: 'summary', header: 'Resumen' }
          ]}
        />
      </Card> : null}
    </PageShell>
  );
}
