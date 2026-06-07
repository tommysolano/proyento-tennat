import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  RefreshCw,
  Repeat2,
  ServerCog,
  Wifi
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  acknowledgeOpsAlert,
  getHealth,
  getOpsAlerts,
  getOpsJobs,
  replayOpsJob
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass, localDate } from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';

function Metric({ icon: Icon, label, value, tone = 'text-cyan-700' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
        <Icon className={`h-4 w-4 ${tone}`} />
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

export function OpsPage() {
  const [jobs, setJobs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [health, setHealth] = useState(null);
  const [jobFilters, setJobFilters] = useState({ status: '', type: '' });
  const [alertFilters, setAlertFilters] = useState({ status: 'open', severity: '' });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const [jobData, alertData, healthData] = await Promise.all([
        getOpsJobs(jobFilters),
        getOpsAlerts(alertFilters),
        getHealth()
      ]);
      setJobs(jobData);
      setAlerts(alertData);
      setHealth(healthData);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [jobFilters, alertFilters]);

  useEffect(() => { load(); }, [load]);

  async function mutate(id, action, success) {
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      await load(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  const criticalCount = useMemo(
    () => alerts.filter((alert) => alert.status === 'open' && alert.severity === 'critical').length,
    [alerts]
  );

  return (
    <PageShell
      eyebrow="Operaciones"
      title="Jobs, alertas y salud"
      description="Vista sanitizada para operar la beta sin exponer payloads ni secretos."
    >
      <CrmNotice notice={notice} error={error} />

      {loading ? <CrmLoading label="Cargando estado operativo..." /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Metric icon={ServerCog} label="Worker" value={health?.worker?.running ? 'activo' : 'detenido'} tone={health?.worker?.running ? 'text-emerald-700' : 'text-rose-700'} />
            <Metric icon={Activity} label="Pendientes" value={health?.jobs?.pending ?? '-'} />
            <Metric icon={AlertTriangle} label="Fallidos" value={health?.jobs?.failed ?? '-'} tone="text-amber-700" />
            <Metric icon={AlertTriangle} label="Dead" value={health?.jobs?.dead ?? '-'} tone="text-rose-700" />
            <Metric icon={HardDrive} label="Storage" value={health?.storage?.provider || '-'} />
            <Metric icon={Wifi} label="Realtime" value={health?.realtimeEnabled ? 'activo' : 'off'} tone={health?.realtimeEnabled ? 'text-emerald-700' : 'text-slate-500'} />
          </div>

          <Card>
            <CardHeader
              title="Configuracion de runtime"
              description={`MongoDB ${health?.mongodb || '-'}; firma WhatsApp ${health?.whatsappSignatureRequired ? 'obligatoria' : 'opcional'}; max media ${health?.storage?.maxSizeMb || '-'} MB.`}
              action={<Button variant="secondary" onClick={() => load(false)}><RefreshCw className="h-4 w-4" />Actualizar</Button>}
            />
          </Card>

          <Card>
            <CardHeader title="Jobs" description="Replay crea un job nuevo y conserva la trazabilidad del original." />
            <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
              <select className={inputClass} value={jobFilters.status} onChange={(event) => setJobFilters((value) => ({ ...value, status: event.target.value }))}>
                <option value="">Todos los estados</option>
                {['pending', 'processing', 'completed', 'failed', 'dead'].map((value) => <option key={value}>{value}</option>)}
              </select>
              <select className={inputClass} value={jobFilters.type} onChange={(event) => setJobFilters((value) => ({ ...value, type: event.target.value }))}>
                <option value="">Todos los tipos</option>
                {['webhook.whatsapp.inbound', 'webhook.whatsapp.status', 'message.whatsapp.send', 'media.whatsapp.download', 'notification.dispatch'].map((value) => <option key={value}>{value}</option>)}
              </select>
              <Button variant="secondary" onClick={() => load(false)}><RefreshCw className="h-4 w-4" />Aplicar</Button>
            </div>
            <Table
              data={jobs.map((job) => ({ ...job, id: job._id }))}
              emptyText="No hay jobs para estos filtros"
              columns={[
                { key: 'type', header: 'Tipo', render: (row) => <div><strong>{row.type}</strong><p className="text-xs text-slate-500">{row.companyId?.name || row.companyId || 'plataforma'}</p>{row.metadata?.channelConfigId ? <p className="text-xs text-slate-400">Canal {row.metadata.channelConfigId}</p> : null}</div> },
                { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
                { key: 'attempts', header: 'Intentos', render: (row) => `${row.attempts}/${row.maxAttempts}` },
                { key: 'runAt', header: 'Run at', render: (row) => localDate(row.runAt) },
                { key: 'processedAt', header: 'Procesado', render: (row) => localDate(row.processedAt) },
                { key: 'error', header: 'Error sanitizado', render: (row) => <span className="block max-w-xs whitespace-normal text-xs text-rose-700">{row.error?.message || row.error?.code || '-'}</span> },
                { key: 'actions', header: '', render: (row) => row.replayAllowed ? <Button className="min-h-8 px-2" variant="secondary" disabled={busyId === row._id} onClick={() => mutate(row._id, () => replayOpsJob(row._id), 'Job reenviado a la cola.')}><Repeat2 className="h-4 w-4" />Replay</Button> : null }
              ]}
            />
          </Card>

          <Card>
            <CardHeader
              title="Alertas operativas"
              description="Las alertas reconocidas conservan historial y actor."
              action={criticalCount ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white">
                  <AlertTriangle className="h-4 w-4" /> {criticalCount} criticas abiertas
                </span>
              ) : <Badge tone="ok">sin criticas abiertas</Badge>}
            />
            <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
              <select className={inputClass} value={alertFilters.status} onChange={(event) => setAlertFilters((value) => ({ ...value, status: event.target.value }))}>
                <option value="">Todos los estados</option>
                {['open', 'acknowledged', 'resolved'].map((value) => <option key={value}>{value}</option>)}
              </select>
              <select className={inputClass} value={alertFilters.severity} onChange={(event) => setAlertFilters((value) => ({ ...value, severity: event.target.value }))}>
                <option value="">Todas las severidades</option>
                {['info', 'warning', 'critical'].map((value) => <option key={value}>{value}</option>)}
              </select>
              <Button variant="secondary" onClick={() => load(false)}><RefreshCw className="h-4 w-4" />Aplicar</Button>
            </div>
            <Table
              data={alerts.map((alert) => ({ ...alert, id: alert._id }))}
              emptyText="No hay alertas para estos filtros"
              columns={[
                { key: 'severity', header: 'Severidad', render: (row) => <Badge tone={row.severity}>{row.severity}</Badge> },
                { key: 'title', header: 'Alerta', render: (row) => <div className="max-w-md whitespace-normal"><strong>{row.title}</strong><p className="mt-1 text-xs text-slate-600">{row.message}</p><p className="mt-1 text-xs text-slate-400">{row.companyId?.name || row.companyId || row.scopeType}</p></div> },
                { key: 'type', header: 'Tipo' },
                { key: 'createdAt', header: 'Creada', render: (row) => localDate(row.createdAt) },
                { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
                { key: 'actions', header: '', render: (row) => row.status === 'open' ? <Button className="min-h-8 px-2" variant="secondary" disabled={busyId === row._id} onClick={() => mutate(row._id, () => acknowledgeOpsAlert(row._id), 'Alerta reconocida.')}><CheckCircle2 className="h-4 w-4" />Reconocer</Button> : null }
              ]}
            />
          </Card>
        </>
      )}
    </PageShell>
  );
}
