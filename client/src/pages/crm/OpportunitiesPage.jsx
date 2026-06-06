import { Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createOpportunity,
  getContacts,
  getOpportunities,
  getPipelines,
  getUsers
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass, localDate, money } from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export function OpportunitiesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const canCreate = user.role !== 'CALLCENTER';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [opportunityData, contactData, pipelineData, userData] = await Promise.all([
        getOpportunities(filters), getContacts({ limit: 500 }), getPipelines(),
        user.role === 'CALLCENTER' ? Promise.resolve([]) : getUsers()
      ]);
      setItems(opportunityData); setContacts(contactData); setPipelines(pipelineData); setUsers(userData);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [filters, user.role]);
  useEffect(() => { load(); }, [load]);

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
        expectedCloseDate: data.get('expectedCloseDate') || null
      });
      form.reset(); setNotice('Oportunidad creada.'); await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  const selectedPipeline = pipelines.find((pipeline) => pipeline._id === filters.formPipeline) || pipelines[0];
  return (
    <PageShell eyebrow="CRM" title={user.role === 'CALLCENTER' ? 'Mis oportunidades' : 'Oportunidades'} description="Deals, responsables, valores y fechas esperadas de cierre.">
      <CrmNotice notice={notice} error={error} />
      <Card>
        <CardHeader title="Filtrar oportunidades" action={<Button as={Link} to="/crm/pipeline" variant="secondary">Abrir Kanban</Button>} />
        <div className="grid gap-3 p-5 md:grid-cols-4">
          <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={`${inputClass} pl-9`} placeholder="Buscar titulo" value={filters.search || ''} onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} /></label>
          <select className={inputClass} value={filters.pipelineId || ''} onChange={(event) => setFilters((value) => ({ ...value, pipelineId: event.target.value }))}><option value="">Todos los pipelines</option>{pipelines.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          <select className={inputClass} value={filters.status || ''} onChange={(event) => setFilters((value) => ({ ...value, status: event.target.value }))}><option value="">Todos los estados</option>{['open', 'won', 'lost', 'archived'].map((item) => <option key={item}>{item}</option>)}</select>
          <select className={inputClass} value={filters.priority || ''} onChange={(event) => setFilters((value) => ({ ...value, priority: event.target.value }))}><option value="">Toda prioridad</option>{['low', 'medium', 'high'].map((item) => <option key={item}>{item}</option>)}</select>
        </div>
      </Card>
      {loading ? <CrmLoading /> : <Card><CardHeader title={`${items.length} oportunidades`} /><Table data={items.map((item) => ({ ...item, id: item._id }))} emptyText="No hay oportunidades" columns={[
        { key: 'title', header: 'Oportunidad', render: (row) => <Link to={`/crm/opportunities/${row._id}`} className="font-semibold text-cyan-700 hover:underline">{row.title}</Link> },
        { key: 'contactId', header: 'Contacto', render: (row) => row.contactId?.name },
        { key: 'stageId', header: 'Etapa', render: (row) => row.stageId?.name },
        { key: 'assignedTo', header: 'Responsable', render: (row) => row.assignedTo?.name || 'Sin asignar' },
        { key: 'value', header: 'Valor', render: (row) => money(row.value, row.currency) },
        { key: 'expectedCloseDate', header: 'Cierre', render: (row) => localDate(row.expectedCloseDate) },
        { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> }
      ]} /></Card>}
      {canCreate && pipelines.length && contacts.length ? <Card>
        <CardHeader title="Crear oportunidad" />
        <form onSubmit={create} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <input required name="title" className={inputClass} placeholder="Titulo de la oportunidad" />
          <select required name="contactId" className={inputClass}><option value="">Contacto</option>{contacts.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          <select required name="pipelineId" className={inputClass} defaultValue={selectedPipeline?._id} onChange={(event) => setFilters((value) => ({ ...value, formPipeline: event.target.value }))}>{pipelines.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          <select required name="stageId" className={inputClass}><option value="">Etapa</option>{selectedPipeline?.stages.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          <input name="value" min="0" step="0.01" type="number" className={inputClass} placeholder="Valor" />
          <input name="currency" defaultValue="USD" className={inputClass} placeholder="Moneda" />
          <select name="assignedTo" className={inputClass} defaultValue=""><option value="">Sin asignar</option>{users.filter((item) => ['SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
          <select name="priority" defaultValue="medium" className={inputClass}>{['low', 'medium', 'high'].map((item) => <option key={item}>{item}</option>)}</select>
          <input type="date" name="expectedCloseDate" className={inputClass} />
          <Button type="submit" disabled={busy}><Plus className="h-4 w-4" />Crear oportunidad</Button>
        </form>
      </Card> : null}
    </PageShell>
  );
}
