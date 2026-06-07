import { Archive, ArrowLeft, CalendarDays, MessageSquare, Save, StickyNote } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addContactNote,
  createConversation,
  deleteContact,
  getContact,
  getContactTimeline,
  getConversations,
  getAppointments,
  getCustomFields,
  getTags,
  getUsers,
  updateContact
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import {
  CrmLoading,
  CrmNotice,
  CustomFieldInput,
  customFieldsFromForm,
  dateTimeLocal,
  inputClass,
  localDate
} from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { CONTACT_STATUS_OPTIONS } from '../../utils/contacts.js';

function timelineText(entry) {
  if (entry.kind === 'activity') return entry.item.summary;
  if (entry.kind === 'note') return `Nota: ${entry.item.text}`;
  if (entry.kind === 'task') return `Tarea: ${entry.item.title} (${entry.item.status})`;
  if (entry.kind === 'opportunity') return `Oportunidad creada: ${entry.item.title}`;
  if (entry.kind === 'message') {
    return `${entry.item.direction === 'internal' ? 'Nota interna' : 'Mensaje'}: ${entry.item.text || `[${entry.item.type}]`}`;
  }
  if (entry.kind === 'appointment') return `Cita: ${entry.item.title} (${entry.item.status})`;
  return entry.kind;
}

