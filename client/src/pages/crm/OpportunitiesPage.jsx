import { Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createCrmList,
  createOpportunity,
  getCrmLists,
  getCrmViewPreference,
  getContacts,
  getCustomFields,
  getOpportunities,
  getPipelines,
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
import { CrmLoadError, CrmLoading, CrmNotice, CustomFieldInput, customFieldsFromForm, inputClass, localDate, money } from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const opportunityStatuses = ['open', 'won', 'lost', 'archived'];
const priorityOptions = ['low', 'medium', 'high'];
const defaultColumns = ['title', 'contact', 'stage', 'assignedTo', 'value', 'status', 'action'];
const columnOptions = [
  { key: 'title', label: 'Oportunidad', required: true },
  { key: 'contact', label: 'Contacto principal' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'stage', label: 'Etapa' },
  { key: 'value', label: 'Valor' },
  { key: 'source', label: 'Fuente' },
  { key: 'channel', label: 'Canal de ingreso' },
  { key: 'campaign', label: 'Campana' },
  { key: 'medium', label: 'Fuente / medio' },
  { key: 'consultedProduct', label: 'Producto consultado' },
  { key: 'purchasedProduct', label: 'Producto comprado' },
  { key: 'marketingOrigin', label: 'Origen de marketing' },
  { key: 'assignedTo', label: 'Responsable', required: true },
  { key: 'tags', label: 'Tags' },
  { key: 'lists', label: 'Listas' },
  { key: 'priority', label: 'Prioridad' },
  { key: 'status', label: 'Estado', required: true },
  { key: 'expectedCloseDate', label: 'Cierre esperado' },
  { key: 'updatedAt', label: 'Ultima interaccion' },
  { key: 'action', label: 'Accion', required: true }
];

export function OpportunitiesPage() {
  const { user, access } = useAuth();
  const [items, setItems] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [users, setUsers] = useState([]);
  const [tags, setTags] = useState([]);
  const [fields, setFields] = useState([]);
  const [lists, setLists] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState(defaultColumns);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const permissions = new Set(access.permissions || []);
  const modules = new Set(access.modules || []);
  const canReadContacts = modules.has('contacts') && [
    'contacts:manage',
    'contacts:read_team',
    'contacts:read_assigned'
  ].some((permission) => permissions.has(permission));
  const canCreate = ['ADMIN', 'SUPERVISOR'].includes(user.role) && [
    'opportunities:manage',
    'opportunities:update_team'
  ].some((permission) => permissions.has(permission)) && canReadContacts;
  const canManageLists = user.role === 'ADMIN' && permissions.has('opportunities:manage');
  const canBulk = [
    'opportunities:manage',
    'opportunities:update_team',
    'opportunities:update_assigned'
  ].some((permission) => permissions.has(permission));
  const canAssign = [
    'opportunities:manage',
    'opportunities:assign_team'
  ].some((permission) => permissions.has(permission));
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
        opportunityData,
        contactData,
        pipelineData,
        userData,
        tagData,
        fieldData,
        listData,
        preference
      ] = await Promise.all([
        getOpportunities(filters), canReadContacts ? getContacts({ limit: 500 }) : Promise.resolve([]), getPipelines(),
        user.role === 'CALLCENTER' ? Promise.resolve([]) : getUsers(),
        getTags('opportunity'),
        getCustomFields('opportunity'),
        getCrmLists('opportunity'),
        getCrmViewPreference('opportunities')
      ]);
      setItems(opportunityData); setContacts(contactData); setPipelines(pipelineData); setUsers(userData);
      setTags(tagData); setFields(fieldData.filter((field) => field.status === 'active')); setLists(listData);
      setVisibleColumns(preference.visibleColumns?.length ? preference.visibleColumns : defaultColumns);
    } catch (requestError) { setLoadError(requestError.message); }
    finally { setLoading(false); }
  }, [filters, user.role, canReadContacts]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => items.some((item) => item._id === id)));
  }, [items]);

  async function create(event) {
    event.preventDefault(); setBusy(true); setError('');
    const form = event.currentTarget; const data = new FormData(form);
    try {
      await createOpportunity({
        title: data.get('title'),
        contactId: data.get('contactId'),
        pipelineId: data.get('pipelineId'),
        stageId: data.get('stageId'),
        value: Number(data.get('value') || 0),
        currency: data.get('currency'),
        assignedTo: data.get('assignedTo') || null,
        priority: data.get('priority'),
        source: data.get('source'),
        tags: data.getAll('tags'),
        customFields: customFieldsFromForm(data, fields),
        expectedCloseDate: data.get('expectedCloseDate') || null
      });
      form.reset(); setNotice('Oportunidad creada.'); await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  function toggleSelection(id) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((currentId) => currentId !== id) : [...current, id]
    );
  }

  function toggleAllVisible() {
    const visibleIds = items.map((item) => item._id);
    const allSelected = visibleIds.length && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected
      ? selectedIds.filter((id) => !visibleIds.includes(id))
      : [...new Set([...selectedIds, ...visibleIds])]);
  }

  async function runBulk(payload) {
    setBusy(true); setError('');
    try {
      const result = await runCrmBulkAction('opportunities', { ids: selectedIds, ...payload });
      setNotice(`${result.affected} oportunidades actualizadas.`);
      setSelectedIds([]);
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function saveColumns(columns) {
    setBusy(true); setError('');
    try {
      const preference = await updateCrmViewPreference('opportunities', columns);
      setVisibleColumns(preference.visibleColumns);
      setNotice('Columnas visibles guardadas para tu usuario.');
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function createList(payload) {
    setBusy(true); setError('');
    try {
      await createCrmList(payload);
      setNotice('Lista de oportunidades creada.');
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
          aria-label="Seleccionar todas las oportunidades visibles"
          type="checkbox"
          checked={Boolean(items.length) && items.every((item) => selectedIds.includes(item._id))}
          onChange={toggleAllVisible}
        />
      ),
      render: (row) => (
        <input
          aria-label={`Seleccionar ${row.title}`}
          type="checkbox"
          checked={selectedIds.includes(row._id)}
          onChange={() => toggleSelection(row._id)}
        />
      )
    },
    { key: 'title', header: 'Oportunidad', render: (row) => <Link to={`/crm/opportunities/${row._id}`} className="font-semibold text-cyan-700 hover:underline">{row.title}</Link> },
    { key: 'contact', header: 'Contacto', render: (row) => row.contactId?.name || '-' },
    { key: 'pipeline', header: 'Pipeline', render: (row) => row.pipelineId?.name || '-' },
    { key: 'stage', header: 'Etapa', render: (row) => row.stageId?.name || '-' },
    { key: 'value', header: 'Valor', render: (row) => money(row.value, row.currency) },
    { key: 'source', header: 'Fuente', render: (row) => row.source || '-' },
    { key: 'channel', header: 'Canal', render: (row) => row.attribution?.entryChannel || row.attribution?.channel || '-' },
    { key: 'campaign', header: 'Campana', render: (row) => row.attribution?.campaignId?.name || row.attribution?.campaignName || row.attribution?.utmCampaign || '-' },
    { key: 'medium', header: 'Fuente / medio', render: (row) => [row.attribution?.source || row.attribution?.utmSource, row.attribution?.medium || row.attribution?.utmMedium].filter(Boolean).join(' / ') || '-' },
    { key: 'consultedProduct', header: 'Producto consultado', render: (row) => row.attribution?.consultedProduct || '-' },
    { key: 'purchasedProduct', header: 'Producto comprado', render: (row) => row.attribution?.purchasedProduct || '-' },
    { key: 'marketingOrigin', header: 'Origen marketing', render: (row) => row.attribution?.integrationId?.name || (row.attribution?.funnelId ? 'Funnel' : row.attribution?.landingPageId ? 'Landing' : row.attribution?.formId ? 'Formulario' : '-') },
    { key: 'assignedTo', header: 'Responsable', render: (row) => row.assignedTo?.name || 'Sin asignar' },
    { key: 'tags', header: 'Tags', render: (row) => <div className="flex flex-wrap gap-1">{row.tags?.map((tag) => <span key={tag._id} style={{ backgroundColor: `${tag.color}20`, color: tag.color }} className="rounded-full px-2 py-0.5 text-xs font-semibold">{tag.name}</span>)}</div> },
    { key: 'lists', header: 'Listas', render: (row) => row.lists?.map((list) => list.name).join(', ') || '-' },
    { key: 'priority', header: 'Prioridad', render: (row) => <Badge tone={row.priority}>{row.priority}</Badge> },
    { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
    { key: 'expectedCloseDate', header: 'Cierre', render: (row) => localDate(row.expectedCloseDate) },
    { key: 'updatedAt', header: 'Ultima interaccion', render: (row) => localDate(row.updatedAt) },
    ...fields.map((field) => ({
      key: `custom:${field.key}`,
      header: field.label,
      render: (row) => {
        const value = row.customFields?.[field.key];
        if (Array.isArray(value)) return value.join(', ') || '-';
        if (typeof value === 'boolean') return value ? 'Si' : 'No';
        return value ?? '-';
      }
    })),
    { key: 'action', header: 'Accion', render: (row) => <Button as={Link} to={`/crm/opportunities/${row._id}`} variant="secondary" className="min-h-8 px-3">Ver</Button> }
  ].filter((column) =>
    ((column.key === 'selection' && canBulk) ||
    (column.key !== 'selection' && visibleColumns.includes(column.key))) &&
    (canReadAttribution ||
      !['channel', 'campaign', 'medium', 'consultedProduct', 'purchasedProduct', 'marketingOrigin'].includes(column.key))
  );

  const selectedPipeline = pipelines.find((pipeline) => pipeline._id === filters.formPipeline) || pipelines[0];
  return (
    <PageShell
      width="full"
      eyebrow="CRM"
      title={user.role === 'CALLCENTER' ? 'Mis oportunidades' : 'Oportunidades'}
      description="Deals, responsables, valores y fechas esperadas de cierre."
      actions={canCreate && pipelines.length && contacts.length ? (
        <Button onClick={() => setCreateOpen(true)} disabled={busy}>
          <Plus className="h-4 w-4" />Crear oportunidad
        </Button>
      ) : null}
    >
      <CrmNotice notice={notice} error={error} />
      <Card>
        <CardHeader title="Filtrar oportunidades" action={<div className="flex gap-2"><ColumnSelector columns={availableColumns} selected={visibleColumns} defaults={defaultColumns} busy={busy} onSave={saveColumns} /><Button as={Link} to="/crm/pipeline" variant="secondary">Abrir Kanban</Button></div>} />
        <div className="grid gap-3 p-5 md:grid-cols-3 xl:grid-cols-5">
          <FormField label="Buscar" htmlFor="opportunities-filter-search">
            <span className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input id="opportunities-filter-search" className={`${inputClass} pl-9`} placeholder="Titulo de la oportunidad" value={filters.search || ''} onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} /></span>
          </FormField>
          <FormField label="Pipeline" htmlFor="opportunities-filter-pipeline">
            <select id="opportunities-filter-pipeline" className={inputClass} value={filters.pipelineId || ''} onChange={(event) => setFilters((value) => ({ ...value, pipelineId: event.target.value }))}><option value="">Todos los pipelines</option>{pipelines.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          </FormField>
          <FormField label="Estado" htmlFor="opportunities-filter-status">
            <select id="opportunities-filter-status" className={inputClass} value={filters.status || ''} onChange={(event) => setFilters((value) => ({ ...value, status: event.target.value }))}><option value="">Todos los estados</option>{opportunityStatuses.map((item) => <option key={item}>{item}</option>)}</select>
          </FormField>
          <FormField label="Prioridad" htmlFor="opportunities-filter-priority">
            <select id="opportunities-filter-priority" className={inputClass} value={filters.priority || ''} onChange={(event) => setFilters((value) => ({ ...value, priority: event.target.value }))}><option value="">Toda prioridad</option>{priorityOptions.map((item) => <option key={item}>{item}</option>)}</select>
          </FormField>
          <FormField label="Lista" htmlFor="opportunities-filter-list">
            <select id="opportunities-filter-list" className={inputClass} value={filters.list || ''} onChange={(event) => setFilters((value) => ({ ...value, list: event.target.value }))}><option value="">Todas las listas</option>{lists.map((list) => <option key={list._id} value={list._id}>{list.name}</option>)}</select>
          </FormField>
          <FormField label="Tag" htmlFor="opportunities-filter-tag">
            <select id="opportunities-filter-tag" className={inputClass} value={filters.tag || ''} onChange={(event) => setFilters((value) => ({ ...value, tag: event.target.value }))}><option value="">Todos los tags</option>{tags.filter((tag) => tag.status === 'active').map((tag) => <option key={tag._id} value={tag._id}>{tag.name}</option>)}</select>
          </FormField>
          <FormField label="Responsable" htmlFor="opportunities-filter-assignee">
            <select id="opportunities-filter-assignee" className={inputClass} value={filters.assignedTo || ''} onChange={(event) => setFilters((value) => ({ ...value, assignedTo: event.target.value }))}><option value="">Cualquier responsable</option>{users.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          </FormField>
          <FormField label="Fuente" htmlFor="opportunities-filter-source">
            <input id="opportunities-filter-source" className={inputClass} value={filters.source || ''} onChange={(event) => setFilters((value) => ({ ...value, source: event.target.value }))} />
          </FormField>
          {canReadAttribution ? <FormField label="Canal de ingreso" htmlFor="opportunities-filter-channel">
            <input id="opportunities-filter-channel" className={inputClass} value={filters.channel || ''} onChange={(event) => setFilters((value) => ({ ...value, channel: event.target.value }))} />
          </FormField> : null}
          {canReadAttribution ? <FormField label="Campana" htmlFor="opportunities-filter-campaign">
            <input id="opportunities-filter-campaign" className={inputClass} value={filters.campaign || ''} onChange={(event) => setFilters((value) => ({ ...value, campaign: event.target.value }))} />
          </FormField> : null}
          {canReadAttribution ? <FormField label="Producto consultado" htmlFor="opportunities-filter-consulted-product">
            <input id="opportunities-filter-consulted-product" className={inputClass} value={filters.consultedProduct || ''} onChange={(event) => setFilters((value) => ({ ...value, consultedProduct: event.target.value }))} />
          </FormField> : null}
          {canReadAttribution ? <FormField label="Producto comprado" htmlFor="opportunities-filter-purchased-product">
            <input id="opportunities-filter-purchased-product" className={inputClass} value={filters.purchasedProduct || ''} onChange={(event) => setFilters((value) => ({ ...value, purchasedProduct: event.target.value }))} />
          </FormField> : null}
          <div className="flex items-end"><Button className="w-full" variant="secondary" onClick={() => setFilters({})}>Limpiar filtros</Button></div>
        </div>
      </Card>
      {canBulk ? (
        <BulkActionsBar
          selectedCount={selectedIds.length}
          lists={lists}
          tags={tags.filter((tag) => tag.status === 'active')}
          users={users.filter((item) => ['ADMIN', 'SUPERVISOR', 'CALLCENTER'].includes(item.role))}
          statuses={opportunityStatuses}
          busy={busy}
          canAssign={canAssign}
          onRun={runBulk}
          onClear={() => setSelectedIds([])}
        />
      ) : null}
      {loading ? <CrmLoading /> : loadError ? <CrmLoadError message={loadError} onRetry={load} /> : <Card><CardHeader title={`${items.length} oportunidades`} description="La seleccion se limita a los registros visibles y permitidos." /><Table data={items.map((item) => ({ ...item, id: item._id }))} emptyText="No hay oportunidades" columns={tableColumns} /></Card>}
      {canManageLists ? <Card>
        <CardHeader title="Listas de oportunidades" description="Agrupaciones estaticas para organizar deals sin alterar el pipeline." />
        <div className="p-5"><CreateCrmListForm entityType="opportunity" busy={busy} onCreate={createList} /></div>
      </Card> : null}
      {canCreate && pipelines.length && contacts.length ? <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Crear oportunidad"
        description="El pipeline y la etapa definen el flujo comercial del deal."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button type="submit" form="crm-opportunity-create" disabled={busy}>
              <Plus className="h-4 w-4" />Crear oportunidad
            </Button>
          </>
        }
      >
        <form id="crm-opportunity-create" onSubmit={create} className="grid gap-4 md:grid-cols-2">
          <FormField label="Titulo" htmlFor="opportunity-title" required>
            <input id="opportunity-title" required name="title" className={inputClass} placeholder="Ej. Renovacion anual" />
          </FormField>
          <FormField label="Contacto" htmlFor="opportunity-contact" required>
            <select id="opportunity-contact" required name="contactId" className={inputClass}><option value="">Selecciona un contacto</option>{contacts.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          </FormField>
          <FormField label="Pipeline" htmlFor="opportunity-pipeline" required>
            <select id="opportunity-pipeline" required name="pipelineId" className={inputClass} defaultValue={selectedPipeline?._id} onChange={(event) => setFilters((value) => ({ ...value, formPipeline: event.target.value }))}>{pipelines.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          </FormField>
          <FormField label="Etapa" htmlFor="opportunity-stage" required>
            <select id="opportunity-stage" required name="stageId" className={inputClass}><option value="">Selecciona una etapa</option>{selectedPipeline?.stages.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          </FormField>
          <FormField label="Valor estimado" htmlFor="opportunity-value">
            <input id="opportunity-value" name="value" min="0" step="0.01" type="number" className={inputClass} placeholder="0.00" />
          </FormField>
          <FormField label="Moneda" htmlFor="opportunity-currency" hint="Codigo ISO, por ejemplo USD.">
            <input id="opportunity-currency" name="currency" defaultValue="USD" className={inputClass} placeholder="USD" />
          </FormField>
          <FormField label="Responsable" htmlFor="opportunity-assignee">
            <select id="opportunity-assignee" name="assignedTo" className={inputClass} defaultValue=""><option value="">Sin asignar</option>{users.filter((item) => ['SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          </FormField>
          <FormField label="Prioridad" htmlFor="opportunity-priority">
            <select id="opportunity-priority" name="priority" defaultValue="medium" className={inputClass}>{priorityOptions.map((item) => <option key={item}>{item}</option>)}</select>
          </FormField>
          <FormField label="Fuente" htmlFor="opportunity-source">
            <input id="opportunity-source" name="source" className={inputClass} />
          </FormField>
          <FormField label="Fecha esperada de cierre" htmlFor="opportunity-close-date">
            <input id="opportunity-close-date" type="date" name="expectedCloseDate" className={inputClass} />
          </FormField>
          <fieldset className="rounded-md border border-slate-200 p-3 md:col-span-2"><legend className="px-1 text-xs font-semibold text-slate-500">Tags de oportunidad</legend><div className="flex flex-wrap gap-3">{tags.filter((tag) => tag.status === 'active').map((tag) => <label key={tag._id} className="flex items-center gap-1 text-sm"><input type="checkbox" name="tags" value={tag._id} />{tag.name}</label>)}</div></fieldset>
          {fields.map((field) => <CustomFieldInput key={field._id} field={field} />)}
        </form>
      </Drawer> : null}
    </PageShell>
  );
}
