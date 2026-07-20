import { Archive, ArrowLeft, CalendarDays, Gift, MessageSquare, Save, Send, Share2, Star, StickyNote } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addContactNote,
  createCommercialRelation,
  createReferral,
  createReviewRequest,
  createConversation,
  deleteContact,
  deleteCommercialRelation,
  getContact,
  getContactReputation,
  getContactTimeline,
  getCommercialRelations,
  getConversations,
  getAppointments,
  getCustomFields,
  getCoupons,
  getOpportunities,
  getReferralPrograms,
  getTags,
  getUsers,
  issueCoupon,
  updateContact
} from '../../api.js';
import { AssigneeSelect, assignableUsers } from '../../components/AssigneeSelect.jsx';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CommercialRelationsCard } from '../../components/CommercialRelationsCard.jsx';
import { MarketingAttributionCard } from '../../components/MarketingAttributionCard.jsx';
import { CommunicationPreferencesCard } from '../../components/CommunicationPreferencesCard.jsx';
import {
  CrmLoadError,
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
  const { user, access } = useAuth();
  const [contact, setContact] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [tags, setTags] = useState([]);
  const [fields, setFields] = useState([]);
  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [relations, setRelations] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [reputation, setReputation] = useState({
    reviews: [],
    reviewRequests: [],
    couponRedemptions: [],
    referrals: []
  });
  const [coupons, setCoupons] = useState([]);
  const [referralPrograms, setReferralPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const permissions = new Set(access.permissions || []);
  const canUpdateContact = [
    'contacts:manage',
    'contacts:update_team',
    'contacts:update_assigned'
  ].some((permission) => permissions.has(permission));
  const canEditDetails = [
    'contacts:manage',
    'contacts:update_team'
  ].some((permission) => permissions.has(permission));
  const canAddNote = [
    'notes:manage',
    'notes:create_team',
    'notes:create_assigned',
    'contacts:notes'
  ].some((permission) => permissions.has(permission));
  const modules = new Set(access.modules || []);
  const canReadOpportunities = modules.has('opportunities') && [
    'opportunities:manage',
    'opportunities:read_team',
    'opportunities:read_assigned'
  ].some((permission) => permissions.has(permission));
  const canManageRelations = [
    'contacts:manage',
    'contacts:update_team',
    'contacts:update_assigned'
  ].some((permission) => permissions.has(permission)) && [
    'opportunities:manage',
    'opportunities:update_team',
    'opportunities:update_assigned'
  ].some((permission) => permissions.has(permission)) && canReadOpportunities;
  const canReadAttribution = [
    'attribution:read',
    'attribution:read_team',
    'attribution:read_assigned'
  ].some((permission) => permissions.has(permission));

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [
        contactData,
        timelineData,
        tagData,
        fieldData,
        userData,
        conversationData,
        appointmentData,
        relationData,
        opportunityData,
        reputationData,
        couponData,
        referralProgramData
      ] = await Promise.all([
        getContact(id), getContactTimeline(id), getTags('contact'), getCustomFields('contact'),
        user.role === 'CALLCENTER' ? Promise.resolve([]) : getUsers(),
        getConversations({ contactId: id }),
        getAppointments({ contactId: id }),
        canReadOpportunities ? getCommercialRelations({ contactId: id }) : Promise.resolve([]),
        canReadOpportunities ? getOpportunities() : Promise.resolve([]),
        getContactReputation(id),
        getCoupons(),
        user.role === 'ADMIN' ? getReferralPrograms() : Promise.resolve([])
      ]);
      setContact(contactData); setTimeline(timelineData); setTags(tagData);
      setFields(fieldData.filter((field) => field.status === 'active')); setUsers(userData);
      setConversations(conversationData);
      setAppointments(appointmentData);
      setRelations(relationData);
      setOpportunities(opportunityData);
      setReputation(reputationData);
      setCoupons(couponData);
      setReferralPrograms(referralProgramData);
    } catch (requestError) { setLoadError(requestError.message); }
    finally { setLoading(false); }
  }, [id, user.role, canReadOpportunities]);

  useEffect(() => { load(); }, [load]);

  async function save(event) {
    event.preventDefault();
    if (!canUpdateContact) return;
    setBusy(true); setError('');
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

  async function createRelation(payload) {
    setBusy(true); setError('');
    try {
      const { targetId, ...metadata } = payload;
      await createCommercialRelation({
        contactId: id,
        opportunityId: targetId,
        ...metadata
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

  async function requestReview() {
    setBusy(true); setError('');
    try {
      const request = await createReviewRequest({ contactId: id, channel: 'manual' });
      await navigator.clipboard.writeText(request.publicUrl).catch(() => {});
      setNotice('Solicitud creada. El link publico fue copiado.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function issueContactCoupon() {
    const active = coupons.filter((coupon) => coupon.status === 'active');
    const couponId = window.prompt(
      `ID del cupon a emitir:\n${active.map((coupon) => `${coupon._id} | ${coupon.code} - ${coupon.name}`).join('\n')}`
    );
    if (!couponId) return;
    setBusy(true); setError('');
    try {
      await issueCoupon(couponId, id);
      setNotice('Cupon emitido.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function createContactReferral() {
    const active = referralPrograms.filter((program) => program.status === 'active');
    const referralProgramId = window.prompt(
      `ID del programa:\n${active.map((program) => `${program._id} | ${program.name}`).join('\n')}`
    );
    if (!referralProgramId) return;
    setBusy(true); setError('');
    try {
      await createReferral({ referralProgramId, referrerContactId: id });
      setNotice('Referido creado.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageShell eyebrow="CRM" title="Ficha de contacto"><CrmLoading /></PageShell>;
  if (loadError) return <PageShell eyebrow="CRM" title="Ficha de contacto"><CrmLoadError message={loadError} onRetry={load} /></PageShell>;
  return (
    <PageShell eyebrow="CRM" title={contact?.name || 'Contacto'} description="Ficha operativa, campos personalizados y timeline comercial.">
      <div><Button as={Link} to="/crm/contacts" variant="secondary"><ArrowLeft className="h-4 w-4" />Volver</Button></div>
      <CrmNotice notice={notice} error={error} />
      {contact ? <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
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
              <label className="text-xs font-semibold text-slate-600">Responsable<AssigneeSelect options={assignableUsers(users)} defaultValue={contact.assignedTo?._id || ''} className={inputClass} /></label>
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
            <div className="md:col-span-2 flex gap-3">{canUpdateContact ? <Button type="submit" disabled={busy}><Save className="h-4 w-4" />Guardar</Button> : null}{user.role === 'ADMIN' && permissions.has('contacts:manage') ? <Button variant="danger" onClick={archive} disabled={busy}><Archive className="h-4 w-4" />Archivar</Button> : null}</div>
          </form>
        </Card>
        <div className="space-y-6">
          <CommunicationPreferencesCard contactId={id} />
          {canReadAttribution ? <MarketingAttributionCard attribution={contact.attribution} /> : null}
          {canReadOpportunities ? <CommercialRelationsCard
            context="contact"
            primaryRecords={opportunities.filter((opportunity) => opportunity.contactId?._id === id)}
            relations={relations}
            options={opportunities}
            busy={busy}
            canManage={canManageRelations}
            onCreate={createRelation}
            onDelete={removeRelation}
          /> : null}
          <Card>
            <CardHeader title="Reputacion y fidelizacion" description="Acciones vinculadas a este contacto" />
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={requestReview}><Send className="h-4 w-4" />Solicitar resena</Button>
                <Button disabled={busy || !coupons.some((coupon) => coupon.status === 'active')} variant="secondary" onClick={issueContactCoupon}><Gift className="h-4 w-4" />Emitir cupon</Button>
                {user.role === 'ADMIN' ? <Button disabled={busy || !referralPrograms.some((program) => program.status === 'active')} variant="secondary" onClick={createContactReferral}><Share2 className="h-4 w-4" />Crear referido</Button> : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">Resenas</p><p className="mt-1 text-2xl font-semibold">{reputation.reviews.length}</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">Solicitudes</p><p className="mt-1 text-2xl font-semibold">{reputation.reviewRequests.length}</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">Cupones</p><p className="mt-1 text-2xl font-semibold">{reputation.couponRedemptions.length}</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">Referidos</p><p className="mt-1 text-2xl font-semibold">{reputation.referrals.length}</p></div>
              </div>
              {reputation.reviews.slice(0, 3).map((review) => <div key={review._id} className="rounded-lg border border-slate-200 p-3"><div className="flex items-center gap-1 text-amber-500">{Array.from({ length: review.rating }, (_, index) => <Star key={index} className="h-4 w-4 fill-current" />)}</div><p className="mt-2 text-sm text-slate-600">{review.comment}</p></div>)}
            </div>
          </Card>
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
          {canAddNote ? <Card>
            <CardHeader title="Agregar nota" />
            <form onSubmit={note} className="space-y-3 p-5"><textarea required name="text" maxLength="5000" className={`${inputClass} min-h-28`} placeholder="Resultado de llamada, objecion o siguiente paso" /><Button type="submit" disabled={busy}><StickyNote className="h-4 w-4" />Guardar nota</Button></form>
          </Card> : null}
          <Card>
            <CardHeader title="Timeline" description={`${timeline.length} eventos relacionados`} />
            <div className="scrollbar-thin max-h-[60vh] space-y-3 overflow-y-auto p-5">
              {timeline.map((entry, index) => <div key={`${entry.kind}-${entry.item._id}-${index}`} className="border-l-2 border-cyan-200 pl-4"><p className="text-sm font-medium text-slate-800">{timelineText(entry)}</p><p className="mt-1 text-xs text-slate-500">{localDate(entry.date)} - {entry.item.createdBy?.name || entry.item.userId?.name || 'Sistema'}</p></div>)}
              {!timeline.length ? <p className="text-sm text-slate-500">Sin actividad relacionada.</p> : null}
            </div>
          </Card>
        </div>
      </div> : null}
    </PageShell>
  );
}
