import {
  Archive,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  StickyNote,
  UserRoundCheck
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  archiveConversation,
  assignConversation,
  closeConversation,
  createConversation,
  createConversationInternalNote,
  getContacts,
  getConversationMessages,
  getConversations,
  getMessageTemplates,
  getUsers,
  markConversationRead,
  reopenConversation,
  retryMessage,
  sendMessage
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass, localDate } from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

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

export function InboxPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const selected = conversations.find((item) => item._id === selectedId) || null;
  const canAssign = user.role !== 'CALLCENTER';
  const canClose = user.role !== 'CALLCENTER';
  const canCreate = user.role !== 'CALLCENTER';

  const loadConversations = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const [conversationData, templateData, userData, contactData] = await Promise.all([
        getConversations(filters),
        getMessageTemplates(),
        canAssign ? getUsers() : Promise.resolve([]),
        canCreate ? getContacts({ limit: 500 }) : Promise.resolve([])
      ]);
      setConversations(conversationData);
      setTemplates(templateData);
      setUsers(userData);
      setContacts(contactData);
      setSelectedId((current) => {
        if (current && conversationData.some((item) => item._id === current)) return current;
        return conversationData[0]?._id || '';
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [filters, canAssign, canCreate]);

  const loadMessages = useCallback(async () => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    try {
      const data = await getConversationMessages(selectedId);
      setMessages(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setMessagesLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => {
    loadMessages();
    if (selectedId) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('conversationId', selectedId);
        return next;
      }, { replace: true });
      markConversationRead(selectedId)
        .then(() => loadConversations(false))
        .catch(() => null);
    }
  }, [selectedId, loadMessages]);

  async function mutate(action, success) {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setNotice(success);
      await Promise.all([loadConversations(false), loadMessages()]);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitMessage(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const templateId = data.get('templateId');
    const sent = await mutate(
      () => sendMessage(selectedId, {
        text: data.get('text'),
        templateId: templateId || undefined
      }),
      'Mensaje procesado.'
    );
    if (sent) form.reset();
  }

  async function submitNote(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = new FormData(form).get('note');
    const saved = await mutate(
      () => createConversationInternalNote(selectedId, text),
      'Nota interna creada.'
    );
    if (saved) form.reset();
  }

  async function createInternal(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await createConversation({
      contactId: data.get('contactId'),
      assignedTo: data.get('assignedTo') || null,
      channel: 'internal'
    }).catch((requestError) => {
      setError(requestError.message);
      return null;
    });
    if (created) {
      form.reset();
      await loadConversations(false);
      setSelectedId(created._id);
      setNotice('Conversacion interna abierta.');
    }
  }

  const applicableTemplates = useMemo(
    () => templates.filter((template) =>
      template.channel === 'internal' ||
      template.channel === (selected?.channel === 'whatsapp' ? 'whatsapp_cloud' : selected?.channel)
    ),
    [templates, selected]
  );

  return (
    <PageShell
      eyebrow="Inbox omnicanal"
      title={user.role === 'CALLCENTER' ? 'Mis conversaciones' : 'Conversaciones'}
      description="Mensajes, asignaciones y notas internas con alcance por rol."
    >
      <CrmNotice notice={notice} error={error} />
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
          {canAssign ? <select className={inputClass} value={filters.assignedTo} onChange={(event) => setFilters((value) => ({ ...value, assignedTo: event.target.value }))}>
            <option value="">Todos los responsables</option>
            {users.filter((item) => ['SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select> : null}
          <select className={inputClass} value={filters.priority} onChange={(event) => setFilters((value) => ({ ...value, priority: event.target.value }))}>
            <option value="">Todas las prioridades</option>
            {['low', 'medium', 'high'].map((value) => <option key={value}>{value}</option>)}
          </select>
          <select className={inputClass} value={filters.unread} onChange={(event) => setFilters((value) => ({ ...value, unread: event.target.value }))}>
            <option value="">Leidas y no leidas</option>
            <option value="true">Solo no leidas</option>
          </select>
          <Button variant="secondary" onClick={() => Promise.all([loadConversations(), loadMessages()])}><RefreshCw className="h-4 w-4" />Actualizar</Button>
        </div>
      </Card>

      {canCreate ? <Card>
        <form className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={createInternal}>
          <select required name="contactId" className={inputClass}><option value="">Crear conversacion interna para...</option>{contacts.map((contact) => <option key={contact._id} value={contact._id}>{contact.name}</option>)}</select>
          <select name="assignedTo" className={inputClass}><option value="">Usar responsable del contacto</option>{users.filter((item) => ['SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          <Button type="submit"><MessageSquare className="h-4 w-4" />Crear interna</Button>
        </form>
      </Card> : null}

      {loading ? <CrmLoading label="Cargando conversaciones..." /> : (
        <div className="grid min-h-[650px] gap-4 xl:grid-cols-[340px_1fr]">
          <Card className="overflow-hidden">
            <div className="max-h-[760px] overflow-y-auto">
              {conversations.map((conversation) => (
                <button
                  key={conversation._id}
                  className={`w-full border-b border-slate-100 p-4 text-left transition hover:bg-slate-50 ${selectedId === conversation._id ? 'bg-cyan-50' : ''}`}
                  onClick={() => setSelectedId(conversation._id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{conversation.contactId?.name}</p>
                      <p className="text-xs text-slate-500">{channelLabel[conversation.channel] || conversation.channel} - {conversation.assignedTo?.name || 'Sin asignar'}</p>
                    </div>
                    {conversation.unreadCount ? <span className="rounded-full bg-cyan-700 px-2 py-0.5 text-xs font-bold text-white">{conversation.unreadCount}</span> : null}
                  </div>
                  <p className="mt-2 truncate text-sm text-slate-600">{conversation.lastMessage || 'Sin mensajes'}</p>
                  <div className="mt-2 flex items-center justify-between"><Badge tone={conversation.status}>{conversation.status}</Badge><span className="text-xs text-slate-400">{localDate(conversation.lastMessageAt)}</span></div>
                </button>
              ))}
              {!conversations.length ? <div className="p-8 text-center text-sm text-slate-500">No hay conversaciones para estos filtros.</div> : null}
            </div>
          </Card>

          <Card className="flex min-h-[650px] flex-col overflow-hidden">
            {selected ? <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
                <div>
                  <Link to={`/crm/contacts/${selected.contactId?._id}`} className="font-semibold text-cyan-800 hover:underline">{selected.contactId?.name}</Link>
                  <p className="text-xs text-slate-500">{selected.contactId?.phone || selected.contactId?.email} - {channelLabel[selected.channel] || selected.channel}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canAssign ? <select disabled={busy} className="rounded-md border border-slate-200 px-2 text-sm" value={selected.assignedTo?._id || ''} onChange={(event) => mutate(() => assignConversation(selected._id, event.target.value), 'Conversacion asignada.')}><option value="">Sin asignar</option>{users.filter((item) => ['SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select> : null}
                  {canClose && ['closed', 'resolved'].includes(selected.status) ? <Button variant="secondary" disabled={busy} onClick={() => mutate(() => reopenConversation(selected._id), 'Conversacion reabierta.')}><RefreshCw className="h-4 w-4" />Reabrir</Button> : null}
                  {canClose && !['closed', 'resolved'].includes(selected.status) ? <Button variant="secondary" disabled={busy} onClick={() => mutate(() => closeConversation(selected._id), 'Conversacion cerrada.')}><CheckCircle2 className="h-4 w-4" />Cerrar</Button> : null}
                  {user.role === 'ADMIN' ? <Button variant="danger" disabled={busy} onClick={() => mutate(() => archiveConversation(selected._id), 'Conversacion archivada.')}><Archive className="h-4 w-4" /></Button> : null}
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5">
                {messagesLoading ? <CrmLoading label="Cargando mensajes..." /> : messages.map((message) => (
                  <div key={message._id} className={`flex ${message.direction === 'outbound' ? 'justify-end' : message.direction === 'internal' ? 'justify-center' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm shadow-sm ${message.direction === 'outbound' ? 'bg-cyan-700 text-white' : message.direction === 'internal' ? 'border border-amber-200 bg-amber-50 text-amber-900' : 'border border-slate-200 bg-white text-slate-800'}`}>
                      {message.direction === 'internal' ? <p className="mb-1 text-xs font-bold uppercase">Nota interna</p> : null}
                      <p className="whitespace-pre-wrap">{message.text || `[${message.type}]`}</p>
                      <div className={`mt-2 flex items-center gap-2 text-[11px] ${message.direction === 'outbound' ? 'text-cyan-100' : 'text-slate-500'}`}>
                        <span>{message.sentBy?.name || (message.direction === 'inbound' ? selected.contactId?.name : 'Sistema')}</span>
                        <span>{localDate(message.createdAt)}</span>
                        <span>{message.status}</span>
                        {message.status === 'failed' ? <button className="font-bold underline" onClick={() => mutate(() => retryMessage(message._id), 'Reintento creado.')}>Reintentar</button> : null}
                      </div>
                      {message.error ? <p className="mt-1 text-xs font-semibold text-rose-200">{message.error}</p> : null}
                    </div>
                  </div>
                ))}
                {!messagesLoading && !messages.length ? <p className="text-center text-sm text-slate-500">Esta conversacion todavia no tiene mensajes.</p> : null}
              </div>
              <div className="grid gap-3 border-t border-slate-100 p-4 lg:grid-cols-2">
                <form className="space-y-2" onSubmit={submitMessage}>
                  <select name="templateId" className={inputClass} defaultValue=""><option value="">Sin plantilla</option>{applicableTemplates.map((template) => <option key={template._id} value={template._id}>{template.name}</option>)}</select>
                  <textarea name="text" className={`${inputClass} min-h-20`} placeholder="Escribe una respuesta. Una plantilla puede completar el contenido." />
                  <Button type="submit" disabled={busy}><Send className="h-4 w-4" />Enviar</Button>
                </form>
                <form className="space-y-2" onSubmit={submitNote}>
                  <textarea required name="note" className={`${inputClass} min-h-20 border-amber-200 bg-amber-50`} placeholder="Nota interna, no se envia al contacto" />
                  <Button type="submit" variant="secondary" disabled={busy}><StickyNote className="h-4 w-4" />Agregar nota interna</Button>
                </form>
              </div>
            </> : <div className="flex flex-1 items-center justify-center text-sm text-slate-500"><UserRoundCheck className="mr-2 h-5 w-5" />Selecciona una conversacion.</div>}
          </Card>
        </div>
      )}
    </PageShell>
  );
}
