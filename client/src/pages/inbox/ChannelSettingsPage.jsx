import { CheckCircle2, Copy, Plus, Power, TestTube2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  createChannelConfig,
  disableChannelConfig,
  getChannelConfigs,
  testChannelConfig,
  updateChannelConfig,
  webhookUrl
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass, localDate } from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';

export function ChannelSettingsPage() {
  const [configs, setConfigs] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const selected = configs.find((item) => item._id === selectedId) || null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getChannelConfigs();
      setConfigs(data);
      setSelectedId((current) => current || data[0]?._id || '');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function mutate(action, success) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await action();
      setNotice(success || result.message);
      await load();
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
      status: data.get('status')
    }), 'Configuracion creada.');
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
      status: data.get('status')
    };
    if (data.get('verifyToken')) payload.verifyToken = data.get('verifyToken');
    if (data.get('accessToken')) payload.accessToken = data.get('accessToken');
    if (data.get('appSecret')) payload.appSecret = data.get('appSecret');
    await mutate(() => updateChannelConfig(selected._id, payload), 'Canal actualizado.');
  }

  return (
    <PageShell eyebrow="Inbox" title="Configuracion de canales" description="WhatsApp Cloud preparado sin revelar tokens guardados.">
      <CrmNotice notice={notice} error={error} />
      {loading ? <CrmLoading /> : (
        <>
          <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <Card>
              <CardHeader title="Canales configurados" />
              <div className="divide-y divide-slate-100">
                {configs.map((config) => <button key={config._id} onClick={() => setSelectedId(config._id)} className={`w-full p-4 text-left ${selectedId === config._id ? 'bg-cyan-50' : 'hover:bg-slate-50'}`}><div className="flex items-center justify-between"><span className="font-semibold">{config.displayName}</span><Badge tone={config.status}>{config.status}</Badge></div><p className="mt-1 text-xs text-slate-500">{config.channel} - Token {config.accessTokenConfigured ? 'configurado' : 'pendiente'}</p></button>)}
                {!configs.length ? <p className="p-6 text-sm text-slate-500">No hay canales configurados.</p> : null}
              </div>
            </Card>
            {selected ? <Card>
              <CardHeader title={`Editar ${selected.displayName}`} />
              <form key={selected._id} onSubmit={update} className="grid gap-4 p-5 md:grid-cols-2">
                <label className="text-xs font-semibold">Nombre<input name="displayName" defaultValue={selected.displayName} className={inputClass} /></label>
                <label className="text-xs font-semibold">Phone Number ID<input name="phoneNumberId" defaultValue={selected.phoneNumberId || ''} className={inputClass} /></label>
                <label className="text-xs font-semibold">API version<input name="apiVersion" defaultValue={selected.settings?.apiVersion || ''} placeholder="Ej. vXX.X configurado por Meta" className={inputClass} /></label>
                <label className="text-xs font-semibold">Estado<select name="status" defaultValue={selected.status} className={inputClass}>{['not_configured', 'pending', 'connected', 'error', 'disabled'].map((value) => <option key={value}>{value}</option>)}</select></label>
                <label className="text-xs font-semibold">Nuevo verify token<input name="verifyToken" placeholder={selected.verifyTokenConfigured ? 'Configurado; deja vacio para conservar' : 'Verify token'} className={inputClass} /></label>
                <label className="text-xs font-semibold">Nuevo access token<input type="password" name="accessToken" placeholder={selected.accessTokenConfigured ? 'Configurado; deja vacio para conservar' : 'Access token'} className={inputClass} /></label>
                <label className="text-xs font-semibold">Nuevo app secret<input type="password" name="appSecret" placeholder={selected.appSecretConfigured ? 'Configurado; deja vacio para conservar' : 'App secret de Meta'} className={inputClass} /></label>
                <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase text-slate-500">URL de webhook</p>
                  <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-sm">{webhookUrl(selected._id)}</code><Button variant="secondary" onClick={() => navigator.clipboard?.writeText(webhookUrl(selected._id))}><Copy className="h-4 w-4" /></Button></div>
                  <p className="mt-2 text-xs text-slate-500">Ultimo webhook: {localDate(selected.lastWebhookAt)}. El token guardado nunca se devuelve.</p>
                </div>
                <div className="md:col-span-2 flex flex-wrap gap-3">
                  <Button type="submit" disabled={busy}><CheckCircle2 className="h-4 w-4" />Guardar</Button>
                  <Button variant="secondary" disabled={busy} onClick={() => mutate(() => testChannelConfig(selected._id))}><TestTube2 className="h-4 w-4" />Validar configuracion</Button>
                  <Button variant="secondary" disabled={busy} onClick={() => mutate(() => testChannelConfig(selected._id, true))}><TestTube2 className="h-4 w-4" />Probar con Meta</Button>
                  <Button variant="danger" disabled={busy} onClick={() => mutate(() => disableChannelConfig(selected._id), 'Canal desactivado.')}><Power className="h-4 w-4" />Desactivar</Button>
                </div>
              </form>
            </Card> : null}
          </div>
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
              <Button type="submit" disabled={busy}><Plus className="h-4 w-4" />Crear canal</Button>
            </form>
          </Card>
        </>
      )}
    </PageShell>
  );
}
