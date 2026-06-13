import { BarChart3, Link2, Plus, RefreshCw, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createCampaign,
  createIntegration,
  getCampaigns,
  getForms,
  getFunnels,
  getIntegrationEvents,
  getIntegrations,
  getLandingPages,
  getMarketingReport,
  updateCampaign,
  updateIntegration
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
import { FormField } from '../../components/FormField.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const campaignStatuses = ['draft', 'active', 'paused', 'completed', 'archived'];
const providers = [
  'inbound_webhook',
  'pixel_tag',
  'external_form',
  'external_crm',
  'external_ecommerce',
  'other'
];
const mappingEntities = [
  'contact',
  'opportunity',
  'formSubmission',
  'marketingAttribution',
  'communicationConsent'
];
const transforms = ['none', 'trim', 'lowercase', 'uppercase', 'number', 'date', 'boolean'];

export function CampaignsPage() {
  const { access } = useAuth();
  const permissions = new Set(access.permissions || []);
  const canManage = permissions.has('campaigns:manage');
  const canUseLandingPages = (access.modules || []).includes('landing_pages');
  const canUseFunnels = (access.modules || []).includes('funnels');
  const [campaigns, setCampaigns] = useState([]);
  const [references, setReferences] = useState({ forms: [], pages: [], funnels: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [items, forms, pages, funnels] = await Promise.all([
        getCampaigns(),
        canManage ? getForms().catch(() => []) : Promise.resolve([]),
        canManage && canUseLandingPages
          ? getLandingPages().catch(() => [])
          : Promise.resolve([]),
        canManage && canUseFunnels
          ? getFunnels().catch(() => [])
          : Promise.resolve([])
      ]);
      setCampaigns(items);
      setReferences({ forms, pages, funnels });
    } catch (requestError) {
      setLoadError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [canManage, canUseLandingPages, canUseFunnels]);

  useEffect(() => { load(); }, [load]);

  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await createCampaign({
        name: data.get('name'),
        description: data.get('description'),
        channel: data.get('channel'),
        source: data.get('source'),
        status: data.get('status'),
        startsAt: data.get('startsAt') || null,
        endsAt: data.get('endsAt') || null,
        budget: {
          amount: Number(data.get('budget') || 0),
          currency: data.get('currency') || 'USD'
        },
        formIds: data.getAll('formIds'),
        landingPageIds: data.getAll('landingPageIds'),
        funnelIds: data.getAll('funnelIds')
      });
      form.reset();
      setNotice('Campana creada y asociaciones sincronizadas.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(campaign, status) {
    setBusy(true);
    setError('');
    try {
      await updateCampaign(campaign._id, { status });
      setNotice(`Campana actualizada a ${status}.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell eyebrow="Marketing" title="Campanas" description="Catalogo interno para asociar captacion, CRM y conversiones sin consumir APIs publicitarias.">
      <CrmNotice notice={notice} error={error} />
      {canManage ? <Card>
        <CardHeader title="Nueva campana" description="Los recursos seleccionados deben pertenecer a esta empresa." />
        <form onSubmit={create} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="Nombre" htmlFor="campaign-name"><input id="campaign-name" name="name" required className={inputClass} /></FormField>
          <FormField label="Canal" htmlFor="campaign-channel"><input id="campaign-channel" name="channel" className={inputClass} placeholder="social, search, email" /></FormField>
          <FormField label="Fuente" htmlFor="campaign-source"><input id="campaign-source" name="source" className={inputClass} placeholder="meta, google, interno" /></FormField>
          <FormField label="Estado" htmlFor="campaign-status"><select id="campaign-status" name="status" className={inputClass}>{campaignStatuses.map((status) => <option key={status}>{status}</option>)}</select></FormField>
          <FormField label="Inicio" htmlFor="campaign-start"><input id="campaign-start" type="date" name="startsAt" className={inputClass} /></FormField>
          <FormField label="Fin" htmlFor="campaign-end"><input id="campaign-end" type="date" name="endsAt" className={inputClass} /></FormField>
          <FormField label="Presupuesto" htmlFor="campaign-budget"><input id="campaign-budget" type="number" min="0" step="0.01" name="budget" className={inputClass} /></FormField>
          <FormField label="Moneda" htmlFor="campaign-currency"><input id="campaign-currency" name="currency" defaultValue="USD" maxLength="3" className={inputClass} /></FormField>
          <FormField label="Formularios" htmlFor="campaign-forms"><select id="campaign-forms" name="formIds" multiple className={`${inputClass} min-h-24`}>{references.forms.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></FormField>
          <FormField label="Landing pages" htmlFor="campaign-pages"><select id="campaign-pages" name="landingPageIds" multiple className={`${inputClass} min-h-24`}>{references.pages.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></FormField>
          <FormField label="Funnels" htmlFor="campaign-funnels"><select id="campaign-funnels" name="funnelIds" multiple className={`${inputClass} min-h-24`}>{references.funnels.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></FormField>
          <FormField label="Descripcion" htmlFor="campaign-description"><textarea id="campaign-description" name="description" className={`${inputClass} min-h-24`} /></FormField>
          <div className="md:col-span-2 xl:col-span-4"><Button disabled={busy} type="submit"><Plus className="h-4 w-4" />Crear campana</Button></div>
        </form>
      </Card> : null}
      {loading ? <CrmLoading label="Cargando campanas..." /> : loadError ? <CrmLoadError message={loadError} onRetry={load} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {campaigns.map((campaign) => <Card key={campaign._id} className="p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{campaign.name}</h2><p className="mt-1 text-sm text-slate-500">{campaign.channel || 'Sin canal'} / {campaign.source || 'Sin fuente'}</p></div><Badge tone={campaign.status}>{campaign.status}</Badge></div>
            <p className="mt-3 text-sm text-slate-600">{campaign.description || 'Sin descripcion'}</p>
            <p className="mt-3 text-xs text-slate-400">{campaign.formIds?.length || 0} formularios / {campaign.landingPageIds?.length || 0} landings / {campaign.funnelIds?.length || 0} funnels</p>
            {canManage ? <div className="mt-4 flex gap-2"><Button disabled={busy} variant="secondary" onClick={() => setStatus(campaign, campaign.status === 'active' ? 'paused' : 'active')}>{campaign.status === 'active' ? 'Pausar' : 'Activar'}</Button></div> : null}
          </Card>)}
          {!campaigns.length ? <Card className="p-8 text-center text-sm text-slate-500">No hay campanas registradas.</Card> : null}
        </div>
      )}
    </PageShell>
  );
}

export function IntegrationsPage() {
  const { access } = useAuth();
  const canManage = (access.permissions || []).includes('integrations:manage');
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const selected = useMemo(
    () => items.find((item) => item._id === selectedId) || null,
    [items, selectedId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getIntegrations();
      setItems(data);
      setSelectedId((current) => current || data[0]?._id || '');
    } catch (requestError) {
      setLoadError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const created = await createIntegration({
        name: data.get('name'),
        provider: data.get('provider'),
        description: data.get('description'),
        webhookSecret: data.get('webhookSecret'),
        status: 'active',
        settings: {
          createContact: true,
          updateExistingContact: true,
          createOpportunity: false
        },
        mappings: []
      });
      form.reset();
      setNotice(created.setupSecret
        ? `Integracion creada. Secreto de configuracion (se muestra una sola vez): ${created.setupSecret}`
        : 'Integracion creada.');
      await load();
      setSelectedId(created._id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function addMapping(event) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await updateIntegration(selected._id, {
        mappings: [
          ...(selected.mappings || []),
          {
            externalField: data.get('externalField'),
            internalEntity: data.get('internalEntity'),
            internalField: data.get('internalField'),
            transform: data.get('transform'),
            required: data.get('required') === 'on'
          }
        ]
      });
      form.reset();
      setNotice('Mapeo guardado.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function inspectEvents(integrationId) {
    setSelectedId(integrationId);
    setBusy(true);
    setError('');
    try {
      setEvents(await getIntegrationEvents(integrationId));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell eyebrow="Marketing" title="Integraciones" description="Webhooks entrantes, mapeos permitidos y trazabilidad por empresa.">
      <CrmNotice notice={notice} error={error} />
      {canManage ? <Card>
        <CardHeader title="Nueva integracion" description="El secreto se cifra y nunca vuelve a incluirse en las respuestas." />
        <form onSubmit={create} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="Nombre" htmlFor="integration-name"><input id="integration-name" name="name" required className={inputClass} /></FormField>
          <FormField label="Proveedor" htmlFor="integration-provider"><select id="integration-provider" name="provider" className={inputClass}>{providers.map((provider) => <option key={provider}>{provider}</option>)}</select></FormField>
          <FormField label="Secreto opcional" htmlFor="integration-secret" hint="Si queda vacio, el servidor genera uno."><input id="integration-secret" type="password" name="webhookSecret" className={inputClass} autoComplete="new-password" /></FormField>
          <FormField label="Descripcion" htmlFor="integration-description"><input id="integration-description" name="description" className={inputClass} /></FormField>
          <div className="md:col-span-2 xl:col-span-4"><Button disabled={busy} type="submit"><Link2 className="h-4 w-4" />Crear integracion</Button></div>
        </form>
      </Card> : null}
      {loading ? <CrmLoading label="Cargando integraciones..." /> : loadError ? <CrmLoadError message={loadError} onRetry={load} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((integration) => <Card key={integration._id} className="p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{integration.name}</h2><p className="mt-1 text-sm text-slate-500">{integration.provider}</p></div><Badge tone={integration.status}>{integration.status}</Badge></div>
            <p className="mt-3 text-xs text-slate-500">Webhook: <code>/api/webhooks/integrations/{integration._id}</code></p>
            {integration.lastError ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{integration.lastError}</p> : null}
            <div className="mt-4 flex gap-2"><Button variant="secondary" disabled={busy} onClick={() => inspectEvents(integration._id)}><RefreshCw className="h-4 w-4" />Eventos</Button><Button variant="secondary" onClick={() => setSelectedId(integration._id)}>Mapeos</Button></div>
          </Card>)}
          {!items.length ? <Card className="p-8 text-center text-sm text-slate-500">No hay integraciones configuradas.</Card> : null}
        </div>
      )}
      {selected ? <Card>
        <CardHeader title={`Mapeos: ${selected.name}`} description="Solo se aceptan campos internos incluidos en la lista segura del backend." />
        {canManage ? <form onSubmit={addMapping} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
          <FormField label="Campo externo" htmlFor="mapping-external"><input id="mapping-external" name="externalField" required className={inputClass} placeholder="lead.email" /></FormField>
          <FormField label="Entidad" htmlFor="mapping-entity"><select id="mapping-entity" name="internalEntity" className={inputClass}>{mappingEntities.map((entity) => <option key={entity}>{entity}</option>)}</select></FormField>
          <FormField label="Campo interno" htmlFor="mapping-internal"><input id="mapping-internal" name="internalField" required className={inputClass} placeholder="email" /></FormField>
          <FormField label="Transformacion" htmlFor="mapping-transform"><select id="mapping-transform" name="transform" className={inputClass}>{transforms.map((transform) => <option key={transform}>{transform}</option>)}</select></FormField>
          <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" name="required" />Requerido</label>
          <div className="md:col-span-2 xl:col-span-5"><Button disabled={busy} type="submit"><Save className="h-4 w-4" />Agregar mapeo</Button></div>
        </form> : null}
        <div className="border-t border-slate-100 p-5 text-sm text-slate-600">{(selected.mappings || []).map((mapping) => <p key={mapping._id || `${mapping.externalField}-${mapping.internalField}`} className="py-1"><code>{mapping.externalField}</code> a <code>{mapping.internalEntity}.{mapping.internalField}</code> ({mapping.transform})</p>)}{!selected.mappings?.length ? <p>No hay mapeos configurados.</p> : null}</div>
      </Card> : null}
      {events.length ? <Card>
        <CardHeader title="Eventos recientes" />
        <div className="divide-y divide-slate-100">{events.map((event) => <div key={event._id} className="flex items-center justify-between gap-4 p-4 text-sm"><div><strong>{event.externalEventId}</strong><p className="text-xs text-slate-500">{localDate(event.createdAt)} / {event.contactId?.name || 'sin contacto'}</p></div><Badge tone={event.status}>{event.status}</Badge></div>)}</div>
      </Card> : null}
    </PageShell>
  );
}

function ReportList({ title, items, label }) {
  return <Card><CardHeader title={title} /><div className="space-y-2 p-5">{(items || []).slice(0, 10).map((item, index) => <div key={index} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{label(item._id)}</span><strong>{item.total}</strong></div>)}{!items?.length ? <p className="text-sm text-slate-500">Sin datos.</p> : null}</div></Card>;
}

export function MarketingReportsPage() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setReport(await getMarketingReport()); }
    catch (requestError) { setError(requestError.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <PageShell eyebrow="Marketing" title="Reportes"><CrmLoadError message={error} onRetry={load} /></PageShell>;
  if (!report) return <PageShell eyebrow="Marketing" title="Reportes"><CrmLoading label="Preparando reporte..." /></PageShell>;
  return <PageShell eyebrow="Marketing" title="Reportes basicos" description="Consultas agregadas preparadas para analitica futura, sin perfiles ni inteligencia del consumidor.">
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <ReportList title="Contactos por campana" items={report.contactsByCampaign} label={(value) => value?.campaignName || 'Sin campana'} />
      <ReportList title="Oportunidades por campana" items={report.opportunitiesByCampaign} label={(value) => value?.campaignName || 'Sin campana'} />
      <ReportList title="Canales de ingreso" items={report.channels} label={(value) => value || 'Sin canal'} />
      <ReportList title="Producto consultado vs comprado" items={report.productComparison} label={(value) => `${value?.consulted || 'Sin consulta'} / ${value?.purchased || 'Sin compra'}`} />
      <ReportList title="Conversiones por formulario" items={report.conversionsByForm} label={(value) => value || 'Sin formulario'} />
      <ReportList title="Errores por integracion" items={report.integrationErrors} label={(value) => value || 'Integracion'} />
    </div>
    <p className="text-xs text-slate-500"><BarChart3 className="mr-1 inline h-4 w-4" />La capa queda lista para reportes posteriores; no calcula perfiles ni recomendaciones.</p>
  </PageShell>;
}
