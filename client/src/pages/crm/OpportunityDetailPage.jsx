import { ArrowLeft, CalendarDays, MessageSquare, Save, StickyNote, ThumbsDown, Trophy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  createCommercialRelation,
  createNote,
  deleteCommercialRelation,
  getAppointments,
  getCommercialRelations,
  getContacts,
  getCustomFields,
  getOpportunity,
  getOpportunityTimeline,
  getPipelines,
  getTags,
  getUsers,
  markOpportunityLost,
  markOpportunityWon,
  updateOpportunity
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CommercialRelationsCard } from '../../components/CommercialRelationsCard.jsx';
import { MarketingAttributionCard } from '../../components/MarketingAttributionCard.jsx';
import {
  CrmLoadError,
  CrmLoading,
  CrmNotice,
  CustomFieldInput,
  customFieldsFromForm,
  dateTimeLocal,
  inputClass,
  localDate,
  money
} from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

function eventText(entry) {
  if (entry.kind === 'activity') return entry.item.summary;
  if (entry.kind === 'note') return `Nota: ${entry.item.text}`;
  if (entry.kind === 'task') return `Tarea: ${entry.item.title} (${entry.item.status})`;
  if (entry.kind === 'appointment') return `Cita: ${entry.item.title} (${entry.item.status})`;
  return entry.kind;
}

