import { CheckCircle2, ContactRound, Headphones, ListTodo, MessageSquare, PhoneCall, Target, TimerReset, Trophy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addContactNote,
  getActivityLogs,
  getContacts,
  getCrmDashboard,
  getInboxMetrics,
  updateContact
} from '../../api.js';
import { LoadingState, ModuleUnavailableState } from '../../components/AsyncState.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { ContactManager } from '../../components/ContactManager.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDate } from '../../utils/contacts.js';

export function CallCenterDashboard() {
  const { access } = useAuth();
  const permissions = new Set(access.permissions || []);
  const modules = new Set(access.modules || []);
  const canUseContacts =
    modules.has('crm') &&
    modules.has('contacts') &&
    permissions.has('contacts:read_assigned');
  const canUseInbox =
    modules.has('conversations') &&
    modules.has('inbox') &&
    permissions.has('conversations:read_assigned');
  const canReadActivity = permissions.has('activity:read_self');
  const canUpdateContacts = permissions.has('contacts:update_assigned');
  const canAddContactNotes =
    permissions.has('contacts:notes') || permissions.has('notes:create_assigned');
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
  }, [canReadActivity, canUseContacts, canUseInbox]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

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
    runMutation(() => updateContact(contactId, payload), 'Gestion guardada correctamente.');

  const handleAddNote = (contactId, text) =>
    runMutation(() => addContactNote(contactId, text), 'Nota agregada al contacto.');

  const followUps = contacts.filter((contact) => contact.nextFollowUpAt);

  if (loading) {
    return (
      <PageShell
        eyebrow="Trabajo del agente"
        title="Dashboard del call center"
        description="Cargando contactos asignados..."
      >
        <LoadingState label="Cargando contactos y actividad asignada..." />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Trabajo del agente"
      title="Dashboard del call center"
      description="Gestiona exclusivamente tus contactos asignados, notas y seguimientos."
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

      {canUseContacts ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Asignados" value={contacts.length} helper="Solo tu cartera" icon={ContactRound} tone="cyan" />
        <MetricCard label="Nuevos" value={contacts.filter((contact) => contact.status === 'nuevo').length} helper="Pendientes de primer contacto" icon={TimerReset} tone="amber" />
        <MetricCard label="Contactados" value={contacts.filter((contact) => contact.status === 'contactado').length} helper="Gestion iniciada" icon={PhoneCall} tone="cyan" />
        <MetricCard label="Seguimiento" value={contacts.filter((contact) => contact.status === 'seguimiento').length} helper={`${followUps.length} con fecha programada`} icon={Target} tone="emerald" />
        <MetricCard label="Cerrados" value={contacts.filter((contact) => contact.status === 'cerrado').length} helper="Gestion finalizada" icon={CheckCircle2} tone="slate" />
      </div> : null}
      {crmSummary ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Mis oportunidades" value={crmSummary.opportunitiesOpen} helper="Abiertas" icon={Target} tone="cyan" />
        <MetricCard label="Ganadas" value={crmSummary.opportunitiesWon} helper="Oportunidades propias" icon={Trophy} tone="emerald" />
        <MetricCard label="Mis tareas" value={crmSummary.pendingTasks} helper="Pendientes" icon={ListTodo} tone="amber" />
        <MetricCard label="Seguimientos vencidos" value={crmSummary.overdueFollowUps} helper={`${crmSummary.todayFollowUps} para hoy`} icon={TimerReset} tone="rose" />
      </div> : null}
      {inboxSummary ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Mis conversaciones" value={inboxSummary.open} helper="Abiertas" icon={MessageSquare} tone="cyan" />
        <MetricCard label="Mis no leidas" value={inboxSummary.unreadMessages} helper={`${inboxSummary.pending} pendientes`} icon={Headphones} tone="rose" />
        <MetricCard label="Sin responder" value={inboxSummary.unanswered} helper="Requieren respuesta" icon={MessageSquare} tone="amber" />
      </div> : null}
      {inboxSummary?.latest?.length ? <Card>
        <CardHeader title="Ultimas conversaciones" description="Actividad reciente de tu inbox asignado." />
        <Table
          data={inboxSummary.latest.map((item) => ({
            ...item,
            id: item._id,
            contactName: item.contactId?.name || 'Contacto',
            lastMessageLabel: item.lastMessage || 'Sin mensajes',
            dateLabel: formatDate(item.lastMessageAt)
          }))}
          columns={[
            { key: 'contactName', header: 'Contacto' },
            { key: 'channel', header: 'Canal' },
            { key: 'lastMessageLabel', header: 'Ultimo mensaje' },
            { key: 'dateLabel', header: 'Fecha' },
            { key: 'open', header: '', render: (row) => <Link className="font-semibold text-cyan-700 hover:underline" to={`/inbox?conversationId=${row._id}`}>Abrir</Link> }
          ]}
        />
      </Card> : null}

      {canUseContacts ? (
        <ContactManager
          contacts={contacts}
          busy={busy}
          canUpdate={canUpdateContacts}
          canAddNote={canAddContactNotes}
          onUpdate={handleUpdateContact}
          onAddNote={handleAddNote}
          title="Mis contactos asignados"
          description="Busqueda, filtros y ficha operativa con permisos limitados."
        />
      ) : (
        <ModuleUnavailableState
          title="Contactos no disponibles"
          description="Tu acceso no incluye contactos asignados o el modulo CRM no esta activo."
        />
      )}

      {canReadActivity ? <Card id="actividad">
        <CardHeader title="Mi actividad" description="Cambios de estado, notas y seguimientos registrados por la API." />
        <Table
          data={activities.map((item) => ({
            ...item,
            id: item._id,
            dateLabel: formatDate(item.createdAt)
          }))}
          emptyText="Todavia no tienes actividad registrada"
          columns={[
            { key: 'dateLabel', header: 'Fecha' },
            { key: 'type', header: 'Tipo' },
            { key: 'summary', header: 'Resumen' }
          ]}
        />
      </Card> : null}
    </PageShell>
  );
}
