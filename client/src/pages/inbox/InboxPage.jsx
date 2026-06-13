import {
  Archive,
  CalendarDays,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  StickyNote,
  UserRoundCheck,
  Wifi,
  WifiOff,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  archiveConversation,
  assignConversation,
  closeConversation,
  connectRealtime,
  createAppointment,
  createConversation,
  createConversationInternalNote,
  getAppointments,
  getCalendars,
  getContacts,
  getConversationMessages,
  getConversations,
  getContactCommunicationStatus,
  getMediaContentObjectUrl,
  getMessageTemplates,
  getOpportunities,
  getTasks,
  getUsers,
  getWorkflowRuns,
  evaluateCommunicationPolicy,
  markConversationRead,
  reopenConversation,
  retryMessage,
  retryMessageMedia,
  sendMessage,
  uploadConversationMedia
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import {
  CrmLoadError,
  CrmLoading,
  CrmNotice,
  inputClass,
  localDate
} from '../../components/CrmCommon.jsx';
import { FormField } from '../../components/FormField.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  buildInboxAppointmentPayload,
  contactDndStatus,
  mergeById,
  templatesForConversation,
  validateMessageDraft
} from '../../utils/inbox.js';

const channelLabel = {
  internal: 'Interno',
  whatsapp_cloud: 'WhatsApp',
  facebook_messenger: 'Messenger',
  instagram_dm: 'Instagram',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  messenger: 'Messenger'
};

function localDateTimeInput(date = new Date(Date.now() + 60 * 60 * 1000)) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function calendarMembers(calendar) {
  return [
    calendar?.ownerUserId,
    ...(calendar?.teamUserIds || [])
  ].filter(Boolean);
}

function DetailSection({ title, error, empty, onRetry, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{title}</p>
      {error ? (
        <div className="mt-2 text-xs text-rose-700">
          <p>{error}</p>
          <button type="button" className="mt-1 font-bold underline" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      ) : children || <p className="mt-2 text-xs text-slate-500">{empty}</p>}
    </div>
  );
}

function MessageMedia({ message, busy, onRetry }) {
  const media = message.media || {};
  const filename = media.filename || media.fileName || 'Adjunto';
  const status = media.status || (media.url ? 'available' : 'none');
  const [storedUrl, setStoredUrl] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    if (status !== 'available' || !media.storageKeyConfigured) {
      setStoredUrl('');
      setLoadError('');
      return undefined;
    }
    getMediaContentObjectUrl(message._id)
      .then((url) => {
        objectUrl = url;
        if (active) setStoredUrl(url);
        else URL.revokeObjectURL(url);
      })
      .catch((requestError) => {
        if (active) setLoadError(requestError.message);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message._id, media.storageKeyConfigured, status]);

  if (status === 'none' && !media.url && !media.providerMediaId && !media.externalMediaId) {
    return null;
  }
  if (status === 'pending') {
    return <p className="mt-2 rounded-md bg-slate-900/10 px-3 py-2 text-xs">Adjunto pendiente de almacenamiento.</p>;
  }
  if (status === 'failed') {
    return (
      <div className="mt-2 rounded-md bg-rose-900/20 px-3 py-2 text-xs">
        <p>No se pudo preparar el adjunto: {media.error || 'error de descarga'}</p>
        {media.providerMediaIdConfigured ? (
          <button type="button" disabled={busy} className="mt-2 font-bold underline" onClick={onRetry}>
            Reintentar descarga
          </button>
        ) : null}
      </div>
    );
  }
  if (loadError) {
    return <p className="mt-2 rounded-md bg-rose-900/20 px-3 py-2 text-xs">No se pudo abrir el adjunto: {loadError}</p>;
  }
  const source = storedUrl || media.url;
  if (media.storageKeyConfigured && !source) {
    return <p className="mt-2 rounded-md bg-slate-900/10 px-3 py-2 text-xs">Cargando adjunto seguro...</p>;
  }
  if (message.type === 'image' && source) {
    return <img src={source} alt={filename} className="mt-2 max-h-72 rounded-lg object-contain" />;
  }
  if (message.type === 'audio' && source) {
    return <audio controls src={source} className="mt-2 max-w-full" />;
  }
  if (message.type === 'video' && source) {
    return <video controls src={source} className="mt-2 max-h-72 max-w-full rounded-lg" />;
  }
  if (source) {
    return (
      <a href={source} target="_blank" rel="noreferrer" download={storedUrl ? filename : undefined} className="mt-2 flex items-center gap-2 rounded-md bg-slate-900/10 px-3 py-2 font-semibold underline">
        <FileText className="h-4 w-4" />
        {filename}
      </a>
    );
  }
  return (
    <p className="mt-2 flex items-center gap-2 rounded-md bg-slate-900/10 px-3 py-2 text-xs">
      <ImageIcon className="h-4 w-4" />
      {filename} ({media.mimeType || message.type})
    </p>
  );
}