export function OpportunityDetailPage() {
  const { id } = useParams();
  const { user, access } = useAuth();
  const [item, setItem] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [users, setUsers] = useState([]);
  const [fields, setFields] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [relations, setRelations] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const permissions = new Set(access.permissions || []);
  const canUpdateOpportunity = [
    'opportunities:manage',
    'opportunities:update_team',
    'opportunities:update_assigned'
  ].some((permission) => permissions.has(permission));
  const canEditDetails = [
    'opportunities:manage',
    'opportunities:update_team'
  ].some((permission) => permissions.has(permission));
  const canAddNote = [
    'notes:manage',
    'notes:create_team',
    'notes:create_assigned'
  ].some((permission) => permissions.has(permission));
  const modules = new Set(access.modules || []);
  const canReadContacts = modules.has('contacts') && [
    'contacts:manage',
    'contacts:read_team',
    'contacts:read_assigned'
  ].some((permission) => permissions.has(permission));
  const canManageRelations = [
    'contacts:manage',
    'contacts:update_team',
    'contacts:update_assigned'
  ].some((permission) => permissions.has(permission)) && [
    'opportunities:manage',
    'opportunities:update_team',
    'opportunities:update_assigned'
  ].some((permission) => permissions.has(permission)) && canReadContacts;
  const canReadAttribution = [
    'attribution:read',
    'attribution:read_team',
    'attribution:read_assigned'
  ].some((permission) => permissions.has(permission));

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [
        opportunity,
        timelineData,
        pipelineData,
        userData,
        fieldData,
        appointmentData,
        contactData,
        relationData,
        tagData
      ] = await Promise.all([
        getOpportunity(id), getOpportunityTimeline(id), getPipelines(),
        user.role === 'CALLCENTER' ? Promise.resolve([]) : getUsers(),
        getCustomFields('opportunity'),
        getAppointments({ opportunityId: id }),
        canReadContacts ? getContacts({ limit: 500 }) : Promise.resolve([]),
        canReadContacts ? getCommercialRelations({ opportunityId: id }) : Promise.resolve([]),
        getTags('opportunity')
      ]);
      setItem(opportunity); setTimeline(timelineData); setPipelines(pipelineData);
      setUsers(userData); setFields(fieldData.filter((field) => field.status === 'active'));
      setAppointments(appointmentData);
      setContacts(contactData); setRelations(relationData); setTags(tagData);
    } catch (requestError) { setLoadError(requestError.message); }
    finally { setLoading(false); }
  }, [id, user.role, canReadContacts]);
  useEffect(() => { load(); }, [load]);

  async function mutate(action, message) {
    setBusy(true); setError('');
    try { await action(); setNotice(message); await load(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function save(event) {
    event.preventDefault();
    if (!canUpdateOpportunity) return;
    const data = new FormData(event.currentTarget);
    const payload = {
      status: data.get('status'),
      stageId: data.get('stageId'),
      probability: Number(data.get('probability') || 0),
      nextFollowUpAt: data.get('nextFollowUpAt') || null,
      lostReason: data.get('lostReason') || ''
    };
    if (canEditDetails) Object.assign(payload, {
      title: data.get('title'),
      value: Number(data.get('value') || 0),
      assignedTo: data.get('assignedTo') || null,
      priority: data.get('priority'),
      expectedCloseDate: data.get('expectedCloseDate') || null,
      tags: data.getAll('tags'),
      customFields: customFieldsFromForm(data, fields)
    });
    await mutate(() => updateOpportunity(id, payload), 'Oportunidad actualizada.');
  }

  async function addNote(event) {
    event.preventDefault(); const form = event.currentTarget; const text = new FormData(form).get('text');
    await mutate(() => createNote({ relatedType: 'opportunity', relatedId: id, text }), 'Nota agregada.');
    form.reset();
  }

  async function createRelation(payload) {
    setBusy(true); setError('');
    try {
      await createCommercialRelation({
        contactId: payload.targetId,
        opportunityId: id,
        relationType: payload.relationType,
        channel: payload.channel,
        campaign: payload.campaign,
        consultedProduct: payload.consultedProduct,
        purchasedProduct: payload.purchasedProduct,
        notes: payload.notes
      });
      setNotice('Relacion comercial creada.');
      await load();
      return true;
    } catch (requestError) { setError(requestError.message); return false; }
    finally { setBusy(false); }
  }

  async function removeRelation(relationId) {
    setBusy(true); setError('');
    try {
      await deleteCommercialRelation(relationId);
      setNotice('Relacion comercial eliminada.');
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  if (loading) return <PageShell eyebrow="CRM" title="Oportunidad"><CrmLoading /></PageShell>;
  if (loadError) return <PageShell eyebrow="CRM" title="Oportunidad"><CrmLoadError message={loadError} onRetry={load} /></PageShell>;
  const pipeline = pipelines.find((current) => current._id === item?.pipelineId?._id);
  return (
    <PageShell eyebrow="CRM" title={item?.title || 'Oportunidad'} description={item ? `${item.contactId?.name} - ${money(item.value, item.currency)}` : ''}>
      <div><Button as={Link} to="/crm/opportunities" variant="secondary"><ArrowLeft className="h-4 w-4" />Volver</Button></div>
      {item?.contactId?._id ? <div><Button as={Link} to={`/inbox?contactId=${item.contactId._id}`} variant="secondary"><MessageSquare className="h-4 w-4" />Conversaciones del contacto</Button></div> : null}
      <div><Button as={Link} to={`/calendar?contactId=${item?.contactId?._id || ''}&opportunityId=${id}&source=crm`}><CalendarDays className="h-4 w-4" />Agendar cita</Button></div>
      <CrmNotice notice={notice} error={error} />
      {item ? <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader title="Datos del deal" action={<Badge tone={item.status}>{item.status}</Badge>} />
          <form onSubmit={save} className="grid gap-4 p-5 md:grid-cols-2">
            {canEditDetails ? <>
              <label className="text-xs font-semibold">Titulo<input name="title" required defaultValue={item.title} className={inputClass} /></label>
              <label className="text-xs font-semibold">Valor<input name="value" type="number" min="0" step="0.01" defaultValue={item.value} className={inputClass} /></label>
              <label className="text-xs font-semibold">Responsable<select name="assignedTo" defaultValue={item.assignedTo?._id || ''} className={inputClass}><option value="">Sin asignar</option>{users.filter((current) => ['SUPERVISOR', 'CALLCENTER'].includes(current.role)).map((current) => <option key={current._id} value={current._id}>{current.name}</option>)}</select></label>
              <label className="text-xs font-semibold">Prioridad<select name="priority" defaultValue={item.priority} className={inputClass}>{['low', 'medium', 'high'].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="text-xs font-semibold">Cierre esperado<input name="expectedCloseDate" type="date" defaultValue={item.expectedCloseDate?.slice(0, 10) || ''} className={inputClass} /></label>
            </> : null}
            <label className="text-xs font-semibold">Etapa<select name="stageId" defaultValue={item.stageId?._id} className={inputClass}>{pipeline?.stages.map((stage) => <option key={stage._id} value={stage._id}>{stage.name}</option>)}</select></label>
            <label className="text-xs font-semibold">Estado<select name="status" defaultValue={item.status} className={inputClass}>{['open', 'won', 'lost', 'archived'].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="text-xs font-semibold">Probabilidad<input name="probability" type="number" min="0" max="100" defaultValue={item.probability} className={inputClass} /></label>
            <label className="text-xs font-semibold">Proximo seguimiento<input name="nextFollowUpAt" type="datetime-local" defaultValue={dateTimeLocal(item.nextFollowUpAt)} className={inputClass} /></label>
            <label className="text-xs font-semibold md:col-span-2">Motivo de perdida<input name="lostReason" defaultValue={item.lostReason || ''} className={inputClass} /></label>
            {canEditDetails ? <fieldset className="md:col-span-2 rounded-md border border-slate-200 p-3"><legend className="px-1 text-xs font-semibold">Tags de oportunidad</legend><div className="flex flex-wrap gap-3">{tags.filter((tag) => tag.status === 'active').map((tag) => <label key={tag._id} className="flex items-center gap-1 text-sm"><input type="checkbox" name="tags" value={tag._id} defaultChecked={item.tags?.some((current) => current._id === tag._id)} />{tag.name}</label>)}</div></fieldset> : null}
            {canEditDetails ? fields.map((field) => <CustomFieldInput key={field._id} field={field} defaultValue={item.customFields?.[field.key]} />) : null}
            {canUpdateOpportunity ? <div className="md:col-span-2 flex flex-wrap gap-3">
              <Button type="submit" disabled={busy}><Save className="h-4 w-4" />Guardar</Button>
              <Button variant="secondary" disabled={busy} onClick={() => mutate(() => markOpportunityWon(id), 'Oportunidad marcada como ganada.')}><Trophy className="h-4 w-4" />Ganada</Button>
              <Button variant="danger" disabled={busy} onClick={() => mutate(() => markOpportunityLost(id, item.lostReason), 'Oportunidad marcada como perdida.')}><ThumbsDown className="h-4 w-4" />Perdida</Button>
            </div> : null}
          </form>
        </Card>
        <div className="space-y-6">
          {canReadAttribution ? <MarketingAttributionCard attribution={item.attribution} /> : null}
          {canReadContacts ? <CommercialRelationsCard
            context="opportunity"
            primaryRecords={item.contactId ? [item.contactId] : []}
            relations={relations}
            options={contacts}
            busy={busy}
            canManage={canManageRelations}
            onCreate={createRelation}
            onDelete={removeRelation}
          /> : null}
          <Card><CardHeader title="Citas vinculadas" /><div className="space-y-3 p-5">{appointments.slice(0, 5).map((appointment) => <div key={appointment._id} className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between"><span className="font-semibold">{appointment.title}</span><Badge tone={appointment.status}>{appointment.status}</Badge></div><p className="mt-1 text-xs text-slate-500">{localDate(appointment.startAt)} - {appointment.assignedTo?.name}</p></div>)}{!appointments.length ? <p className="text-sm text-slate-500">Sin citas asociadas.</p> : null}</div></Card>
          {canAddNote ? <Card><CardHeader title="Nueva nota" /><form onSubmit={addNote} className="space-y-3 p-5"><textarea required name="text" className={`${inputClass} min-h-28`} /><Button type="submit" disabled={busy}><StickyNote className="h-4 w-4" />Agregar nota</Button></form></Card> : null}
          <Card><CardHeader title="Timeline de oportunidad" /><div className="max-h-[600px] space-y-3 overflow-y-auto p-5">{timeline.map((entry, index) => <div key={`${entry.kind}-${entry.item._id}-${index}`} className="border-l-2 border-cyan-200 pl-4"><p className="text-sm font-medium">{eventText(entry)}</p><p className="text-xs text-slate-500">{localDate(entry.date)} - {entry.item.createdBy?.name || entry.item.userId?.name || 'Sistema'}</p></div>)}</div></Card>
        </div>
      </div> : null}
    </PageShell>
  );
}
