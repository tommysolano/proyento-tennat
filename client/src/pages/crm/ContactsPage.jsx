import { Download, Filter, Plus, Search, Upload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  createContact,
  exportContacts,
  getContacts,
  getCustomFields,
  getSegments,
  getTags,
  getUsers
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import {
  CrmLoading,
  CrmNotice,
  CustomFieldInput,
  customFieldsFromForm,
  inputClass,
  localDate
} from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { CONTACT_STATUS_OPTIONS } from '../../utils/contacts.js';

const lifecycleOptions = ['lead', 'prospect', 'customer', 'lost'];
const priorityOptions = ['low', 'medium', 'high'];

export function ContactsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [contacts, setContacts] = useState([]);
  const [tags, setTags] = useState([]);
  const [fields, setFields] = useState([]);
  const [segments, setSegments] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState(() => Object.fromEntries(searchParams.entries()));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const canCreate = user.role === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [contactData, tagData, fieldData, segmentData, userData] = await Promise.all([
        getContacts(filters),
        getTags(),
        getCustomFields('contact'),
        getSegments(),
        user.role === 'CALLCENTER' ? Promise.resolve([]) : getUsers()
      ]);
      setContacts(contactData); setTags(tagData); setFields(fieldData.filter((item) => item.status === 'active'));
      setSegments(segmentData); setUsers(userData);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [filters, user.role]);

  useEffect(() => { load(); }, [load]);

  function updateFilter(event) {
    setFilters((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function create(event) {
    event.preventDefault(); setBusy(true); setError('');
    const form = event.currentTarget; const data = new FormData(form);
    try {
      await createContact({
        name: data.get('name'),
        phone: data.get('phone'),
        email: data.get('email'),
        source: data.get('source'),
        status: data.get('status'),
        lifecycleStage: data.get('lifecycleStage'),
        priority: data.get('priority'),
        assignedTo: data.get('assignedTo') || null,
        tags: data.getAll('tags'),
        customFields: customFieldsFromForm(data, fields),
        nextFollowUpAt: data.get('nextFollowUpAt') || null
      });
      form.reset(); setNotice('Contacto creado correctamente.'); await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return (
    <PageShell eyebrow="CRM" title={user.role === 'CALLCENTER' ? 'Mis contactos' : user.role === 'SUPERVISOR' ? 'Contactos del equipo' : 'Contactos'} description="Busqueda, segmentacion, etiquetas y seguimientos con alcance por rol.">
      <CrmNotice notice={notice} error={error} />
      <Card>
        <CardHeader title="Filtros avanzados" action={<div className="flex gap-2">{user.role === 'ADMIN' ? <Button as={Link} to="/crm/import" variant="secondary"><Upload className="h-4 w-4" />Importar</Button> : null}<Button variant="secondary" onClick={() => exportContacts(filters).catch((e) => setError(e.message))}><Download className="h-4 w-4" />Exportar</Button></div>} />
        <div className="grid gap-3 p-5 md:grid-cols-3 xl:grid-cols-5">
          <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input name="search" value={filters.search || ''} onChange={updateFilter} className={`${inputClass} pl-9`} placeholder="Nombre, telefono o email" /></label>
          <select name="status" value={filters.status || ''} onChange={updateFilter} className={inputClass}><option value="">Todos los estados</option>{CONTACT_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select name="lifecycleStage" value={filters.lifecycleStage || ''} onChange={updateFilter} className={inputClass}><option value="">Todo el ciclo</option>{lifecycleOptions.map((item) => <option key={item}>{item}</option>)}</select>
          <select name="priority" value={filters.priority || ''} onChange={updateFilter} className={inputClass}><option value="">Toda prioridad</option>{priorityOptions.map((item) => <option key={item}>{item}</option>)}</select>
          <select name="tag" value={filters.tag || ''} onChange={updateFilter} className={inputClass}><option value="">Todos los tags</option>{tags.filter((tag) => tag.status === 'active').map((tag) => <option key={tag._id} value={tag._id}>{tag.name}</option>)}</select>
          <select name="assignedTo" value={filters.assignedTo || ''} onChange={updateFilter} className={inputClass}><option value="">Cualquier responsable</option>{users.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          <input name="source" value={filters.source || ''} onChange={updateFilter} className={inputClass} placeholder="Origen" />
          <select name="followUp" value={filters.followUp || ''} onChange={updateFilter} className={inputClass}><option value="">Cualquier seguimiento</option><option value="overdue">Vencidos</option><option value="today">Hoy</option><option value="upcoming">Proximos</option></select>
          <select className={inputClass} value="" onChange={(event) => {
            const segment = segments.find((item) => item._id === event.target.value);
            if (segment) setFilters(segment.filters);
          }}><option value="">Aplicar segmento guardado</option>{segments.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          <Button variant="secondary" onClick={() => setFilters({})}><Filter className="h-4 w-4" />Limpiar</Button>
        </div>
      </Card>
      {loading ? <CrmLoading /> : (
        <Card>
          <CardHeader title={`${contacts.length} contactos encontrados`} />
          <Table data={contacts.map((contact) => ({ ...contact, id: contact._id }))} emptyText="No hay contactos para estos filtros" columns={[
            { key: 'name', header: 'Contacto', render: (row) => <Link className="font-semibold text-cyan-700 hover:underline" to={`/crm/contacts/${row._id}`}>{row.name}</Link> },
            { key: 'phone', header: 'Telefono' },
            { key: 'assignedTo', header: 'Responsable', render: (row) => row.assignedTo?.name || 'Sin asignar' },
            { key: 'tags', header: 'Tags', render: (row) => <div className="flex flex-wrap gap-1">{row.tags?.map((tag) => <span key={tag._id} style={{ backgroundColor: `${tag.color}20`, color: tag.color }} className="rounded-full px-2 py-0.5 text-xs font-semibold">{tag.name}</span>)}</div> },
            { key: 'priority', header: 'Prioridad', render: (row) => <Badge tone={row.priority}>{row.priority}</Badge> },
            { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status.replaceAll('_', ' ')}</Badge> },
            { key: 'nextFollowUpAt', header: 'Seguimiento', render: (row) => localDate(row.nextFollowUpAt) }
          ]} />
        </Card>
      )}
      {canCreate ? (
        <Card>
          <CardHeader title="Crear contacto" description="El tenant se obtiene de la sesion autenticada." />
          <form onSubmit={create} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            <input required name="name" className={inputClass} placeholder="Nombre completo" />
            <input name="phone" className={inputClass} placeholder="Telefono" />
            <input type="email" name="email" className={inputClass} placeholder="Email" />
            <input name="source" className={inputClass} placeholder="Origen" />
            <select name="status" className={inputClass} defaultValue="nuevo">{CONTACT_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <select name="lifecycleStage" className={inputClass} defaultValue="lead">{lifecycleOptions.map((item) => <option key={item}>{item}</option>)}</select>
            <select name="priority" className={inputClass} defaultValue="medium">{priorityOptions.map((item) => <option key={item}>{item}</option>)}</select>
            <select name="assignedTo" className={inputClass} defaultValue=""><option value="">Sin asignar</option>{users.filter((item) => ['SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
            <input type="datetime-local" name="nextFollowUpAt" className={inputClass} />
            <fieldset className="rounded-md border border-slate-200 p-3"><legend className="px-1 text-xs font-semibold text-slate-500">Tags</legend><div className="flex flex-wrap gap-3">{tags.filter((tag) => tag.status === 'active').map((tag) => <label key={tag._id} className="flex items-center gap-1 text-sm"><input type="checkbox" name="tags" value={tag._id} />{tag.name}</label>)}</div></fieldset>
            {fields.map((field) => <CustomFieldInput key={field._id} field={field} />)}
            <Button type="submit" disabled={busy}><Plus className="h-4 w-4" />{busy ? 'Creando...' : 'Crear contacto'}</Button>
          </form>
        </Card>
      ) : null}
    </PageShell>
  );
}
