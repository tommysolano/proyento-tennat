import { ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  createSuppression,
  getCommunicationReport,
  getCommunicationSettings,
  getSuppressions,
  revokeSuppression,
  updateCommunicationSettings
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import {
  CrmLoadError,
  CrmLoading,
  CrmNotice,
  inputClass,
  localDate
} from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const days = [
  [1, 'Lun'], [2, 'Mar'], [3, 'Mie'], [4, 'Jue'],
  [5, 'Vie'], [6, 'Sab'], [0, 'Dom']
];

export function CommunicationSettingsPage() {
  const { access } = useAuth();
  const permissions = new Set(access.permissions || []);
  const canManage = permissions.has('quiet_hours:manage') || permissions.has('channel_configs:manage');
  const canSuppress = permissions.has('suppressions:manage') || permissions.has('channel_configs:manage');
  const [settings, setSettings] = useState(null);
  const [suppressions, setSuppressions] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const requests = [
      ['settings', getCommunicationSettings()],
      ['report', getCommunicationReport()],
      ['suppressions', canSuppress ? getSuppressions() : Promise.resolve([])]
    ];
    const results = await Promise.allSettled(requests.map(([, request]) => request));
    const errors = [];
    results.forEach((result, index) => {
      const key = requests[index][0];
      if (result.status === 'rejected') errors.push(result.reason.message);
      else if (key === 'settings') setSettings(result.value);
      else if (key === 'report') setReport(result.value);
      else setSuppressions(result.value);
    });
    if (errors.length) setError([...new Set(errors)].join(' '));
    setLoading(false);
  }, [canSuppress]);

  useEffect(() => { load(); }, [load]);

  async function mutate(action, success) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      await load();
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(() => updateCommunicationSettings({
      timezone: form.get('timezone'),
      quietHours: {
        enabled: form.get('enabled') === 'on',
        startTime: form.get('startTime'),
        endTime: form.get('endTime'),
        days: form.getAll('days').map(Number),
        channels: form.getAll('channels'),
        allowTransactional: form.get('allowTransactional') === 'on',
        action: form.get('action')
      },
      optOutKeywords: String(form.get('optOutKeywords') || '').split(',').map((item) => item.trim()).filter(Boolean),
      globalOptOutKeywords: String(form.get('globalOptOutKeywords') || '').split(',').map((item) => item.trim()).filter(Boolean)
    }), 'Reglas de comunicacion actualizadas.');
  }

  async function addSuppression(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const saved = await mutate(() => createSuppression({
      type: data.get('type'),
      value: data.get('value'),
      channel: data.get('channel'),
      reason: data.get('reason'),
      source: 'manual'
    }), 'Supresion agregada.');
    if (saved) form.reset();
  }

  if (loading) return <PageShell title="Politicas de comunicacion"><CrmLoading /></PageShell>;
  if (!settings && error) {
    return <PageShell title="Politicas de comunicacion"><CrmLoadError message={error} onRetry={load} /></PageShell>;
  }

  return (
    <PageShell
      eyebrow="Inbox"
      title="Consentimiento y DND"
      description="Horarios silenciosos, supresiones y diagnostico basico por empresa."
    >
      <CrmNotice notice={notice} error={error} />
      {canManage && settings ? (
        <Card>
          <CardHeader title="Reglas de envio" description="Los mensajes comerciales se programan o bloquean en la zona horaria indicada." />
          <form onSubmit={saveSettings} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-semibold">Zona horaria<input name="timezone" defaultValue={settings.timezone} className={inputClass} /></label>
            <label className="text-xs font-semibold">Inicio<input type="time" name="startTime" defaultValue={settings.quietHours?.startTime} className={inputClass} /></label>
            <label className="text-xs font-semibold">Fin<input type="time" name="endTime" defaultValue={settings.quietHours?.endTime} className={inputClass} /></label>
            <label className="text-xs font-semibold">Accion<select name="action" defaultValue={settings.quietHours?.action} className={inputClass}><option value="schedule">Programar</option><option value="block">Bloquear</option></select></label>
            <fieldset className="flex flex-wrap gap-3 text-sm md:col-span-2"><legend className="text-xs font-semibold">Dias</legend>{days.map(([value, label]) => <label key={value} className="flex gap-1"><input type="checkbox" name="days" value={value} defaultChecked={settings.quietHours?.days?.includes(value)} />{label}</label>)}</fieldset>
            <fieldset className="flex flex-wrap gap-3 text-sm md:col-span-2"><legend className="text-xs font-semibold">Canales</legend>{['whatsapp', 'sms', 'email', 'call'].map((channel) => <label key={channel} className="flex gap-1"><input type="checkbox" name="channels" value={channel} defaultChecked={settings.quietHours?.channels?.includes(channel)} />{channel}</label>)}</fieldset>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={settings.quietHours?.enabled} />Horario silencioso activo</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowTransactional" defaultChecked={settings.quietHours?.allowTransactional} />Permitir transaccionales</label>
            <label className="text-xs font-semibold md:col-span-2">Palabras de baja<input name="optOutKeywords" defaultValue={settings.optOutKeywords?.join(', ')} className={inputClass} /></label>
            <label className="text-xs font-semibold md:col-span-2">Baja global<input name="globalOptOutKeywords" defaultValue={settings.globalOptOutKeywords?.join(', ')} className={inputClass} /></label>
            <Button type="submit" disabled={busy}><ShieldCheck className="h-4 w-4" />Guardar reglas</Button>
          </form>
        </Card>
      ) : null}

      {canSuppress ? (
        <Card>
          <CardHeader title="Lista de supresion" description="No elimina contactos y siempre se consulta antes del envio." />
          <form onSubmit={addSuppression} className="grid gap-3 border-b border-slate-100 p-5 md:grid-cols-5">
            <select name="type" className={inputClass}><option value="email">Email</option><option value="phone">Telefono</option><option value="external_id">ID externo</option></select>
            <input required name="value" className={inputClass} placeholder="Valor" />
            <select name="channel" className={inputClass}><option value="all">Todos</option>{['whatsapp', 'sms', 'email', 'call'].map((value) => <option key={value}>{value}</option>)}</select>
            <input required name="reason" className={inputClass} placeholder="Motivo" />
            <Button type="submit" disabled={busy}>Agregar</Button>
          </form>
          <Table
            data={suppressions.map((item) => ({ ...item, id: item._id }))}
            emptyText="No hay entradas de supresion."
            columns={[
              { key: 'type', header: 'Tipo' },
              { key: 'displayValue', header: 'Valor' },
              { key: 'channel', header: 'Canal' },
              { key: 'reason', header: 'Motivo' },
              { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
              { key: 'createdAt', header: 'Fecha', render: (row) => localDate(row.createdAt) },
              { key: 'action', header: '', render: (row) => row.status === 'active' ? <Button variant="danger" disabled={busy} onClick={() => mutate(() => revokeSuppression(row._id, 'Retiro manual'), 'Supresion retirada.')}><Trash2 className="h-4 w-4" /></Button> : null }
            ]}
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Reporte basico" description="Datos tenant-scoped; usa los reportes de marketing para analisis comercial adicional." />
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">DND global</p><p className="mt-2 text-2xl font-semibold">{report?.dndGlobal || 0}</p></div>
          <div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Bloqueados</p><p className="mt-2 text-2xl font-semibold">{report?.blockedByReason?.reduce((sum, item) => sum + item.count, 0) || 0}</p></div>
          <div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Omitidos por horario</p><p className="mt-2 text-2xl font-semibold">{report?.quietHoursSkipped || 0}</p></div>
          <div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Errores tecnicos</p><p className="mt-2 text-2xl font-semibold">{report?.technicalErrors?.reduce((sum, item) => sum + item.count, 0) || 0}</p></div>
        </div>
        {!report?.consentByChannel?.length ? <p className="px-5 pb-5 text-sm text-slate-500">No hay datos de consentimiento para el periodo.</p> : (
          <Table
            data={report.consentByChannel.map((item, index) => ({ id: index, channel: item._id.channel, status: item._id.status, count: item.count }))}
            columns={[
              { key: 'channel', header: 'Canal' },
              { key: 'status', header: 'Estado' },
              { key: 'count', header: 'Contactos' }
            ]}
          />
        )}
      </Card>
    </PageShell>
  );
}
