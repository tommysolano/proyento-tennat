import { Archive, Beaker, CirclePause, CirclePlay, Plus, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  activateWorkflow,
  archiveWorkflow,
  createWorkflow,
  getWorkflow,
  getWorkflowCatalog,
  getWorkflowRuns,
  getWorkflows,
  pauseWorkflow,
  testWorkflow,
  updateWorkflow
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass } from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const emptyWorkflow = {
  name: '',
  description: '',
  status: 'draft',
  trigger: { type: 'event', eventType: 'contact.created', sourceModule: 'contacts', config: {} },
  conditions: [],
  actions: [],
  settings: {
    runOncePerEntity: false,
    allowReentry: true,
    cooldownMinutes: 0,
    maxRunsPerDay: 0,
    stopOnError: true,
    timezone: 'America/Guayaquil',
    preventSelfTrigger: true,
    maxChainDepth: 5,
    notifyOnComplete: false
  }
};

function prettyDate(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

function tone(status) {
  return {
    active: 'active',
    completed: 'active',
    draft: 'pending',
    queued: 'pending',
    waiting: 'pending',
    running: 'pending',
    paused: 'inactive',
    skipped: 'inactive',
    archived: 'disabled',
    failed: 'cancelled'
  }[status] || 'inactive';
}

export function WorkflowsPage() {
  const { user } = useAuth();
  const canManage = user.role === 'ADMIN';
  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState({ triggers: [] });
  const [filters, setFilters] = useState({ status: '', eventType: '', search: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [workflows, catalogData] = await Promise.all([
        getWorkflows(filters),
        getWorkflowCatalog()
      ]);
      setItems(workflows);
      setCatalog(catalogData);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  async function mutate(action, message) {
    setBusy(true);
    setError('');
    try {
      await action();
      setNotice(message);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      eyebrow="Automatizaciones"
      title="Workflows internos"
      description="Disparadores de negocio, condiciones seguras y acciones internas auditables."
    >
      <div className="flex flex-wrap gap-2">
        {canManage ? <Button as={Link} to="/workflows/new"><Plus className="h-4 w-4" />Nuevo workflow</Button> : null}
        <Button as={Link} to="/workflow-runs" variant="secondary">Ver ejecuciones</Button>
      </div>
      <CrmNotice notice={notice} error={error} />
      <Card>
        <CardHeader title="Filtros" />
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <input
            className={inputClass}
            placeholder="Buscar por nombre"
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          />
          <select className={inputClass} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">Todos los estados</option>
            {['draft', 'active', 'paused', 'archived'].map((value) => <option key={value}>{value}</option>)}
          </select>
          <select className={inputClass} value={filters.eventType} onChange={(event) => setFilters({ ...filters, eventType: event.target.value })}>
            <option value="">Todos los triggers</option>
            {catalog.triggers.map((item) => <option key={item.eventType} value={item.eventType}>{item.label}{item.status === 'planned' ? ' (planned)' : ''}</option>)}
          </select>
        </div>
      </Card>
      {loading ? <CrmLoading /> : (
        <div className="grid gap-4">
          {items.map((workflow) => (
            <Card key={workflow._id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-950">{workflow.name}</h2>
                    <Badge tone={tone(workflow.status)}>{workflow.status}</Badge>
                    <Badge>{workflow.trigger.eventType}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{workflow.description || 'Sin descripcion'}</p>
                  <p className="mt-2 text-xs text-slate-400">v{workflow.version} · {workflow.runsTotal || 0} runs · Ultima ejecucion {prettyDate(workflow.lastRunAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canManage ? <Button as={Link} to={`/workflows/${workflow._id}`} variant="secondary">Editar</Button> : null}
                  {canManage ? <Button disabled={busy} variant="secondary" onClick={() => mutate(() => testWorkflow(workflow._id, { dryRun: true, entityType: workflow.trigger.eventType.split('.')[0], payload: {} }), 'Dry-run completado.')}><Beaker className="h-4 w-4" />Probar</Button> : null}
                  {canManage && workflow.status !== 'active' ? (
                    <Button disabled={busy} onClick={() => mutate(() => activateWorkflow(workflow._id), 'Workflow activado.')}><CirclePlay className="h-4 w-4" />Activar</Button>
                  ) : null}
                  {canManage && workflow.status === 'active' ? (
                    <Button disabled={busy} variant="secondary" onClick={() => mutate(() => pauseWorkflow(workflow._id), 'Workflow pausado.')}><CirclePause className="h-4 w-4" />Pausar</Button>
                  ) : null}
                  {canManage && workflow.status !== 'archived' ? (
                    <Button disabled={busy} variant="danger" onClick={() => window.confirm('Archivar workflow?') && mutate(() => archiveWorkflow(workflow._id), 'Workflow archivado.')}><Archive className="h-4 w-4" /></Button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
          {!items.length ? <Card className="p-8 text-center text-sm text-slate-500">No hay workflows con estos filtros.</Card> : null}
        </div>
      )}
    </PageShell>
  );
}

export function WorkflowBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState(emptyWorkflow);
  const [catalog, setCatalog] = useState({ triggers: [], operators: [], actions: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [testInput, setTestInput] = useState({ entityType: 'contact', entityId: '', payload: '{}' });
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    Promise.all([getWorkflowCatalog(), id ? getWorkflow(id) : Promise.resolve(emptyWorkflow)])
      .then(([catalogData, workflowData]) => {
        setCatalog(catalogData);
        setWorkflow({
          ...emptyWorkflow,
          ...workflowData,
          settings: { ...emptyWorkflow.settings, ...(workflowData.settings || {}) }
        });
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [id]);

  function changeTrigger(eventType) {
    const definition = catalog.triggers.find((item) => item.eventType === eventType);
    setWorkflow({
      ...workflow,
      trigger: {
        type: 'event',
        eventType,
        sourceModule: definition?.sourceModule || '',
        config: {}
      }
    });
  }

  function updateCondition(index, patch) {
    setWorkflow({
      ...workflow,
      conditions: workflow.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
    });
  }

  function updateAction(index, patch) {
    setWorkflow({
      ...workflow,
      actions: workflow.actions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
    });
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const saved = id
        ? await updateWorkflow(id, workflow)
        : await createWorkflow({ ...workflow, status: 'draft' });
      setNotice('Workflow guardado.');
      if (!id) navigate(`/workflows/${saved._id}`, { replace: true });
      else setWorkflow({ ...workflow, ...saved });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function dryRun() {
    if (!id) {
      setError('Guarda el workflow antes de probarlo.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setTestResult(await testWorkflow(id, {
        dryRun: true,
        entityType: testInput.entityType,
        entityId: testInput.entityId || null,
        payload: JSON.parse(testInput.payload || '{}')
      }));
      setNotice('Simulacion completada sin ejecutar acciones.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageShell title="Constructor de workflow"><CrmLoading /></PageShell>;

  return (
    <PageShell
      eyebrow="Automatizaciones"
      title={id ? `Editar ${workflow.name}` : 'Nuevo workflow'}
      description="El orden de las acciones es el orden de ejecucion. Las esperas se reanudan mediante jobs."
    >
      <div><Button as={Link} to="/workflows" variant="secondary">Volver</Button></div>
      <CrmNotice notice={notice} error={error} />
      <form onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader title="Definicion" />
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <label className="text-xs font-semibold">Nombre<input required className={inputClass} value={workflow.name} onChange={(event) => setWorkflow({ ...workflow, name: event.target.value })} /></label>
            <label className="text-xs font-semibold">Trigger<select className={inputClass} value={workflow.trigger.eventType} onChange={(event) => changeTrigger(event.target.value)}>{catalog.triggers.filter((item) => item.status === 'active').map((item) => <option key={item.eventType} value={item.eventType}>{item.label} ({item.eventType})</option>)}</select></label>
            <label className="text-xs font-semibold md:col-span-2">Descripcion<textarea className={`${inputClass} min-h-20`} value={workflow.description} onChange={(event) => setWorkflow({ ...workflow, description: event.target.value })} /></label>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Condiciones"
            description="Todas deben cumplirse. Rutas permitidas: event.*, entity.* y payload.*."
            action={<Button variant="secondary" onClick={() => setWorkflow({ ...workflow, conditions: [...workflow.conditions, { field: 'entity.status', operator: 'equals', value: '' }] })}><Plus className="h-4 w-4" />Condicion</Button>}
          />
          <div className="space-y-3 p-5">
            {workflow.conditions.map((condition, index) => (
              <div key={condition._id || index} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_220px_1fr_auto]">
                <input className={inputClass} value={condition.field} onChange={(event) => updateCondition(index, { field: event.target.value })} placeholder="entity.status" />
                <select className={inputClass} value={condition.operator} onChange={(event) => updateCondition(index, { operator: event.target.value })}>{catalog.operators.map((operator) => <option key={operator}>{operator}</option>)}</select>
                <input className={inputClass} value={Array.isArray(condition.value) ? JSON.stringify(condition.value) : condition.value ?? ''} onChange={(event) => updateCondition(index, { value: event.target.value })} placeholder="Valor" />
                <Button variant="danger" onClick={() => setWorkflow({ ...workflow, conditions: workflow.conditions.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {!workflow.conditions.length ? <p className="text-sm text-slate-500">Sin condiciones: cualquier evento del trigger continuara.</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Acciones"
            description="Solo se muestran acciones internas activas."
            action={<Button variant="secondary" onClick={() => setWorkflow({ ...workflow, actions: [...workflow.actions, { type: 'activity_log.create', enabled: true, config: { summary: 'Workflow ejecutado' } }] })}><Plus className="h-4 w-4" />Accion</Button>}
          />
          <div className="space-y-3 p-5">
            {workflow.actions.map((action, index) => (
              <div key={action._id || index} className="rounded-lg border border-slate-200 p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <select className={inputClass} value={action.type} onChange={(event) => {
                    const definition = catalog.actions.find((item) => item.type === event.target.value);
                    updateAction(index, {
                      type: event.target.value,
                      config: Object.fromEntries((definition?.requiredConfig || []).map((field) => [field, '']))
                    });
                  }}>
                    {catalog.actions.filter((item) => item.status === 'active').map((item) => <option key={item.type}>{item.type}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={action.enabled !== false} onChange={(event) => updateAction(index, { enabled: event.target.checked })} />Activa</label>
                  <Button variant="danger" onClick={() => setWorkflow({ ...workflow, actions: workflow.actions.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <label className="mt-3 block text-xs font-semibold">Configuracion JSON<textarea key={`${action.type}-${action._id || index}`} className={`${inputClass} min-h-28 font-mono text-xs`} defaultValue={JSON.stringify(action.config || {}, null, 2)} onBlur={(event) => {
                  try {
                    updateAction(index, { config: JSON.parse(event.target.value) });
                    setError('');
                  } catch {
                    setError(`JSON invalido en accion ${index + 1}`);
                  }
                }} /></label>
              </div>
            ))}
            {!workflow.actions.length ? <p className="text-sm text-slate-500">Agrega al menos una accion antes de activar.</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Controles de ejecucion" />
          <div className="grid gap-4 p-5 md:grid-cols-3">
            {[
              ['cooldownMinutes', 'Cooldown (minutos)'],
              ['maxRunsPerDay', 'Maximo diario'],
              ['maxChainDepth', 'Profundidad maxima']
            ].map(([field, label]) => <label key={field} className="text-xs font-semibold">{label}<input type="number" min="0" className={inputClass} value={workflow.settings[field]} onChange={(event) => setWorkflow({ ...workflow, settings: { ...workflow.settings, [field]: Number(event.target.value) } })} /></label>)}
            {[
              ['runOncePerEntity', 'Una vez por entidad'],
              ['allowReentry', 'Permitir reentrada'],
              ['stopOnError', 'Detener ante error'],
              ['preventSelfTrigger', 'Evitar auto-trigger'],
              ['notifyOnComplete', 'Notificar al completar']
            ].map(([field, label]) => <label key={field} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={workflow.settings[field]} onChange={(event) => setWorkflow({ ...workflow, settings: { ...workflow.settings, [field]: event.target.checked } })} />{label}</label>)}
          </div>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}><Save className="h-4 w-4" />Guardar workflow</Button>
          {id && workflow.status !== 'active' ? <Button disabled={busy} onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const active = await activateWorkflow(id);
              setWorkflow({ ...workflow, ...active });
              setNotice('Workflow activado.');
            } catch (requestError) {
              setError(requestError.message);
            } finally {
              setBusy(false);
            }
          }}><CirclePlay className="h-4 w-4" />Activar</Button> : null}
        </div>
      </form>

      <Card>
        <CardHeader title="Prueba segura" description="Evalua condiciones y muestra acciones sin modificar datos." />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <input className={inputClass} value={testInput.entityType} onChange={(event) => setTestInput({ ...testInput, entityType: event.target.value })} placeholder="contact" />
          <input className={inputClass} value={testInput.entityId} onChange={(event) => setTestInput({ ...testInput, entityId: event.target.value })} placeholder="ObjectId opcional" />
          <textarea className={`${inputClass} min-h-28 font-mono text-xs md:col-span-2`} value={testInput.payload} onChange={(event) => setTestInput({ ...testInput, payload: event.target.value })} />
          <Button disabled={busy} onClick={dryRun}><Beaker className="h-4 w-4" />Simular</Button>
          {testResult ? <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-cyan-100 md:col-span-2">{JSON.stringify(testResult, null, 2)}</pre> : null}
        </div>
      </Card>
    </PageShell>
  );
}

export function WorkflowRunsPage() {
  const [runs, setRuns] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selected = runs.find((run) => run._id === selectedId) || null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWorkflowRuns({ status });
      setRuns(data);
      setSelectedId((current) => data.some((item) => item._id === current) ? current : data[0]?._id || '');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  return (
    <PageShell eyebrow="Automatizaciones" title="Ejecuciones" description="Historial durable de condiciones, acciones, esperas y errores sanitizados.">
      <div className="flex flex-wrap gap-2">
        <Button as={Link} to="/workflows" variant="secondary">Volver a workflows</Button>
        <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Todos los estados</option>
          {['queued', 'running', 'waiting', 'completed', 'failed', 'skipped', 'cancelled'].map((value) => <option key={value}>{value}</option>)}
        </select>
      </div>
      <CrmNotice error={error} />
      {loading ? <CrmLoading /> : (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader title="Runs recientes" />
            <div className="divide-y divide-slate-100">
              {runs.map((run) => (
                <button key={run._id} className={`w-full p-4 text-left ${selectedId === run._id ? 'bg-cyan-50' : 'hover:bg-slate-50'}`} onClick={() => setSelectedId(run._id)}>
                  <div className="flex items-center justify-between gap-2"><strong>{run.workflowId?.name || 'Workflow'}</strong><Badge tone={tone(run.status)}>{run.status}</Badge></div>
                  <p className="mt-1 text-xs text-slate-500">{run.eventType} · {prettyDate(run.createdAt)}</p>
                </button>
              ))}
              {!runs.length ? <p className="p-6 text-sm text-slate-500">No hay ejecuciones registradas.</p> : null}
            </div>
          </Card>
          <Card>
            <CardHeader title="Detalle" />
            {selected ? <div className="space-y-5 p-5">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <p><strong>Workflow:</strong> {selected.workflowId?.name}</p>
                <p><strong>Estado:</strong> {selected.status}</p>
                <p><strong>Evento:</strong> {selected.eventType}</p>
                <p><strong>Entidad:</strong> {selected.entityType} {selected.entityId || ''}</p>
                <p><strong>Inicio:</strong> {prettyDate(selected.startedAt)}</p>
                <p><strong>Duracion:</strong> {selected.durationMs || 0} ms</p>
              </div>
              <section>
                <h3 className="mb-2 font-semibold">Condiciones</h3>
                <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-cyan-100">{JSON.stringify(selected.matchedConditions, null, 2)}</pre>
              </section>
              <section>
                <h3 className="mb-2 font-semibold">Acciones</h3>
                <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-cyan-100">{JSON.stringify(selected.executedActions, null, 2)}</pre>
              </section>
              {selected.error ? <section><h3 className="mb-2 font-semibold text-rose-700">Error</h3><pre className="overflow-auto rounded-lg bg-rose-950 p-4 text-xs text-rose-100">{JSON.stringify(selected.error, null, 2)}</pre></section> : null}
            </div> : <p className="p-6 text-sm text-slate-500">Selecciona una ejecucion.</p>}
          </Card>
        </div>
      )}
    </PageShell>
  );
}
