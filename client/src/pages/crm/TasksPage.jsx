import { CheckCircle2, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  completeTask,
  createTask,
  getContacts,
  getOpportunities,
  getTasks,
  getUsers,
  updateTask
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass, localDate } from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [taskData, contactData, opportunityData, userData] = await Promise.all([
        getTasks(filters), getContacts({ limit: 500 }), getOpportunities(),
        user.role === 'CALLCENTER' ? Promise.resolve([]) : getUsers()
      ]);
      setTasks(taskData); setContacts(contactData); setOpportunities(opportunityData); setUsers(userData);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [filters, user.role]);
  useEffect(() => { load(); }, [load]);

  async function mutate(action, message) {
    setBusy(true); setError('');
    try { await action(); setNotice(message); await load(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function create(event) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const [relatedType, relatedId] = String(data.get('related')).split(':');
    const created = await mutate(() => createTask({
      title: data.get('title'),
      description: data.get('description'),
      relatedType,
      relatedId,
      assignedTo: data.get('assignedTo') || undefined,
      dueAt: data.get('dueAt') || null,
      priority: data.get('priority')
    }), 'Tarea creada.');
    if (created !== false) form.reset();
  }

  return (
    <PageShell eyebrow="CRM" title={user.role === 'CALLCENTER' ? 'Mis tareas' : 'Tareas'} description="Pendientes, vencimientos y tareas relacionadas con contactos u oportunidades.">
      <CrmNotice notice={notice} error={error} />
      <Card>
        <CardHeader title="Filtros" />
        <div className="grid gap-3 p-5 md:grid-cols-4">
          <select className={inputClass} value={filters.status || ''} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Todos los estados</option>{['pending', 'in_progress', 'completed', 'cancelled', 'overdue'].map((value) => <option key={value}>{value}</option>)}</select>
          <select className={inputClass} value={filters.priority || ''} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}><option value="">Toda prioridad</option>{['low', 'medium', 'high'].map((value) => <option key={value}>{value}</option>)}</select>
          <input type="date" className={inputClass} value={filters.dueFrom || ''} onChange={(event) => setFilters((current) => ({ ...current, dueFrom: event.target.value }))} />
          <Button variant="secondary" onClick={() => setFilters({})}>Limpiar</Button>
        </div>
      </Card>
      {loading ? <CrmLoading /> : <Card><CardHeader title={`${tasks.length} tareas`} /><Table data={tasks.map((task) => ({ ...task, id: task._id }))} emptyText="No hay tareas" columns={[
        { key: 'title', header: 'Tarea' },
        { key: 'assignedTo', header: 'Responsable', render: (row) => row.assignedTo?.name },
        { key: 'relatedType', header: 'Relacion' },
        { key: 'dueAt', header: 'Vence', render: (row) => localDate(row.dueAt) },
        { key: 'priority', header: 'Prioridad', render: (row) => <Badge tone={row.priority}>{row.priority}</Badge> },
        { key: 'status', header: 'Estado', render: (row) => <select disabled={busy} value={row.status} className="rounded border border-slate-200 px-2 py-1 text-xs" onChange={(event) => mutate(() => updateTask(row._id, { status: event.target.value }), 'Tarea actualizada.')}>{['pending', 'in_progress', 'completed', 'cancelled', 'overdue'].map((value) => <option key={value}>{value}</option>)}</select> },
        { key: 'complete', header: '', render: (row) => row.status !== 'completed' ? <Button className="min-h-8 px-2" variant="secondary" onClick={() => mutate(() => completeTask(row._id), 'Tarea completada.')}><CheckCircle2 className="h-4 w-4" /></Button> : null }
      ]} /></Card>}
      <Card>
        <CardHeader title="Crear tarea" />
        <form onSubmit={create} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          <input required name="title" className={inputClass} placeholder="Titulo" />
          <input name="description" className={inputClass} placeholder="Descripcion" />
          <select required name="related" className={inputClass}><option value="">Relacionar con...</option>{contacts.map((contact) => <option key={contact._id} value={`contact:${contact._id}`}>Contacto: {contact.name}</option>)}{opportunities.map((item) => <option key={item._id} value={`opportunity:${item._id}`}>Oportunidad: {item.title}</option>)}</select>
          {user.role !== 'CALLCENTER' ? <select required name="assignedTo" className={inputClass}><option value="">Responsable</option>{users.filter((current) => ['SUPERVISOR', 'CALLCENTER'].includes(current.role) || current._id === user._id).map((current) => <option key={current._id} value={current._id}>{current.name}</option>)}</select> : null}
          <input type="datetime-local" name="dueAt" className={inputClass} />
          <select name="priority" defaultValue="medium" className={inputClass}>{['low', 'medium', 'high'].map((value) => <option key={value}>{value}</option>)}</select>
          <Button type="submit" disabled={busy}><Plus className="h-4 w-4" />Crear tarea</Button>
        </form>
      </Card>
    </PageShell>
  );
}