export function ContactDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contact, setContact] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [tags, setTags] = useState([]);
  const [fields, setFields] = useState([]);
  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const canEditDetails = user.role !== 'CALLCENTER';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [contactData, timelineData, tagData, fieldData, userData, conversationData, appointmentData] = await Promise.all([
        getContact(id), getContactTimeline(id), getTags(), getCustomFields('contact'),
        user.role === 'CALLCENTER' ? Promise.resolve([]) : getUsers(),
        getConversations({ contactId: id }),
        getAppointments({ contactId: id })
      ]);
      setContact(contactData); setTimeline(timelineData); setTags(tagData);
      setFields(fieldData.filter((field) => field.status === 'active')); setUsers(userData);
      setConversations(conversationData);
      setAppointments(appointmentData);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [id, user.role]);

  useEffect(() => { load(); }, [load]);

  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    const payload = {
      status: data.get('status'),
      lastContactAt: data.get('lastContactAt') || null,
      nextFollowUpAt: data.get('nextFollowUpAt') || null,
      followUpStatus: data.get('followUpStatus')
    };
    if (canEditDetails) Object.assign(payload, {
      name: data.get('name'),
      phone: data.get('phone'),
      secondaryPhone: data.get('secondaryPhone'),
      email: data.get('email'),
      source: data.get('source'),
      lifecycleStage: data.get('lifecycleStage'),
      priority: data.get('priority'),
      assignedTo: data.get('assignedTo') || null,
      city: data.get('city'),
      country: data.get('country'),
      tags: data.getAll('tags'),
      customFields: customFieldsFromForm(data, fields)
    });
    try { await updateContact(id, payload); setNotice('Contacto actualizado.'); await load(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function note(event) {
    event.preventDefault(); const form = event.currentTarget; const text = new FormData(form).get('text');
    setBusy(true); setError('');
    try { await addContactNote(id, text); form.reset(); setNotice('Nota agregada.'); await load(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function archive() {
    if (!window.confirm('Archivar este contacto?')) return;
    setBusy(true);
    try { await deleteContact(id); navigate('/crm/contacts'); }
    catch (requestError) { setError(requestError.message); setBusy(false); }
  }

  async function openInternalConversation() {
    setBusy(true); setError('');
    try {
      const conversation = await createConversation({
        contactId: id,
        channel: 'internal',
        assignedTo: contact.assignedTo?._id || null
      });
      navigate(`/inbox?conversationId=${conversation._id}`);
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  if (loading) return <PageShell eyebrow="CRM" title="Ficha de contacto"><CrmLoading /></PageShell>;
  return (
    <PageShell eyebrow="CRM" title={contact?.name || 'Contacto'} description="Ficha operativa, campos personalizados y timeline comercial.">
      <div><Button as={Link} to="/crm/contacts" variant="secondary"><ArrowLeft className="h-4 w-4" />Volver</Button></div>
      <CrmNotice notice={notice} error={error} />
      {contact ? <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader title="Datos del contacto" action={<Badge tone={contact.status}>{contact.status.replaceAll('_', ' ')}</Badge>} />
          <form onSubmit={save} className="grid gap-4 p-5 md:grid-cols-2">
            {canEditDetails ? <>
              <label className="text-xs font-semibold text-slate-600">Nombre<input name="name" required defaultValue={contact.name} className={inputClass} /></label>
              <label className="text-xs font-semibold text-slate-600">Telefono<input name="phone" defaultValue={contact.phone || ''} className={inputClass} /></label>
              <label className="text-xs font-semibold text-slate-600">Telefono secundario<input name="secondaryPhone" defaultValue={contact.secondaryPhone || ''} className={inputClass} /></label>
              <label className="text-xs font-semibold text-slate-600">Email<input type="email" name="email" defaultValue={contact.email || ''} className={inputClass} /></label>
              <label className="text-xs font-semibold text-slate-600">Origen<input name="source" defaultValue={contact.source || ''} className={inputClass} /></label>
              <label className="text-xs font-semibold text-slate-600">Ciclo<select name="lifecycleStage" defaultValue={contact.lifecycleStage} className={inputClass}>{['lead', 'prospect', 'customer', 'lost'].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-600">Prioridad<select name="priority" defaultValue={contact.priority} className={inputClass}>{['low', 'medium', 'high'].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-600">Responsable<select name="assignedTo" defaultValue={contact.assignedTo?._id || ''} className={inputClass}><option value="">Sin asignar</option>{users.filter((item) => ['SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-600">Ciudad<input name="city" defaultValue={contact.city || ''} className={inputClass} /></label>
              <label className="text-xs font-semibold text-slate-600">Pais<input name="country" defaultValue={contact.country || ''} className={inputClass} /></label>
            </> : <div className="md:col-span-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{contact.phone || 'Sin telefono'}<br />{contact.email || 'Sin email'}<br />{contact.source || 'Sin origen'}</div>}
            <label className="text-xs font-semibold text-slate-600">Estado<select name="status" defaultValue={contact.status} className={inputClass}>{CONTACT_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">Estado seguimiento<select name="followUpStatus" defaultValue={contact.followUpStatus || 'pending'} className={inputClass}>{['pending', 'done', 'cancelled'].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">Ultimo contacto<input type="datetime-local" name="lastContactAt" defaultValue={dateTimeLocal(contact.lastContactAt)} className={inputClass} /></label>
            <label className="text-xs font-semibold text-slate-600">Proximo seguimiento<input type="datetime-local" name="nextFollowUpAt" defaultValue={dateTimeLocal(contact.nextFollowUpAt)} className={inputClass} /></label>
            {canEditDetails ? <>
              <fieldset className="md:col-span-2 rounded-md border border-slate-200 p-3"><legend className="px-1 text-xs font-semibold">Tags</legend><div className="flex flex-wrap gap-3">{tags.filter((tag) => tag.status === 'active').map((tag) => <label key={tag._id} className="flex items-center gap-1 text-sm"><input type="checkbox" name="tags" value={tag._id} defaultChecked={contact.tags?.some((current) => current._id === tag._id)} />{tag.name}</label>)}</div></fieldset>
              {fields.map((field) => <CustomFieldInput key={field._id} field={field} defaultValue={contact.customFields?.[field.key]} />)}
            </> : null}
            <div className="md:col-span-2 flex gap-3"><Button type="submit" disabled={busy}><Save className="h-4 w-4" />Guardar</Button>{user.role === 'ADMIN' ? <Button variant="danger" onClick={archive} disabled={busy}><Archive className="h-4 w-4" />Archivar</Button> : null}</div>
          </form>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Conversaciones" description={`${conversations.length} conversaciones vinculadas`} />
            <div className="space-y-3 p-5">
              {conversations.slice(0, 5).map((conversation) => <Link key={conversation._id} to={`/inbox?conversationId=${conversation._id}`} className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50"><div className="flex items-center justify-between"><span className="font-semibold text-slate-800">{conversation.channel}</span><Badge tone={conversation.status}>{conversation.status}</Badge></div><p className="mt-1 truncate text-sm text-slate-500">{conversation.lastMessage || 'Sin mensajes'}</p></Link>)}
              {!conversations.length ? <p className="text-sm text-slate-500">No hay conversaciones asociadas.</p> : null}
              {user.role !== 'CALLCENTER' ? <Button variant="secondary" disabled={busy} onClick={openInternalConversation}><MessageSquare className="h-4 w-4" />Abrir conversacion interna</Button> : null}
            </div>
          </Card>
          <Card>
            <CardHeader
              title="Citas"
              description={`${appointments.length} citas vinculadas`}
              action={<Button as={Link} to={`/calendar?contactId=${id}&source=crm`}><CalendarDays className="h-4 w-4" />Nueva cita</Button>}
            />
            <div className="space-y-3 p-5">
              {appointments.slice(0, 5).map((appointment) => <div key={appointment._id} className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{appointment.title}</span><Badge tone={appointment.status}>{appointment.status}</Badge></div><p className="mt-1 text-xs text-slate-500">{localDate(appointment.startAt)} - {appointment.assignedTo?.name}</p></div>)}
              {!appointments.length ? <p className="text-sm text-slate-500">No hay citas asociadas.</p> : null}
            </div>
          </Card>
          <Card>
            <CardHeader title="Agregar nota" />
            <form onSubmit={note} className="space-y-3 p-5"><textarea required name="text" maxLength="5000" className={`${inputClass} min-h-28`} placeholder="Resultado de llamada, objecion o siguiente paso" /><Button type="submit" disabled={busy}><StickyNote className="h-4 w-4" />Guardar nota</Button></form>
          </Card>
          <Card>
            <CardHeader title="Timeline" description={`${timeline.length} eventos relacionados`} />
            <div className="max-h-[650px] space-y-3 overflow-y-auto p-5">
              {timeline.map((entry, index) => <div key={`${entry.kind}-${entry.item._id}-${index}`} className="border-l-2 border-cyan-200 pl-4"><p className="text-sm font-medium text-slate-800">{timelineText(entry)}</p><p className="mt-1 text-xs text-slate-500">{localDate(entry.date)} - {entry.item.createdBy?.name || entry.item.userId?.name || 'Sistema'}</p></div>)}
              {!timeline.length ? <p className="text-sm text-slate-500">Sin actividad relacionada.</p> : null}
            </div>
          </Card>
        </div>
      </div> : null}
    </PageShell>
  );
}
