import { Download, Filter, Plus, Search, Upload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  createCrmList,
  createContact,
  exportContacts,
  getCrmLists,
  getCrmViewPreference,
  getContacts,
  getCustomFields,
  getSegments,
  getTags,
  getUsers,
  runCrmBulkAction,
  updateCrmViewPreference
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import {
  BulkActionsBar,
  ColumnSelector,
  CreateCrmListForm
} from '../../components/CrmCollectionTools.jsx';
import { Drawer } from '../../components/Drawer.jsx';
import { FormField } from '../../components/FormField.jsx';
import {
  CrmLoadError,
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
import { contactDndStatus } from '../../utils/inbox.js';

const lifecycleOptions = ['lead', 'prospect', 'customer', 'lost'];
const priorityOptions = ['low', 'medium', 'high'];
const defaultColumns = ['name', 'phone', 'assignedTo', 'tags', 'priority', 'status', 'action'];
const columnOptions = [
  { key: 'name', label: 'Contacto', required: true },
  { key: 'phone', label: 'Telefono' },
  { key: 'email', label: 'Email' },
  { key: 'source', label: 'Fuente' },
  { key: 'channel', label: 'Canal de ingreso' },
  { key: 'campaign', label: 'Campana' },
  { key: 'medium', label: 'Fuente / medio' },
  { key: 'consultedProduct', label: 'Producto consultado' },
  { key: 'purchasedProduct', label: 'Producto comprado' },
  { key: 'marketingOrigin', label: 'Origen de marketing' },
  { key: 'globalDnd', label: 'DND global' },
  { key: 'preferredChannel', label: 'Canal preferido' },
  { key: 'city', label: 'Ciudad' },
  { key: 'assignedTo', label: 'Responsable', required: true },
  { key: 'tags', label: 'Tags' },
  { key: 'lists', label: 'Listas' },
  { key: 'priority', label: 'Prioridad' },
  { key: 'status', label: 'Estado', required: true },
  { key: 'lastContactAt', label: 'Ultima interaccion' },
  { key: 'createdAt', label: 'Fecha de creacion' },
  { key: 'action', label: 'Accion', required: true }
];

export function ContactsPage() {
  const { user, access } = useAuth();
  const [searchParams] = useSearchParams();
  const [contacts, setContacts] = useState([]);
  const [tags, setTags] = useState([]);
  const [fields, setFields] = useState([]);
  const [segments, setSegments] = useState([]);
  const [users, setUsers] = useState([]);
  const [lists, setLists] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState(defaultColumns);
  const [filters, setFilters] = useState(() => Object.fromEntries(searchParams.entries()));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const permissions = new Set(access.permissions || []);
  const canCreate = user.role === 'ADMIN' && permissions.has('contacts:manage');
  const canImport = user.role === 'ADMIN' && permissions.has('contacts:import');
  const canExport = permissions.has('contacts:export');
  const canManageLists = user.role === 'ADMIN' && permissions.has('contacts:manage');
  const canBulk = ['contacts:manage', 'contacts:update_team', 'contacts:update_assigned']
    .some((permission) => permissions.has(permission));
  const canAssign = ['contacts:manage', 'contacts:assign_team', 'contacts:assign']
    .some((permission) => permissions.has(permission));
  const canReadAttribution = [
    'attribution:read',
    'attribution:read_team',
    'attribution:read_assigned'
  ].some((permission) => permissions.has(permission));
  const canReadConsent = [
    'consent:read',
    'consent:read_team',
    'consent:read_assigned',
    'contacts:manage',
    'contacts:read_team',
    'contacts:read_assigned'
  ].some((permission) => permissions.has(permission));

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [
        contactData,
        tagData,
        fieldData,
        segmentData,
        userData,
        listData,
        preference
      ] = await Promise.all([
        getContacts(filters),
        getTags('contact'),
        getCustomFields('contact'),
        getSegments(),
        user.role === 'CALLCENTER' ? Promise.resolve([]) : getUsers(),
        getCrmLists('contact'),
        getCrmViewPreference('contacts')
      ]);
      setContacts(contactData); setTags(tagData); setFields(fieldData.filter((item) => item.status === 'active'));
      setSegments(segmentData); setUsers(userData); setLists(listData);
      setVisibleColumns(preference.visibleColumns?.length ? preference.visibleColumns : defaultColumns);
    } catch (requestError) { setLoadError(requestError.message); }
    finally { setLoading(false); }
  }, [filters, user.role]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => contacts.some((contact) => contact._id === id)));
  }, [contacts]);

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

  function toggleSelection(id) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((currentId) => currentId !== id) : [...current, id]
    );
  }

  function toggleAllVisible() {
    const visibleIds = contacts.map((contact) => contact._id);
    const allSelected = visibleIds.length && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected
      ? selectedIds.filter((id) => !visibleIds.includes(id))
      : [...new Set([...selectedIds, ...visibleIds])]);
  }

  async function runBulk(payload) {
    setBusy(true); setError('');
    try {
      const result = await runCrmBulkAction('contacts', { ids: selectedIds, ...payload });
      setNotice(`${result.affected} contactos actualizados.`);
      setSelectedIds([]);
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function saveColumns(columns) {
    setBusy(true); setError('');
    try {
      const preference = await updateCrmViewPreference('contacts', columns);
      setVisibleColumns(preference.visibleColumns);
      setNotice('Columnas visibles guardadas para tu usuario.');
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function createList(payload) {
    setBusy(true); setError('');
    try {
      await createCrmList(payload);
      setNotice('Lista de contactos creada.');
      await load();
      return true;
    } catch (requestError) { setError(requestError.message); return false; }
    finally { setBusy(false); }
  }

  const availableColumns = [
    ...columnOptions.filter((column) =>
      canReadAttribution ||
      !['channel', 'campaign', 'medium', 'consultedProduct', 'purchasedProduct', 'marketingOrigin'].includes(column.key)
    ),
    ...fields.map((field) => ({
      key: `custom:${field.key}`,
      label: field.label
    }))
  ];
  const tableColumns = [
    {
      key: 'selection',
      header: (
        <input
          aria-label="Seleccionar todos los contactos visibles"
          type="checkbox"
          checked={Boolean(contacts.length) && contacts.every((contact) => selectedIds.includes(contact._id))}
          onChange={toggleAllVisible}
        />
      ),
      render: (row) => (
        <input
          aria-label={`Seleccionar ${row.name}`}
          type="checkbox"
          checked={selectedIds.includes(row._id)}
          onChange={() => toggleSelection(row._id)}
        />
      )
    },
    { key: 'name', header: 'Contacto', truncate: true, width: '14rem', render: (row) => <Link className="font-semibold text-cyan-700 hover:underline" to={`/crm/contacts/${row._id}`}>{row.name}</Link> },
    { key: 'phone', header: 'Telefono', nowrap: true, render: (row) => row.phone || '-' },
    { key: 'email', header: 'Email', truncate: true, width: '15rem', render: (row) => row.email || '-' },
    { key: 'source', header: 'Fuente', truncate: true, width: '10rem', render: (row) => row.source || '-' },
    { key: 'channel', header: 'Canal', nowrap: true, render: (row) => row.attribution?.entryChannel || row.attribution?.channel || '-' },
    { key: 'campaign', header: 'Campana', truncate: true, width: '12rem', render: (row) => row.attribution?.campaignId?.name || row.attribution?.campaignName || row.attribution?.utmCampaign || '-' },
    { key: 'medium', header: 'Fuente / medio', truncate: true, width: '12rem', render: (row) => [row.attribution?.source || row.attribution?.utmSource, row.attribution?.medium || row.attribution?.utmMedium].filter(Boolean).join(' / ') || '-' },
    { key: 'consultedProduct', header: 'Producto consultado', truncate: true, width: '12rem', render: (row) => row.attribution?.consultedProduct || '-' },
    { key: 'purchasedProduct', header: 'Producto comprado', truncate: true, width: '12rem', render: (row) => row.attribution?.purchasedProduct || '-' },
    { key: 'marketingOrigin', header: 'Origen marketing', truncate: true, width: '12rem', render: (row) => row.attribution?.integrationId?.name || (row.attribution?.funnelId ? 'Funnel' : row.attribution?.landingPageId ? 'Landing' : row.attribution?.formId ? 'Formulario' : '-') },
    { key: 'globalDnd', header: 'DND', nowrap: true, render: (row) => contactDndStatus(row).active ? <Badge tone="cancelled">Activo</Badge> : <Badge tone="active">Inactivo</Badge> },
    { key: 'preferredChannel', header: 'Canal preferido', nowrap: true, render: (row) => row.communicationPreferences?.preferredChannel || '-' },
    { key: 'city', header: 'Ciudad', truncate: true, width: '10rem', render: (row) => row.city || '-' },
    { key: 'assignedTo', header: 'Responsable', truncate: true, width: '12rem', render: (row) => row.assignedTo?.name || 'Sin asignar' },
    { key: 'tags', header: 'Tags', width: '14rem', render: (row) => <div className="flex flex-wrap gap-1">{row.tags?.map((tag) => <span key={tag._id} style={{ backgroundColor: `${tag.color}20`, color: tag.color }} className="rounded-full px-2 py-0.5 text-xs font-semibold">{tag.name}</span>)}</div> },
    { key: 'lists', header: 'Listas', truncate: true, width: '12rem', render: (row) => row.lists?.map((list) => list.name).join(', ') || '-' },
    { key: 'priority', header: 'Prioridad', nowrap: true, render: (row) => <Badge tone={row.priority}>{row.priority}</Badge> },
    { key: 'status', header: 'Estado', nowrap: true, render: (row) => <Badge tone={row.status}>{row.status.replaceAll('_', ' ')}</Badge> },
    { key: 'lastContactAt', header: 'Ultima interaccion', nowrap: true, render: (row) => localDate(row.lastContactAt) },
    { key: 'createdAt', header: 'Creacion', nowrap: true, render: (row) => localDate(row.createdAt) },
    ...fields.map((field) => ({
      key: `custom:${field.key}`,
      header: field.label,
      truncate: true,
      width: '12rem',
      render: (row) => {
        const value = row.customFields?.[field.key];
        if (Array.isArray(value)) return value.join(', ') || '-';
        if (typeof value === 'boolean') return value ? 'Si' : 'No';
        return value ?? '-';
      }
    })),
    { key: 'action', header: 'Accion', nowrap: true, render: (row) => <Button as={Link} to={`/crm/contacts/${row._id}`} variant="secondary" className="min-h-8 px-3">Ver</Button> }
  ].filter((column) =>
    ((column.key === 'selection' && canBulk) ||
    (column.key !== 'selection' && visibleColumns.includes(column.key))) &&
    (canReadAttribution ||
      !['channel', 'campaign', 'medium', 'consultedProduct', 'purchasedProduct', 'marketingOrigin'].includes(column.key))
  );

  return (
    <PageShell
      width="full"
      eyebrow="CRM"
      title={user.role === 'CALLCENTER' ? 'Mis contactos' : user.role === 'SUPERVISOR' ? 'Contactos del equipo' : 'Contactos'}
      description="Busqueda, segmentacion, etiquetas y seguimientos con alcance por rol."
      actions={canCreate ? (
        <Button onClick={() => setCreateOpen(true)} disabled={busy}>
          <Plus className="h-4 w-4" />Crear contacto
        </Button>
      ) : null}
    >
      <CrmNotice notice={notice} error={error} />
      <Card>
        <CardHeader title="Filtros avanzados" action={<div className="flex flex-wrap gap-2"><ColumnSelector columns={availableColumns} selected={visibleColumns} defaults={defaultColumns} busy={busy} onSave={saveColumns} />{canImport ? <Button as={Link} to="/crm/import" variant="secondary"><Upload className="h-4 w-4" />Importar</Button> : null}{canExport ? <Button variant="secondary" onClick={() => exportContacts(filters).catch((e) => setError(e.message))}><Download className="h-4 w-4" />Exportar</Button> : null}</div>} />
        <div className="grid gap-3 p-5 md:grid-cols-3 xl:grid-cols-5">
          <FormField label="Buscar" htmlFor="contacts-filter-search">
            <span className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input id="contacts-filter-search" name="search" value={filters.search || ''} onChange={updateFilter} className={`${inputClass} pl-9`} placeholder="Nombre, telefono o email" /></span>
          </FormField>
          <FormField label="Estado" htmlFor="contacts-filter-status">
            <select id="contacts-filter-status" name="status" value={filters.status || ''} onChange={updateFilter} className={inputClass}><option value="">Todos los estados</option>{CONTACT_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          </FormField>
          <FormField label="Ciclo de vida" htmlFor="contacts-filter-lifecycle">
            <select id="contacts-filter-lifecycle" name="lifecycleStage" value={filters.lifecycleStage || ''} onChange={updateFilter} className={inputClass}><option value="">Todo el ciclo</option>{lifecycleOptions.map((item) => <option key={item}>{item}</option>)}</select>
          </FormField>
          <FormField label="Prioridad" htmlFor="contacts-filter-priority">
            <select id="contacts-filter-priority" name="priority" value={filters.priority || ''} onChange={updateFilter} className={inputClass}><option value="">Toda prioridad</option>{priorityOptions.map((item) => <option key={item}>{item}</option>)}</select>
          </FormField>
          <FormField label="Etiqueta" htmlFor="contacts-filter-tag">
            <select id="contacts-filter-tag" name="tag" value={filters.tag || ''} onChange={updateFilter} className={inputClass}><option value="">Todos los tags</option>{tags.filter((tag) => tag.status === 'active').map((tag) => <option key={tag._id} value={tag._id}>{tag.name}</option>)}</select>
          </FormField>
          <FormField label="Lista" htmlFor="contacts-filter-list">
            <select id="contacts-filter-list" name="list" value={filters.list || ''} onChange={updateFilter} className={inputClass}><option value="">Todas las listas</option>{lists.map((list) => <option key={list._id} value={list._id}>{list.name}</option>)}</select>
          </FormField>
          <FormField label="Responsable" htmlFor="contacts-filter-assignee">
            <select id="contacts-filter-assignee" name="assignedTo" value={filters.assignedTo || ''} onChange={updateFilter} className={inputClass}><option value="">Cualquier responsable</option>{users.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          </FormField>
          <FormField label="Origen" htmlFor="contacts-filter-source">
            <input id="contacts-filter-source" name="source" value={filters.source || ''} onChange={updateFilter} className={inputClass} placeholder="Ej. Referido" />
          </FormField>
          {canReadAttribution ? <FormField label="Canal de ingreso" htmlFor="contacts-filter-channel">
            <input id="contacts-filter-channel" name="channel" value={filters.channel || ''} onChange={updateFilter} className={inputClass} />
          </FormField> : null}
          {canReadAttribution ? <FormField label="Campana" htmlFor="contacts-filter-campaign">
            <input id="contacts-filter-campaign" name="campaign" value={filters.campaign || ''} onChange={updateFilter} className={inputClass} />
          </FormField> : null}
          {canReadAttribution ? <FormField label="Producto consultado" htmlFor="contacts-filter-consulted-product">
            <input id="contacts-filter-consulted-product" name="consultedProduct" value={filters.consultedProduct || ''} onChange={updateFilter} className={inputClass} />
          </FormField> : null}
          {canReadAttribution ? <FormField label="Producto comprado" htmlFor="contacts-filter-purchased-product">
            <input id="contacts-filter-purchased-product" name="purchasedProduct" value={filters.purchasedProduct || ''} onChange={updateFilter} className={inputClass} />
          </FormField> : null}
          {canReadConsent ? <FormField label="DND global" htmlFor="contacts-filter-dnd">
            <select id="contacts-filter-dnd" name="dnd" value={filters.dnd || ''} onChange={updateFilter} className={inputClass}><option value="">Cualquier estado</option><option value="true">Activo</option><option value="false">Inactivo</option></select>
          </FormField> : null}
          {canReadConsent ? <FormField label="Canal de consentimiento" htmlFor="contacts-filter-consent-channel">
            <select id="contacts-filter-consent-channel" name="consentChannel" value={filters.consentChannel || ''} onChange={updateFilter} className={inputClass}><option value="">Todos</option>{['whatsapp', 'sms', 'email', 'call'].map((value) => <option key={value}>{value}</option>)}</select>
          </FormField> : null}
          {canReadConsent ? <FormField label="Consentimiento" htmlFor="contacts-filter-consent-status">
            <select id="contacts-filter-consent-status" name="consentStatus" value={filters.consentStatus || ''} onChange={updateFilter} className={inputClass}><option value="">Todos</option>{['unknown', 'opted_in', 'opted_out', 'transactional_only', 'blocked'].map((value) => <option key={value}>{value}</option>)}</select>
          </FormField> : null}
          <FormField label="Seguimiento" htmlFor="contacts-filter-follow-up">
            <select id="contacts-filter-follow-up" name="followUp" value={filters.followUp || ''} onChange={updateFilter} className={inputClass}><option value="">Cualquier seguimiento</option><option value="overdue">Vencidos</option><option value="today">Hoy</option><option value="upcoming">Proximos</option></select>
          </FormField>
          <FormField label="Segmento guardado" htmlFor="contacts-filter-segment">
            <select id="contacts-filter-segment" className={inputClass} value="" onChange={(event) => {
              const segment = segments.find((item) => item._id === event.target.value);
              if (segment) setFilters(segment.filters);
            }}><option value="">Aplicar segmento</option>{segments.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          </FormField>
          <div className="flex items-end"><Button className="w-full" variant="secondary" onClick={() => setFilters({})}><Filter className="h-4 w-4" />Limpiar</Button></div>
        </div>
      </Card>
      {canBulk ? (
        <BulkActionsBar
          selectedCount={selectedIds.length}
          lists={lists}
          tags={tags.filter((tag) => tag.status === 'active')}
          users={users.filter((item) => ['ADMIN', 'SUPERVISOR', 'CALLCENTER'].includes(item.role))}
          statuses={CONTACT_STATUS_OPTIONS.map((item) => item.value)}
          busy={busy}
          canAssign={canAssign}
          allowDnd={permissions.has('dnd:manage') || permissions.has('dnd:manage_team') || permissions.has('contacts:manage') || permissions.has('contacts:update_team')}
          onRun={runBulk}
          onClear={() => setSelectedIds([])}
        />
      ) : null}
      {loading ? <CrmLoading /> : loadError ? <CrmLoadError message={loadError} onRetry={load} /> : (
        <Card>
          <CardHeader title={`${contacts.length} contactos encontrados`} description="La seleccion se aplica unicamente a los registros visibles y permitidos." />
          <Table data={contacts.map((contact) => ({ ...contact, id: contact._id }))} emptyText="No hay contactos para estos filtros" columns={tableColumns} />
        </Card>
      )}
      {canManageLists ? (
        <Card>
          <CardHeader title="Listas de contactos" description="Una lista es una agrupacion estatica; los segmentos siguen siendo filtros guardados." />
          <div className="p-5"><CreateCrmListForm entityType="contact" busy={busy} onCreate={createList} /></div>
        </Card>
      ) : null}
      {canCreate ? (
        <Drawer
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title="Crear contacto"
          description="El tenant se obtiene de la sesion autenticada."
          size="lg"
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" form="crm-contact-create" disabled={busy}>
                <Plus className="h-4 w-4" />{busy ? 'Creando...' : 'Crear contacto'}
              </Button>
            </>
          }
        >
          <form id="crm-contact-create" onSubmit={create} className="grid gap-4 md:grid-cols-2">
            <FormField label="Nombre completo" htmlFor="crm-contact-name" required>
              <input id="crm-contact-name" required name="name" className={inputClass} placeholder="Ej. Ana Perez" />
            </FormField>
            <FormField label="Telefono" htmlFor="crm-contact-phone">
              <input id="crm-contact-phone" name="phone" className={inputClass} placeholder="+593..." />
            </FormField>
            <FormField label="Email" htmlFor="crm-contact-email">
              <input id="crm-contact-email" type="email" name="email" className={inputClass} placeholder="ana@empresa.com" />
            </FormField>
            <FormField label="Origen" htmlFor="crm-contact-source">
              <input id="crm-contact-source" name="source" className={inputClass} placeholder="Ej. Referido" />
            </FormField>
            <FormField label="Estado" htmlFor="crm-contact-status">
              <select id="crm-contact-status" name="status" className={inputClass} defaultValue="nuevo">{CONTACT_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            </FormField>
            <FormField label="Etapa del ciclo" htmlFor="crm-contact-lifecycle">
              <select id="crm-contact-lifecycle" name="lifecycleStage" className={inputClass} defaultValue="lead">{lifecycleOptions.map((item) => <option key={item}>{item}</option>)}</select>
            </FormField>
            <FormField label="Prioridad" htmlFor="crm-contact-priority">
              <select id="crm-contact-priority" name="priority" className={inputClass} defaultValue="medium">{priorityOptions.map((item) => <option key={item}>{item}</option>)}</select>
            </FormField>
            <FormField label="Responsable" htmlFor="crm-contact-assignee">
              <select id="crm-contact-assignee" name="assignedTo" className={inputClass} defaultValue=""><option value="">Sin asignar</option>{users.filter((item) => ['SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
            </FormField>
            <FormField label="Proximo seguimiento" htmlFor="crm-contact-follow-up">
              <input id="crm-contact-follow-up" type="datetime-local" name="nextFollowUpAt" className={inputClass} />
            </FormField>
            <fieldset className="rounded-md border border-slate-200 p-3 md:col-span-2"><legend className="px-1 text-xs font-semibold text-slate-500">Tags</legend><div className="flex flex-wrap gap-3">{tags.filter((tag) => tag.status === 'active').map((tag) => <label key={tag._id} className="flex items-center gap-1 text-sm"><input type="checkbox" name="tags" value={tag._id} />{tag.name}</label>)}</div></fieldset>
            {fields.map((field) => <CustomFieldInput key={field._id} field={field} />)}
          </form>
        </Drawer>
      ) : null}
    </PageShell>
  );
}