function AppointmentModal({
  user,
  conversation,
  calendars,
  loading,
  error,
  busy,
  onClose,
  onRetry,
  onCreate
}) {
  const [calendarId, setCalendarId] = useState('');
  const selectedCalendar =
    calendars.find((item) => item._id === calendarId) || calendars[0] || null;
  const members = calendarMembers(selectedCalendar);

  useEffect(() => {
    if (!calendarId && calendars[0]?._id) setCalendarId(calendars[0]._id);
  }, [calendarId, calendars]);

  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await onCreate(
      buildInboxAppointmentPayload({
        conversation,
        calendar: selectedCalendar,
        actorId: user._id,
        title: data.get('title'),
        startAt: data.get('startAt'),
        durationMinutes: data.get('duration'),
        assignedTo: data.get('assignedTo')
      })
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
      <Card className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto p-5" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-slate-900">Agendar desde la conversacion</p>
            <p className="text-sm text-slate-500">Contacto: {conversation.contactId?.name}</p>
          </div>
          <Button variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        {loading ? <div className="mt-4"><CrmLoading label="Cargando calendarios..." /></div> : null}
        {!loading && error ? <div className="mt-4"><CrmLoadError message={error} onRetry={onRetry} /></div> : null}
        {!loading && !error && !calendars.length ? (
          <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            No hay calendarios activos dentro de tu alcance.
          </p>
        ) : null}
        {!loading && !error && selectedCalendar ? (
          <form className="mt-4 space-y-3" onSubmit={submit}>
            <FormField label="Calendario" htmlFor="inbox-appointment-calendar">
              <select id="inbox-appointment-calendar" className={inputClass} value={selectedCalendar._id} onChange={(event) => setCalendarId(event.target.value)}>
                {calendars.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </FormField>
            <FormField label="Titulo de la cita" htmlFor="inbox-appointment-title" required>
              <input id="inbox-appointment-title" required name="title" className={inputClass} defaultValue={`Cita con ${conversation.contactId?.name || 'contacto'}`} />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Fecha y hora" htmlFor="inbox-appointment-start" required>
                <input id="inbox-appointment-start" required name="startAt" type="datetime-local" min={localDateTimeInput(new Date())} defaultValue={localDateTimeInput()} className={inputClass} />
              </FormField>
              <FormField label="Duracion (minutos)" htmlFor="inbox-appointment-duration" required>
                <input id="inbox-appointment-duration" required name="duration" type="number" min="5" max="1440" defaultValue={selectedCalendar.settings?.appointmentDurationMinutes || 30} className={inputClass} />
              </FormField>
            </div>
            <FormField label="Responsable" htmlFor="inbox-appointment-assignee">
              <select id="inbox-appointment-assignee" name="assignedTo" className={inputClass} defaultValue="">
                <option value="">Responsable del calendario</option>
                {members.map((member) => (
                  <option key={member._id || member} value={member._id || member}>
                    {member.name || 'Usuario del calendario'}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={busy || !members.length}>
                <CalendarDays className="h-4 w-4" />
                {busy ? 'Creando cita...' : 'Crear cita'}
              </Button>
            </div>
          </form>
        ) : null}
      </Card>
    </div>
  );
}

export function InboxPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [detail, setDetail] = useState({
    appointments: [],
    opportunities: [],
    tasks: [],
    workflows: []
  });
  const [selectedId, setSelectedId] = useState(searchParams.get('conversationId') || '');
  const [filters, setFilters] = useState(() => ({
    contactId: searchParams.get('contactId') || '',
    status: '',
    channel: '',
    assignedTo: '',
    priority: '',
    unread: '',
    search: ''
  }));
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [calendarsLoading, setCalendarsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [appointmentBusy, setAppointmentBusy] = useState(false);
  const [showAppointment, setShowAppointment] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [conversationsError, setConversationsError] = useState('');
  const [messagesError, setMessagesError] = useState('');
  const [templatesError, setTemplatesError] = useState('');
  const [supportErrors, setSupportErrors] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [calendarsError, setCalendarsError] = useState('');
  const [composerError, setComposerError] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [messageText, setMessageText] = useState('');
  const [messageType, setMessageType] = useState('text');
  const [mediaUrl, setMediaUrl] = useState('');
  const [messageFile, setMessageFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [quickReplyId, setQuickReplyId] = useState('');
  const [providerTemplateId, setProviderTemplateId] = useState('');
  const [messageCategory, setMessageCategory] = useState('reply');
  const [communication, setCommunication] = useState(null);
  const [communicationLoading, setCommunicationLoading] = useState(false);
  const [communicationError, setCommunicationError] = useState('');
  const messagesRequest = useRef(0);
  const detailRequest = useRef(0);

  const selected = conversations.find((item) => item._id === selectedId) || null;
  const canAssign = user.role !== 'CALLCENTER';
  const canClose = user.role !== 'CALLCENTER';
  const canCreate = user.role !== 'CALLCENTER';

  const loadConversations = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setConversationsError('');
    try {
      const data = await getConversations(filters);
      setConversations(data);
      setSelectedId((current) => {
        if (current && data.some((item) => item._id === current)) return current;
        return data[0]?._id || '';
      });
    } catch (requestError) {
      setConversationsError(requestError.message);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [filters]);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError('');
    try {
      setTemplates(await getMessageTemplates({ status: 'active' }));
    } catch (requestError) {
      setTemplates([]);
      setTemplatesError(requestError.message);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  const loadSupportLists = useCallback(async () => {
    const entries = [
      ['users', canAssign ? getUsers() : Promise.resolve([])],
      ['contacts', canCreate ? getContacts({ limit: 500 }) : Promise.resolve([])]
    ];
    const results = await Promise.allSettled(entries.map(([, promise]) => promise));
    const errors = {};
    results.forEach((result, index) => {
      const key = entries[index][0];
      if (result.status === 'fulfilled') {
        if (key === 'users') {
          setUsers(
            user.role === 'SUPERVISOR'
              ? [user, ...result.value.filter((item) => item._id !== user._id)]
              : result.value
          );
        }
        if (key === 'contacts') setContacts(result.value);
      } else {
        errors[key] = result.reason.message;
      }
    });
    setSupportErrors(errors);
  }, [canAssign, canCreate, user]);

  const loadMessages = useCallback(async (showLoader = true) => {
    const requestId = ++messagesRequest.current;
    if (!selectedId) {
      setMessages([]);
      setMessagesError('');
      setMessagesLoading(false);
      return;
    }
    if (showLoader) setMessagesLoading(true);
    setMessagesError('');
    try {
      const data = await getConversationMessages(selectedId);
      if (requestId === messagesRequest.current) setMessages(data);
    } catch (requestError) {
      if (requestId === messagesRequest.current) setMessagesError(requestError.message);
    } finally {
      if (showLoader && requestId === messagesRequest.current) setMessagesLoading(false);
    }
  }, [selectedId]);

  const loadDetail = useCallback(async () => {
    const requestId = ++detailRequest.current;
    const contactId = selected?.contactId?._id;
    if (!contactId) {
      setDetail({ appointments: [], opportunities: [], tasks: [], workflows: [] });
      setDetailErrors({});
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    setDetailErrors({});
    const entries = [
      ['appointments', getAppointments({ contactId, from: new Date().toISOString(), limit: 10 })],
      ['opportunities', getOpportunities({ contactId })],
      ['tasks', getTasks({ relatedType: 'contact', relatedId: contactId })]
    ];
    if (user.role !== 'CALLCENTER') {
      entries.push(['workflows', getWorkflowRuns({ entityType: 'contact', entityId: contactId, limit: 10 })]);
    }
    const results = await Promise.allSettled(entries.map(([, promise]) => promise));
    if (requestId !== detailRequest.current) return;
    const next = { appointments: [], opportunities: [], tasks: [], workflows: [] };
    const errors = {};
    results.forEach((result, index) => {
      const key = entries[index][0];
      if (result.status === 'fulfilled') next[key] = result.value;
      else errors[key] = result.reason.message;
    });
    next.appointments = next.appointments
      .filter((item) => ['scheduled', 'confirmed'].includes(item.status))
      .slice(0, 5);
    setDetail(next);
    setDetailErrors(errors);
    setDetailLoading(false);
  }, [selected?.contactId?._id, user.role]);

  const loadCommunication = useCallback(async () => {
    const contactId = selected?.contactId?._id;
    if (!contactId || !selectedId || selected?.channel === 'internal') {
      setCommunication(selected?.channel === 'internal'
        ? { globalDnd: false, policy: { allowed: true, reasonCode: 'INTERNAL' } }
        : null);
      setCommunicationError('');
      setCommunicationLoading(false);
      return;
    }
    setCommunicationLoading(true);
    setCommunicationError('');
    try {
      const [status, policy] = await Promise.all([
        getContactCommunicationStatus(contactId, {
          channel: selected.channel,
          conversationId: selectedId
        }),
        evaluateCommunicationPolicy({
          contactId,
          channel: selected.channel,
          conversationId: selectedId,
          category: messageCategory
        })
      ]);
      setCommunication({ ...status, policy });
    } catch (requestError) {
      setCommunication(null);
      setCommunicationError(requestError.message);
    } finally {
      setCommunicationLoading(false);
    }
  }, [
    messageCategory,
    selected?.channel,
    selected?.contactId?._id,
    selected?.lastInboundAt,
    selectedId
  ]);

  const applyConversation = useCallback((updated) => {
    if (!updated?._id) return;
    setConversations((current) =>
      current.map((item) => item._id === updated._id ? updated : item)
    );
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => {
    loadTemplates();
    loadSupportLists();
  }, [loadSupportLists, loadTemplates]);
  useEffect(() => {
    loadMessages();
    if (!selectedId) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('conversationId', selectedId);
      return next;
    }, { replace: true });
    markConversationRead(selectedId).then(applyConversation).catch(() => null);
  }, [applyConversation, loadMessages, selectedId, setSearchParams]);
  useEffect(() => { loadDetail(); }, [loadDetail]);
  useEffect(() => { loadCommunication(); }, [loadCommunication]);
  useEffect(() => {
    const disconnect = connectRealtime(
      (realtimeEvent) => {
        if (realtimeEvent.event === 'notification.created') {
          window.dispatchEvent(new CustomEvent('tenantdesk:notifications-changed'));
        }
        if (
          [
            'conversation.created',
            'conversation.updated',
            'conversation.assigned',
            'conversation.closed',
            'message.created',
            'message.status_updated',
            'internal_note.created'
          ].includes(realtimeEvent.event)
        ) {
          loadConversations(false);
          if (realtimeEvent.data?.conversationId === selectedId) loadMessages(false);
        }
        if (
          realtimeEvent.event === 'appointment.created' &&
          realtimeEvent.data?.appointmentId
        ) {
          loadDetail();
        }
      },
      setRealtimeStatus
    );
    return disconnect;
  }, [loadConversations, loadDetail, loadMessages, selectedId]);

  const templateGroups = useMemo(
    () => templatesForConversation(templates, selected?.channel),
    [selected?.channel, templates]
  );
  const legacyDnd = contactDndStatus(selected?.contactId);
  const dnd = {
    configured: communication ? true : legacyDnd.configured,
    active: communication?.globalDnd ?? legacyDnd.active
  };
  const selectedTemplateId = providerTemplateId || quickReplyId;
  const composerBlocked =
    !selected ||
    ['resolved', 'closed', 'archived'].includes(selected.status) ||
    (
      selected.channel !== 'internal' &&
      (
        communicationLoading ||
        Boolean(communicationError) ||
        communication?.policy?.allowed === false
      )
    );

  async function mutateConversation(action, success, { remove = false } = {}) {
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      const updated = await action();
      if (remove) {
        setConversations((current) => {
          const next = current.filter((item) => item._id !== updated._id);
          setSelectedId(next[0]?._id || '');
          return next;
        });
      } else {
        applyConversation(updated);
      }
      setNotice(success);
      return true;
    } catch (requestError) {
      setActionError(requestError.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitMessage(event) {
    event.preventDefault();
    const draftError = validateMessageDraft({
      text: messageText,
      type: messageType,
      templateId: selectedTemplateId,
      mediaUrl,
      fileSize: messageFile?.size || 0,
      conversationStatus: selected?.status,
      dndActive: dnd.active,
      channel: selected?.channel,
      category: messageCategory,
      policyAllowed: communication?.policy?.allowed !== false,
      policyReason: communication?.policy?.reasonMessage
    });
    if (draftError) {
      setComposerError(draftError);
      return;
    }
    setSending(true);
    setComposerError('');
    setActionError('');
    setNotice('');
    try {
      const sent = messageFile
        ? await uploadConversationMedia(selectedId, messageFile, messageText, messageCategory)
        : await sendMessage(selectedId, {
            text: messageText,
            type: messageType,
            category: messageCategory,
            templateId: selectedTemplateId || undefined,
            media: mediaUrl ? { url: mediaUrl, status: 'available' } : undefined
          });
      setMessages((current) => mergeById(current, [sent]));
      setConversations((current) => current.map((item) =>
        item._id === selectedId
          ? {
              ...item,
              lastMessage: sent.text || `[${sent.type}]`,
              lastMessageAt: sent.createdAt,
              updatedAt: sent.createdAt
            }
          : item
      ));
      setMessageText('');
      setMessageType('text');
      setMediaUrl('');
      setMessageFile(null);
      setQuickReplyId('');
      setProviderTemplateId('');
      setFileInputKey((value) => value + 1);
      setNotice('Mensaje procesado.');
      await loadMessages(false);
    } catch (requestError) {
      setComposerError(requestError.message);
    } finally {
      setSending(false);
    }
  }

  async function submitNote(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = new FormData(form).get('note');
    setBusy(true);
    setActionError('');
    try {
      const note = await createConversationInternalNote(selectedId, text);
      setMessages((current) => mergeById(current, [note]));
      form.reset();
      setNotice('Nota interna creada.');
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function runMessageAction(action, success) {
    setBusy(true);
    setActionError('');
    try {
      const message = await action();
      setMessages((current) => mergeById(current, [message]));
      setNotice(success);
      await loadMessages(false);
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function createInternal(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setActionError('');
    try {
      const created = await createConversation({
        contactId: data.get('contactId'),
        assignedTo: data.get('assignedTo') || null,
        channel: 'internal'
      });
      form.reset();
      setConversations((current) => [created, ...current.filter((item) => item._id !== created._id)]);
      setSelectedId(created._id);
      setNotice('Conversacion interna abierta.');
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadCalendars() {
    setCalendarsLoading(true);
    setCalendarsError('');
    try {
      setCalendars(await getCalendars({ status: 'active' }));
    } catch (requestError) {
      setCalendars([]);
      setCalendarsError(requestError.message);
    } finally {
      setCalendarsLoading(false);
    }
  }

  async function openAppointment() {
    setShowAppointment(true);
    await loadCalendars();
  }

  async function createInboxAppointment(payload) {
    setAppointmentBusy(true);
    setCalendarsError('');
    try {
      await createAppointment(payload);
      setShowAppointment(false);
      setNotice('Cita creada sin salir de la conversacion.');
      await loadDetail();
    } catch (requestError) {
      setCalendarsError(requestError.message);
    } finally {
      setAppointmentBusy(false);
    }
  }

  return (
    <PageShell
      eyebrow="Inbox omnicanal"
      title={user.role === 'CALLCENTER' ? 'Mis conversaciones' : 'Conversaciones'}
      description="Mensajes, asignaciones y notas internas con alcance por rol."
    >
      <CrmNotice notice={notice} error={actionError} />
      <div className="mb-3 flex justify-end">
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
          realtimeStatus === 'connected'
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-amber-50 text-amber-700'
        }`}>
          {realtimeStatus === 'connected' ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {realtimeStatus === 'connected' ? 'Tiempo real conectado' : 'Tiempo real no disponible; usa Actualizar'}
        </span>
      </div>

      <Card>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-7">
          <label className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input className={`${inputClass} pl-9`} value={filters.search} onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} placeholder="Contacto o mensaje" />
          </label>
          <select className={inputClass} value={filters.channel} onChange={(event) => setFilters((value) => ({ ...value, channel: event.target.value }))}>
            <option value="">Todos los canales</option>
            {['internal', 'whatsapp_cloud', 'facebook_messenger', 'instagram_dm', 'email', 'sms'].map((value) => <option key={value} value={value}>{channelLabel[value]}</option>)}
          </select>
          <select className={inputClass} value={filters.status} onChange={(event) => setFilters((value) => ({ ...value, status: event.target.value }))}>
            <option value="">Todos los estados</option>
            {['open', 'pending', 'resolved', 'closed'].map((value) => <option key={value}>{value}</option>)}
          </select>
          {canAssign ? (
            <select className={inputClass} value={filters.assignedTo} onChange={(event) => setFilters((value) => ({ ...value, assignedTo: event.target.value }))}>
              <option value="">Todos los responsables</option>
              {users.filter((item) => ['SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
          ) : null}
          <select className={inputClass} value={filters.priority} onChange={(event) => setFilters((value) => ({ ...value, priority: event.target.value }))}>
            <option value="">Todas las prioridades</option>
            {['low', 'medium', 'high'].map((value) => <option key={value}>{value}</option>)}
          </select>
          <select className={inputClass} value={filters.unread} onChange={(event) => setFilters((value) => ({ ...value, unread: event.target.value }))}>
            <option value="">Leidas y no leidas</option>
            <option value="true">Solo no leidas</option>
          </select>
          <Button variant="secondary" onClick={() => Promise.allSettled([loadConversations(), loadMessages(), loadDetail()])}>
            <RefreshCw className="h-4 w-4" />Actualizar
          </Button>
        </div>
      </Card>

      {canCreate ? (
        <Card>
          <form className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={createInternal}>
            <select required name="contactId" className={inputClass}>
              <option value="">Crear conversacion interna para...</option>
              {contacts.map((contact) => <option key={contact._id} value={contact._id}>{contact.name}</option>)}
            </select>
            <select name="assignedTo" className={inputClass}>
              <option value="">Usar responsable del contacto</option>
              {users.filter((item) => ['SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
            <Button type="submit" disabled={busy}><MessageSquare className="h-4 w-4" />Crear interna</Button>
          </form>
          {supportErrors.contacts || supportErrors.users ? (
            <p className="px-4 pb-4 text-xs text-rose-700">
              No se pudieron cargar todos los contactos o responsables.{' '}
              <button type="button" className="font-bold underline" onClick={loadSupportLists}>Reintentar</button>
            </p>
          ) : null}
        </Card>
      ) : null}

      {loading ? <CrmLoading label="Cargando conversaciones..." /> : (
        <div className="grid min-h-[650px] gap-4 xl:grid-cols-[340px_1fr]">
          <Card className="overflow-hidden">
            {conversationsError ? <div className="p-4"><CrmLoadError message={conversationsError} onRetry={loadConversations} /></div> : null}
            <div className="max-h-[900px] overflow-y-auto">
              {conversations.map((conversation) => (
                <button
                  key={conversation._id}
                  className={`w-full border-b border-slate-100 p-4 text-left transition hover:bg-slate-50 ${selectedId === conversation._id ? 'bg-cyan-50' : ''}`}
                  onClick={() => setSelectedId(conversation._id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{conversation.contactId?.name || 'Contacto no disponible'}</p>
                      <p className="text-xs text-slate-500">{channelLabel[conversation.channel] || conversation.channel} - {conversation.assignedTo?.name || 'Sin asignar'}</p>
                    </div>
                    {conversation.unreadCount ? <span className="rounded-full bg-cyan-700 px-2 py-0.5 text-xs font-bold text-white">{conversation.unreadCount}</span> : null}
                  </div>
                  <p className="mt-2 truncate text-sm text-slate-600">{conversation.lastMessage || 'Sin mensajes'}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <Badge tone={conversation.status}>{conversation.status}</Badge>
                    <span className="text-xs text-slate-400">{localDate(conversation.lastMessageAt)}</span>
                  </div>
                </button>
              ))}
              {!conversations.length && !conversationsError ? <div className="p-8 text-center text-sm text-slate-500">No hay conversaciones para estos filtros.</div> : null}
            </div>
          </Card>

          <Card className="flex min-h-[650px] flex-col overflow-hidden">
            {selected ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
                  <div>
                    <Link to={`/crm/contacts/${selected.contactId?._id}`} className="font-semibold text-cyan-800 hover:underline">{selected.contactId?.name}</Link>
                    <p className="text-xs text-slate-500">{selected.contactId?.phone || selected.contactId?.email || 'Sin telefono o email'} - {channelLabel[selected.channel] || selected.channel}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={openAppointment}><CalendarDays className="h-4 w-4" />Agendar</Button>
                    {canAssign ? (
                      <select disabled={busy} className="rounded-md border border-slate-200 px-2 text-sm" value={selected.assignedTo?._id || ''} onChange={(event) => mutateConversation(() => assignConversation(selected._id, event.target.value), 'Conversacion asignada.')}>
                        <option value="">Sin asignar</option>
                        {users.filter((item) => ['SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                      </select>
                    ) : null}
                    {canClose && ['closed', 'resolved'].includes(selected.status) ? (
                      <Button variant="secondary" disabled={busy} onClick={() => mutateConversation(() => reopenConversation(selected._id), 'Conversacion reabierta.')}><RefreshCw className="h-4 w-4" />Reabrir</Button>
                    ) : null}
                    {canClose && !['closed', 'resolved'].includes(selected.status) ? (
                      <Button variant="secondary" disabled={busy} onClick={() => mutateConversation(() => closeConversation(selected._id), 'Conversacion cerrada.')}><CheckCircle2 className="h-4 w-4" />Cerrar</Button>
                    ) : null}
                    {user.role === 'ADMIN' ? (
                      <Button variant="danger" disabled={busy} onClick={() => mutateConversation(() => archiveConversation(selected._id), 'Conversacion archivada.', { remove: true })}><Archive className="h-4 w-4" /></Button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-2 border-b border-slate-100 bg-slate-50 p-3 md:grid-cols-2 2xl:grid-cols-4">
                  <DetailSection title="Contacto" empty="Sin datos adicionales.">
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      <p>Estado: <strong>{selected.contactId?.status || '-'}</strong></p>
                      <p>Ciclo: <strong>{selected.contactId?.lifecycleStage || '-'}</strong></p>
                      <p>DND: <strong className={dnd.active ? 'text-rose-700' : ''}>{dnd.active ? 'Activo' : dnd.configured ? 'Inactivo' : 'No configurado'}</strong></p>
                      <p>Consentimiento: <strong>{communication?.consents?.[communication?.policy?.evaluatedChannel]?.status || 'unknown'}</strong></p>
                      {communication?.policy?.reasonCode ? <p>Politica: <strong>{communication.policy.reasonCode}</strong></p> : null}
                      <p>Tags: {(selected.contactId?.tags || []).map((tag) => tag.name).join(', ') || 'Sin tags'}</p>
                    </div>
                  </DetailSection>
                  <DetailSection title="Oportunidades" error={detailErrors.opportunities} empty="Sin oportunidades." onRetry={loadDetail}>
                    {detail.opportunities.length ? <div className="mt-2 space-y-1">{detail.opportunities.slice(0, 3).map((item) => <p key={item._id} className="truncate text-xs text-slate-600">{item.title} - {item.status}</p>)}</div> : null}
                  </DetailSection>
                  <DetailSection title="Tareas" error={detailErrors.tasks} empty="Sin tareas." onRetry={loadDetail}>
                    {detail.tasks.length ? <div className="mt-2 space-y-1">{detail.tasks.slice(0, 3).map((item) => <p key={item._id} className="truncate text-xs text-slate-600">{item.title} - {item.status}</p>)}</div> : null}
                  </DetailSection>
                  <DetailSection title="Workflows" error={detailErrors.workflows} empty={user.role === 'CALLCENTER' ? 'No disponible para este rol.' : 'Sin ejecuciones.'} onRetry={loadDetail}>
                    {detail.workflows.length ? <div className="mt-2 space-y-1">{detail.workflows.slice(0, 3).map((item) => <p key={item._id} className="truncate text-xs text-slate-600">{item.workflowId?.name || item.eventType} - {item.status}</p>)}</div> : null}
                  </DetailSection>
                </div>
                {detailLoading ? <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">Actualizando detalle relacionado...</p> : null}
                <div className="border-b border-cyan-100 bg-cyan-50 px-4 py-3">
                  <p className="text-xs font-bold uppercase text-cyan-800">Proximas citas</p>
                  {detailErrors.appointments ? (
                    <p className="mt-2 text-xs text-rose-700">{detailErrors.appointments} <button type="button" className="font-bold underline" onClick={loadDetail}>Reintentar</button></p>
                  ) : detail.appointments.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {detail.appointments.map((appointment) => (
                        <Link key={appointment._id} to={`/calendar?contactId=${selected.contactId?._id}`} className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
                          {localDate(appointment.startAt)} - {appointment.title}
                        </Link>
                      ))}
                    </div>
                  ) : <p className="mt-2 text-xs text-cyan-800">No hay citas proximas.</p>}
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5">
                  {messagesLoading ? <CrmLoading label="Cargando mensajes..." /> : null}
                  {!messagesLoading && messagesError ? <CrmLoadError message={messagesError} onRetry={loadMessages} /> : null}
                  {!messagesLoading && !messagesError ? messages.map((message) => (
                    <div key={message._id} className={`flex ${message.direction === 'outbound' ? 'justify-end' : message.direction === 'internal' ? 'justify-center' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm shadow-sm ${message.direction === 'outbound' ? 'bg-cyan-700 text-white' : message.direction === 'internal' ? 'border border-amber-200 bg-amber-50 text-amber-900' : 'border border-slate-200 bg-white text-slate-800'}`}>
                        {message.direction === 'internal' ? <p className="mb-1 text-xs font-bold uppercase">Nota interna</p> : null}
                        <p className="whitespace-pre-wrap">{message.text || `[${message.type}]`}</p>
                        <MessageMedia message={message} busy={busy} onRetry={() => runMessageAction(() => retryMessageMedia(message._id), 'Descarga reenviada a la cola.')} />
                        <div className={`mt-2 flex items-center gap-2 text-[11px] ${message.direction === 'outbound' ? 'text-cyan-100' : 'text-slate-500'}`}>
                          <span>{message.sentBy?.name || (message.direction === 'inbound' ? selected.contactId?.name : 'Sistema')}</span>
                          <span>{localDate(message.createdAt)}</span>
                          <span>{message.status}</span>
                          {message.status === 'failed' ? <button className="font-bold underline" onClick={() => runMessageAction(() => retryMessage(message._id), 'Reintento creado.')}>Reintentar</button> : null}
                        </div>
                        {message.errorMessage || message.error ? <p className="mt-1 text-xs font-semibold text-rose-200">{message.errorMessage || message.error}</p> : null}
                        {message.reasonCode ? <p className="mt-1 text-[11px] opacity-80">{message.reasonCode}{message.attempts ? ` · intento ${message.attempts}` : ''}</p> : null}
                      </div>
                    </div>
                  )) : null}
                  {!messagesLoading && !messagesError && !messages.length ? <p className="text-center text-sm text-slate-500">Esta conversacion todavia no tiene mensajes.</p> : null}
                </div>

                <div className="grid gap-3 border-t border-slate-100 p-4 lg:grid-cols-2">
                  <form className="space-y-2" onSubmit={submitMessage}>
                    {templatesLoading ? <p className="text-xs text-slate-500">Cargando respuestas rapidas...</p> : null}
                    {templatesError ? (
                      <p className="rounded-md bg-rose-50 p-2 text-xs text-rose-700">
                        No se cargaron las respuestas rapidas: {templatesError}.{' '}
                        <button type="button" className="font-bold underline" onClick={loadTemplates}>Reintentar</button>
                      </p>
                    ) : null}
                    <select
                      className={inputClass}
                      value={quickReplyId}
                      disabled={templatesLoading}
                      onChange={(event) => {
                        const id = event.target.value;
                        const template = templateGroups.quickReplies.find((item) => item._id === id);
                        setQuickReplyId(id);
                        setProviderTemplateId('');
                        if (template) {
                          setMessageText(template.content);
                          setMessageCategory(template.messageCategory || 'reply');
                        }
                      }}
                    >
                      <option value="">Respuesta rapida (opcional)</option>
                      {templateGroups.quickReplies.map((template) => <option key={template._id} value={template._id}>{template.name}</option>)}
                    </select>
                    {!templatesLoading && !templatesError && !templateGroups.quickReplies.length ? <p className="text-xs text-slate-500">No hay respuestas rapidas activas para este canal.</p> : null}
                    {templateGroups.providerTemplates.length ? (
                      <select
                        className={inputClass}
                        value={providerTemplateId}
                        onChange={(event) => {
                          setProviderTemplateId(event.target.value);
                          setQuickReplyId('');
                          const template = templateGroups.providerTemplates.find(
                            (item) => item._id === event.target.value
                          );
                          if (template) setMessageCategory(template.messageCategory || 'commercial');
                        }}
                      >
                        <option value="">Plantilla del proveedor (opcional)</option>
                        {templateGroups.providerTemplates.map((template) => <option key={template._id} value={template._id}>{template.name}</option>)}
                      </select>
                    ) : null}
                    <select className={inputClass} value={messageType} onChange={(event) => setMessageType(event.target.value)}>
                      <option value="text">Texto</option>
                      <option value="image">Imagen por URL publica</option>
                      <option value="document">Documento por URL publica</option>
                      <option value="audio">Audio por URL publica</option>
                      <option value="video">Video por URL publica</option>
                    </select>
                    <select className={inputClass} value={messageCategory} onChange={(event) => setMessageCategory(event.target.value)}>
                      <option value="reply">Respuesta a conversacion</option>
                      <option value="commercial">Comercial</option>
                      <option value="transactional">Transaccional</option>
                      <option value="operational">Operativo</option>
                    </select>
                    <input value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} type="url" className={inputClass} placeholder="URL publica del adjunto (opcional)" />
                    <input key={fileInputKey} type="file" accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,video/mp4,application/pdf" className={inputClass} onChange={(event) => setMessageFile(event.target.files?.[0] || null)} />
                    <textarea value={messageText} onChange={(event) => setMessageText(event.target.value)} className={`${inputClass} min-h-20`} placeholder="Escribe una respuesta. Una respuesta rapida puede completar el contenido." />
                    {composerBlocked ? (
                      <p className="rounded-md bg-amber-50 p-2 text-xs font-medium text-amber-800">
                        {communicationLoading
                          ? 'Evaluando consentimiento y reglas de envio...'
                          : communicationError
                            ? `No se pudo validar el envio: ${communicationError}`
                            : communication?.policy?.reasonMessage ||
                              'La conversacion debe estar abierta para enviar mensajes.'}
                        {communicationError ? <button type="button" className="ml-2 font-bold underline" onClick={loadCommunication}>Reintentar</button> : null}
                      </p>
                    ) : null}
                    {composerError ? <p className="text-xs font-medium text-rose-700">{composerError}</p> : null}
                    <Button type="submit" disabled={sending || composerBlocked}><Send className="h-4 w-4" />{sending ? 'Enviando...' : 'Enviar'}</Button>
                  </form>
                  <form className="space-y-2" onSubmit={submitNote}>
                    <textarea required name="note" className={`${inputClass} min-h-20 border-amber-200 bg-amber-50`} placeholder="Nota interna, no se envia al contacto" />
                    <Button type="submit" variant="secondary" disabled={busy}><StickyNote className="h-4 w-4" />Agregar nota interna</Button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                <UserRoundCheck className="mr-2 h-5 w-5" />Selecciona una conversacion.
              </div>
            )}
          </Card>
        </div>
      )}

      {showAppointment && selected ? (
        <AppointmentModal
          user={user}
          conversation={selected}
          calendars={calendars}
          loading={calendarsLoading}
          error={calendarsError}
          busy={appointmentBusy}
          onClose={() => setShowAppointment(false)}
          onRetry={loadCalendars}
          onCreate={createInboxAppointment}
        />
      ) : null}
    </PageShell>
  );
}
