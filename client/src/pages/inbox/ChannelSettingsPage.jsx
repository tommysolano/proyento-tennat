import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FlaskConical,
  Plus,
  Power,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  TestTube2
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  createChannelConfig,
  disableChannelConfig,
  getChannelConfigs,
  getChannelDiagnostics,
  rotateChannelSecrets,
  testChannelConfig,
  updateChannelConfig,
  webhookUrl
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass, localDate } from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { WhatsAppQrSessionsPanel } from './WhatsAppQrSessionsPanel.jsx';

function DiagnosticChecklist({ diagnostics }) {
  if (!diagnostics) {
    return <p className="p-5 text-sm text-slate-500">Selecciona un canal para ejecutar el diagnostico.</p>;
  }
  return (
    <div className="grid gap-3 p-5 md:grid-cols-2">
      {diagnostics.checklist.map((item) => (
        <div key={item.key} className="rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <strong className="text-sm text-slate-900">{item.label}</strong>
            <Badge tone={item.status}>{item.status}</Badge>
          </div>
          <p className="mt-2 text-xs text-slate-600">{item.message}</p>
        </div>
      ))}
      <div className="rounded-lg border border-slate-200 p-4 md:col-span-2">
        <p className="text-xs font-bold uppercase text-slate-500">Consumo del periodo</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {diagnostics.usage?.metrics?.map((metric) => (
            <div key={metric.metric} className="rounded-md bg-slate-50 px-3 py-2 text-xs">
              <strong className="block text-slate-800">{metric.metric}</strong>
              <span className="text-slate-500">
                {Number(metric.usage || 0).toFixed(metric.metric === 'media_storage_mb' ? 2 : 0)}
                {' / '}
                {metric.limit > 0 ? metric.limit : 'sin limite'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChannelSettingsPage() {
  const [configs, setConfigs] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const selected = configs.find((item) => item._id === selectedId) || null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getChannelConfigs();
      setConfigs(data);
      setSelectedId((current) =>
        current && data.some((item) => item._id === current)
          ? current
          : data[0]?._id || ''
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDiagnostics = useCallback(async (id) => {
    if (!id) {
      setDiagnostics(null);
      return;
    }
    setDiagnosticsLoading(true);
    try {
      setDiagnostics(await getChannelDiagnostics(id));
    } catch (requestError) {
      setDiagnostics(null);
      setError(requestError.message);
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { refreshDiagnostics(selectedId); }, [selectedId, refreshDiagnostics]);

  async function mutate(action, success, refreshId = selectedId) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await action();
      setNotice(success || result.message);
      await load();
      if (refreshId) await refreshDiagnostics(refreshId);
      return result;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function create(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = await mutate(() => createChannelConfig({
      channel: 'whatsapp_cloud',
      displayName: data.get('displayName'),
      phoneNumberId: data.get('phoneNumberId'),
      verifyToken: data.get('verifyToken'),
      accessToken: data.get('accessToken'),
      appSecret: data.get('appSecret'),
      apiVersion: data.get('apiVersion'),
      sandboxMode: data.get('sandboxMode') === 'on',
      status: data.get('status')
    }), 'Configuracion creada.', '');
    if (result) {
      form.reset();
      setSelectedId(result._id);
    }
  }

  async function update(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      displayName: data.get('displayName'),
      phoneNumberId: data.get('phoneNumberId'),
      apiVersion: data.get('apiVersion'),
      sandboxMode: data.get('sandboxMode') === 'on',
      status: data.get('status')
    };
    if (data.get('verifyToken')) payload.verifyToken = data.get('verifyToken');
    if (data.get('accessToken')) payload.accessToken = data.get('accessToken');
    if (data.get('appSecret')) payload.appSecret = data.get('appSecret');
    await mutate(() => updateChannelConfig(selected._id, payload), 'Canal actualizado.');
  }

  async function rotateSecrets(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = Object.fromEntries(
      ['accessToken', 'appSecret', 'verifyToken', 'webhookSecret']
        .map((field) => [field, String(data.get(field) || '').trim()])
        .filter(([, value]) => value)
    );
    const result = await mutate(
      () => rotateChannelSecrets(selected._id, payload),
      'Secretos rotados correctamente.'
    );
    if (result) form.reset();
  }

  return (
    <PageShell
      eyebrow="Inbox"
      title="Configuracion de canales"
      description="WhatsApp Cloud y sesiones QR aisladas por empresa sobre un mismo Inbox."
    >
      <CrmNotice notice={notice} error={error} />
      <WhatsAppQrSessionsPanel />
      {loading ? <CrmLoading /> : (
        <>
          <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <Card>
              <CardHeader title="Canales configurados" />
              <div className="divide-y divide-slate-100">
                {configs.map((config) => (
                  <button
                    key={config._id}
                    onClick={() => setSelectedId(config._id)}
                    className={`w-full p-4 text-left ${selectedId === config._id ? 'bg-cyan-50' : 'hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{config.displayName}</span>
                      <div className="flex gap-2">
                        {config.settings?.sandboxMode ? <Badge tone="warning">sandbox</Badge> : null}
                        <Badge tone={config.status}>{config.status}</Badge>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {config.channel} - Token {config.accessTokenConfigured ? 'configurado' : 'pendiente'}
                    </p>
                  </button>
                ))}
                {!configs.length ? <p className="p-6 text-sm text-slate-500">No hay canales configurados.</p> : null}
              </div>
            </Card>

            {selected ? (
              <Card>
                <CardHeader
                  title={`Editar ${selected.displayName}`}
                  action={selected.settings?.sandboxMode ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                      <FlaskConical className="h-4 w-4" /> Sandbox
                    </span>
                  ) : null}
                />
                <form key={selected._id} onSubmit={update} className="grid gap-4 p-5 md:grid-cols-2">
                  <label className="text-xs font-semibold">Nombre<input name="displayName" defaultValue={selected.displayName} className={inputClass} /></label>
                  <label className="text-xs font-semibold">Phone Number ID<input name="phoneNumberId" defaultValue={selected.phoneNumberId || ''} className={inputClass} /></label>
                  <label className="text-xs font-semibold">API version<input name="apiVersion" defaultValue={selected.settings?.apiVersion || ''} placeholder="Ej. vXX.X configurado por Meta" className={inputClass} /></label>
                  <label className="text-xs font-semibold">Estado<select name="status" defaultValue={selected.status} className={inputClass}>{['not_configured', 'pending', 'connected', 'error', 'disabled'].map((value) => <option key={value}>{value}</option>)}</select></label>
                  <label className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900 md:col-span-2">
                    <input type="checkbox" name="sandboxMode" defaultChecked={Boolean(selected.settings?.sandboxMode)} />
                    Modo sandbox/test. Solo etiqueta el ambiente; no simula envios exitosos.
                  </label>
                  <label className="text-xs font-semibold">Nuevo verify token<input name="verifyToken" placeholder={selected.verifyTokenConfigured ? 'Configurado; deja vacio para conservar' : 'Verify token'} className={inputClass} /></label>
                  <label className="text-xs font-semibold">Nuevo access token<input type="password" name="accessToken" placeholder={selected.accessTokenConfigured ? 'Configurado; deja vacio para conservar' : 'Access token'} className={inputClass} /></label>
                  <label className="text-xs font-semibold">Nuevo app secret<input type="password" name="appSecret" placeholder={selected.appSecretConfigured ? 'Configurado; deja vacio para conservar' : 'App secret de Meta'} className={inputClass} /></label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                    <p className="text-xs font-bold uppercase text-slate-500">URL de webhook</p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="min-w-0 flex-1 break-all text-sm">{diagnostics?.webhookUrl || webhookUrl(selected._id)}</code>
                      <Button type="button" variant="secondary" onClick={() => navigator.clipboard?.writeText(diagnostics?.webhookUrl || webhookUrl(selected._id))}><Copy className="h-4 w-4" /></Button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Ultimo webhook: {localDate(selected.lastWebhookAt)}. Ultimo error: {diagnostics?.lastError || selected.error || 'ninguno'}.
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Mensajes fallidos recientes: {diagnostics?.failedMessages?.length || 0}. Los secretos nunca se devuelven.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 md:col-span-2">
                    <Button type="submit" disabled={busy}><CheckCircle2 className="h-4 w-4" />Guardar</Button>
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => mutate(() => testChannelConfig(selected._id))}><TestTube2 className="h-4 w-4" />Validar configuracion</Button>
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => mutate(() => testChannelConfig(selected._id, true))}><TestTube2 className="h-4 w-4" />Probar con Meta</Button>
                    <Button type="button" variant="secondary" disabled={diagnosticsLoading} onClick={() => refreshDiagnostics(selected._id)}><RefreshCw className="h-4 w-4" />Diagnostico</Button>
                    <Button type="button" variant="danger" disabled={busy} onClick={() => mutate(() => disableChannelConfig(selected._id), 'Canal desactivado.')}><Power className="h-4 w-4" />Desactivar</Button>
                  </div>
                </form>
              </Card>
            ) : null}
          </div>

          <Card>
            <CardHeader
              title="Diagnostico del canal"
              description="Checklist local. La prueba real con Meta solo ocurre al pulsar Probar con Meta."
              action={diagnostics ? (
                <Badge tone={diagnostics.checklist.some((item) => item.status === 'error') ? 'error' : 'ok'}>
                  {diagnostics.checklist.some((item) => item.status === 'error') ? 'requiere revision' : 'sin errores criticos'}
                </Badge>
              ) : null}
            />
            {diagnosticsLoading ? <CrmLoading label="Ejecutando diagnostico..." /> : <DiagnosticChecklist diagnostics={diagnostics} />}
          </Card>

          {selected ? (
            <Card>
              <CardHeader
                title="Rotacion manual de secretos"
                description="Solo se reemplazan los campos enviados. La respuesta y los logs no incluyen sus valores."
                action={<ShieldCheck className="h-5 w-5 text-cyan-700" />}
              />
              <form onSubmit={rotateSecrets} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
                <input type="password" name="accessToken" className={inputClass} placeholder="Nuevo access token" />
                <input type="password" name="appSecret" className={inputClass} placeholder="Nuevo app secret" />
                <input type="password" name="verifyToken" className={inputClass} placeholder="Nuevo verify token" />
                <input type="password" name="webhookSecret" className={inputClass} placeholder="Nuevo webhook secret" />
                <div className="flex items-center gap-3 md:col-span-2 xl:col-span-4">
                  <Button type="submit" disabled={busy}><RotateCw className="h-4 w-4" />Rotar secretos enviados</Button>
                  <span className="inline-flex items-center gap-2 text-xs text-amber-700">
                    <AlertTriangle className="h-4 w-4" /> Verifica el canal despues de rotar.
                  </span>
                </div>
              </form>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Preparar WhatsApp Cloud" description="Guardar y validar son locales. Probar con Meta hace una llamada real y nunca simula exito." />
            <form onSubmit={create} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              <input required name="displayName" className={inputClass} placeholder="WhatsApp Comercial" />
              <input name="phoneNumberId" className={inputClass} placeholder="Phone Number ID" />
              <input name="apiVersion" className={inputClass} placeholder="Version de Graph API" />
              <input type="password" name="verifyToken" className={inputClass} placeholder="Verify token propio" />
              <input type="password" name="accessToken" className={inputClass} placeholder="Access token de Meta" />
              <input type="password" name="appSecret" className={inputClass} placeholder="App secret para validar firmas" />
              <select name="status" defaultValue="pending" className={inputClass}><option value="pending">pending</option><option value="connected">connected</option><option value="not_configured">not_configured</option></select>
              <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 text-sm"><input type="checkbox" name="sandboxMode" /> Sandbox/test</label>
              <Button type="submit" disabled={busy}><Plus className="h-4 w-4" />Crear canal</Button>
            </form>
          </Card>
        </>
      )}
    </PageShell>
  );
}
