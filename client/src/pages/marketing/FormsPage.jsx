import {
  Archive,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CirclePause,
  CirclePlay,
  ExternalLink,
  Plus,
  Save,
  Trash2
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  archiveFormDefinition,
  createFormDefinition,
  getBookingLinks,
  getCustomFields,
  getForm,
  getFormAnalytics,
  getForms,
  getFormSubmissions,
  getPipelineStages,
  getPipelines,
  getPublicForm,
  getTags,
  getUsers,
  pauseForm,
  publishForm,
  submitPublicForm,
  updateFormDefinition
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import {
  CrmLoadError,
  CrmLoading,
  CrmNotice,
  inputClass
} from '../../components/CrmCommon.jsx';
import { FormField } from '../../components/FormField.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  publicMarketingContext,
  publicMarketingQuery
} from '../../utils/publicMarketing.js';

const fieldTypes = [
  'text', 'textarea', 'email', 'phone', 'number', 'date', 'select',
  'multiselect', 'checkbox', 'radio', 'boolean', 'hidden', 'consent'
];
const formTypes = ['lead_capture', 'contact_update', 'survey', 'booking_request', 'custom'];
const contactStatuses = [
  'nuevo', 'contactado', 'interesado', 'no_interesado',
  'seguimiento', 'cliente', 'perdido', 'cerrado'
];
const lifecycleStages = ['lead', 'prospect', 'customer', 'lost'];
const standardMappings = {
  contact: [
    'name', 'firstName', 'lastName', 'fullName', 'email', 'phone',
    'secondaryPhone', 'source', 'status', 'lifecycleStage', 'priority',
    'companyName', 'address', 'city', 'country'
  ],
  opportunity: ['title', 'value', 'source', 'priority', 'expectedCloseDate']
};

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  type: 'lead_capture',
  status: 'draft',
  fields: [],
  settings: {
    allowMultipleSubmissions: true,
    duplicateStrategy: 'update_existing',
    createContact: true,
    updateExistingContact: true,
    defaultContactStatus: 'nuevo',
    defaultLifecycleStage: 'lead',
    assignTo: '',
    addTags: [],
    createOpportunity: false,
    pipelineId: '',
    stageId: '',
    bookingLinkId: '',
    successMessage: 'Gracias. Tu informacion fue recibida.',
    redirectUrl: '',
    notifyUsers: [],
    spamProtection: true,
    honeypotField: 'website',
    minimumSubmitTimeMs: 1500,
    requireConsent: false,
    fieldMappings: []
  },
  styling: {
    primaryColor: '#0e7490',
    backgroundColor: '#ffffff',
    buttonLabel: 'Enviar'
  }
};

function idOf(value) {
  return value?._id || value || '';
}

function statusTone(status) {
  return {
    published: 'active',
    draft: 'pending',
    paused: 'inactive',
    archived: 'disabled',
    processed: 'active',
    spam: 'cancelled',
    failed: 'cancelled',
    ignored: 'inactive'
  }[status] || 'inactive';
}

function normalizeForm(form) {
  return {
    ...emptyForm,
    ...form,
    settings: {
      ...emptyForm.settings,
      ...(form.settings || {}),
      assignTo: idOf(form.settings?.assignTo),
      pipelineId: idOf(form.settings?.pipelineId),
      stageId: idOf(form.settings?.stageId),
      bookingLinkId: idOf(form.settings?.bookingLinkId),
      addTags: (form.settings?.addTags || []).map(idOf),
      notifyUsers: (form.settings?.notifyUsers || []).map(idOf)
    },
    styling: { ...emptyForm.styling, ...(form.styling || {}) },
    fields: (form.fields || []).map((field, index) => ({
      ...field,
      order: index,
      options: field.options || [],
      validation: field.validation || {},
      consentChannel: field.consentChannel || ''
    }))
  };
}

function publicTracking() {
  const createId = () =>
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let visitorId = localStorage.getItem('tenantdesk_visitor_id');
  let sessionId = sessionStorage.getItem('tenantdesk_session_id');
  if (!visitorId) {
    visitorId = createId();
    localStorage.setItem('tenantdesk_visitor_id', visitorId);
  }
  if (!sessionId) {
    sessionId = createId();
    sessionStorage.setItem('tenantdesk_session_id', sessionId);
  }
  return { visitorId, sessionId };
}

export function FormsPage({ mode = 'forms' }) {
  const { user } = useAuth();
  const canManage = user.role === 'ADMIN';
  const [forms, setForms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();
  const copy = {
    forms: {
      title: 'Formularios y encuestas',
      description: 'Captura leads, procesa respuestas y conecta cada envio con CRM y workflows.'
    },
    submissions: {
      title: 'Submissions',
      description: 'Selecciona un formulario para revisar sus respuestas y relaciones CRM.'
    },
    analytics: {
      title: 'Analytics de formularios',
      description: 'Selecciona un formulario para revisar vistas, conversion, spam y resultados CRM.'
    }
  }[mode] || {};

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getForms();
      if (!Array.isArray(data)) throw new Error('La API devolvio una lista de formularios invalida.');
      setForms(data);
    } catch (requestError) {
      setLoadError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createNew() {
    setBusy(true);
    setError('');
    try {
      const created = await createFormDefinition({
        ...emptyForm,
        name: 'Nuevo formulario',
        slug: `formulario-${Date.now()}`
      });
      navigate(`/marketing/forms/${created._id}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

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

  async function inspect(form) {
    setSelected(form);
    setError('');
    try {
      const requests = [getFormSubmissions(form._id)];
      if (canManage) requests.push(getFormAnalytics(form._id));
      const [submissionData, analyticsData] = await Promise.all(requests);
      setSubmissions(submissionData);
      setAnalytics(analyticsData || null);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <PageShell
      eyebrow="Marketing"
      title={copy.title}
      description={copy.description}
    >
      <div className="flex flex-wrap gap-2">
        {canManage && mode === 'forms' ? <Button disabled={busy} onClick={createNew}><Plus className="h-4 w-4" />Nuevo formulario</Button> : null}
      </div>
      <CrmNotice notice={notice} error={error} />
      {loading ? <CrmLoading label="Cargando formularios..." /> : loadError ? (
        <CrmLoadError message={loadError} onRetry={load} />
      ) : (
        <div className="grid gap-4">
          {forms.map((form) => (
            <Card key={form._id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-950">{form.name}</h2>
                    <Badge tone={statusTone(form.status)}>{form.status}</Badge>
                    <Badge>{form.type}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{form.description || 'Sin descripcion'}</p>
                  <p className="mt-2 text-xs text-slate-400">/forms/{form.slug} · {(form.fields || []).length} campos</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => inspect(form)}>{mode === 'analytics' ? 'Ver analytics' : 'Ver submissions'}</Button>
                  {canManage ? <Button as={Link} to={`/marketing/forms/${form._id}`} variant="secondary">Editar</Button> : null}
                  {form.status === 'published' ? <Button as={Link} to={`/forms/${form.slug}`} target="_blank" variant="secondary"><ExternalLink className="h-4 w-4" />Abrir</Button> : null}
                  {canManage && form.status !== 'published' && form.status !== 'archived' ? <Button disabled={busy} onClick={() => mutate(() => publishForm(form._id), 'Formulario publicado.')}><CirclePlay className="h-4 w-4" />Publicar</Button> : null}
                  {canManage && form.status === 'published' ? <Button disabled={busy} variant="secondary" onClick={() => mutate(() => pauseForm(form._id), 'Formulario pausado.')}><CirclePause className="h-4 w-4" />Pausar</Button> : null}
                  {canManage && form.status !== 'archived' ? <Button disabled={busy} variant="danger" onClick={() => window.confirm('Archivar formulario?') && mutate(() => archiveFormDefinition(form._id), 'Formulario archivado.')}><Archive className="h-4 w-4" /></Button> : null}
                </div>
              </div>
            </Card>
          ))}
          {!forms.length ? <Card className="p-8 text-center text-sm text-slate-500">No hay formularios creados.</Card> : null}
        </div>
      )}
      {selected ? (
        <>
          {analytics ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Vistas" value={analytics.views} icon={BarChart3} tone="cyan" />
              <MetricCard label="Submissions" value={analytics.submissions} icon={BarChart3} tone="emerald" />
              <MetricCard label="Conversion" value={`${analytics.conversionRate}%`} icon={BarChart3} tone="amber" />
              <MetricCard label="Spam" value={analytics.spam} icon={BarChart3} tone="rose" />
            </div>
          ) : null}
          <Card>
            <CardHeader title={`Submissions: ${selected.name}`} description={`${submissions.length} respuestas recientes`} />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Fecha</th><th className="p-3">Estado</th><th className="p-3">Valores</th><th className="p-3">Atribucion</th><th className="p-3">CRM</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {submissions.map((item) => (
                    <tr key={item._id}>
                      <td className="p-3">{new Date(item.createdAt).toLocaleString()}</td>
                      <td className="p-3"><Badge tone={statusTone(item.status)}>{item.status}</Badge></td>
                      <td className="max-w-lg p-3 text-xs text-slate-600">{Object.entries(item.values || {}).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`).join(' · ') || '-'}</td>
                      <td className="p-3 text-xs text-slate-600">{item.attribution?.campaignName || item.attribution?.utmCampaign || 'Sin campana'}<br />{item.attribution?.entryChannel || item.attribution?.channel || item.attribution?.utmSource || 'Sin canal'}</td>
                      <td className="p-3 text-xs">{item.contactId?.name || '-'}{item.opportunityId ? ` · ${item.opportunityId.title}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </PageShell>
  );
}

export function FormBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [options, setOptions] = useState({
    users: [], tags: [], pipelines: [], stages: [], bookings: [], customFields: []
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const results = await Promise.allSettled([
      id ? getForm(id) : Promise.resolve(emptyForm),
      getUsers(),
      getTags('contact'),
      getPipelines(),
      getBookingLinks(),
      getCustomFields()
    ]);
    const [formResult, usersResult, tagsResult, pipelinesResult, bookingsResult, customFieldsResult] = results;
    if (formResult.status === 'rejected') {
      setLoadError(formResult.reason?.message || 'No se pudo cargar el formulario.');
      setLoading(false);
      return;
    }
    if (!formResult.value || typeof formResult.value !== 'object' || (id && !formResult.value._id)) {
      setLoadError('La API devolvio un formulario invalido.');
      setLoading(false);
      return;
    }

    setForm(normalizeForm(formResult.value));
    const optionalResults = [
      ['usuarios', usersResult],
      ['tags', tagsResult],
      ['pipelines', pipelinesResult],
      ['booking links', bookingsResult],
      ['campos personalizados', customFieldsResult]
    ];
    const failed = optionalResults
      .filter(([, result]) => result.status === 'rejected' || !Array.isArray(result.value))
      .map(([label]) => label);
    setOptions((current) => ({
      ...current,
      users: usersResult.status === 'fulfilled' && Array.isArray(usersResult.value) ? usersResult.value : [],
      tags: tagsResult.status === 'fulfilled' && Array.isArray(tagsResult.value) ? tagsResult.value : [],
      pipelines: pipelinesResult.status === 'fulfilled' && Array.isArray(pipelinesResult.value) ? pipelinesResult.value : [],
      bookings: bookingsResult.status === 'fulfilled' && Array.isArray(bookingsResult.value) ? bookingsResult.value : [],
      customFields: customFieldsResult.status === 'fulfilled' && Array.isArray(customFieldsResult.value) ? customFieldsResult.value : []
    }));
    setError(
      failed.length
        ? `El formulario cargo, pero no se pudieron cargar: ${failed.join(', ')}.`
        : ''
    );
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!form.settings.pipelineId) {
      setOptions((current) => ({ ...current, stages: [] }));
      return;
    }
    getPipelineStages(form.settings.pipelineId)
      .then((stages) => setOptions((current) => ({ ...current, stages })))
      .catch((requestError) => setError(requestError.message));
  }, [form.settings.pipelineId]);

  function setSetting(field, value) {
    setForm({ ...form, settings: { ...form.settings, [field]: value } });
  }

  function updateField(index, patch) {
    setForm({
      ...form,
      fields: form.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field
      )
    });
  }

  function moveField(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= form.fields.length) return;
    const fields = [...form.fields];
    [fields[index], fields[target]] = [fields[target], fields[index]];
    setForm({ ...form, fields: fields.map((field, order) => ({ ...field, order })) });
  }

  function addField() {
    const number = form.fields.length + 1;
    setForm({
      ...form,
      fields: [...form.fields, {
        key: `campo_${number}`,
        label: `Campo ${number}`,
        type: 'text',
        required: false,
        placeholder: '',
        helpText: '',
        options: [],
        defaultValue: '',
        order: form.fields.length,
        hidden: false,
        consentChannel: '',
        validation: { maxLength: 5000 }
      }]
    });
  }

  function mappingValue(key) {
    const mapping = form.settings.fieldMappings.find((item) => item.formFieldKey === key);
    if (!mapping) return '';
    return `${mapping.targetEntity}:${mapping.customFieldKey ? `custom:${mapping.customFieldKey}` : mapping.targetField}`;
  }

  function setMapping(key, value) {
    const remaining = form.settings.fieldMappings.filter((item) => item.formFieldKey !== key);
    if (!value) {
      setSetting('fieldMappings', remaining);
      return;
    }
    const [targetEntity, fieldType, customKey] = value.split(':');
    const mapping = fieldType === 'custom'
      ? { formFieldKey: key, targetEntity, targetField: '', customFieldKey: customKey }
      : { formFieldKey: key, targetEntity, targetField: fieldType, customFieldKey: '' };
    setSetting('fieldMappings', [...remaining, mapping]);
  }

  async function save(publishAfter = false) {
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        fields: form.fields.map((field, order) => ({ ...field, order })),
        settings: {
          ...form.settings,
          assignTo: form.settings.assignTo || null,
          pipelineId: form.settings.pipelineId || null,
          stageId: form.settings.stageId || null,
          bookingLinkId: form.settings.bookingLinkId || null
        }
      };
      const saved = id
        ? await updateFormDefinition(id, payload)
        : await createFormDefinition(payload);
      if (publishAfter) await publishForm(saved._id);
      setNotice(publishAfter ? 'Formulario guardado y publicado.' : 'Formulario guardado.');
      if (!id) navigate(`/marketing/forms/${saved._id}`, { replace: true });
      else setForm(normalizeForm(publishAfter ? await getForm(saved._id) : saved));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageShell title="Constructor de formulario"><CrmLoading /></PageShell>;
  if (loadError) {
    return (
      <PageShell title="Constructor de formulario">
        <CrmLoadError message={loadError} onRetry={load} />
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Marketing" title={form.name || 'Nuevo formulario'} description="Builder simple por campos, integraciones CRM y controles publicos.">
      <div><Button as={Link} to="/marketing/forms" variant="secondary">Volver</Button></div>
      <CrmNotice notice={notice} error={error} />
      <Card>
        <CardHeader title="1. Definicion" description="Identifica el formulario y configura su presentacion publica." />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <FormField label="Nombre" htmlFor="form-builder-name" required>
            <input id="form-builder-name" required className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </FormField>
          <FormField label="Slug" htmlFor="form-builder-slug" hint="Identificador tecnico usado en la URL publica.">
            <input id="form-builder-slug" className={inputClass} value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} />
          </FormField>
          <FormField label="Tipo" htmlFor="form-builder-type">
            <select id="form-builder-type" className={inputClass} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{formTypes.map((type) => <option key={type}>{type}</option>)}</select>
          </FormField>
          <FormField label="Texto del boton" htmlFor="form-builder-button-label">
            <input id="form-builder-button-label" className={inputClass} value={form.styling.buttonLabel} onChange={(event) => setForm({ ...form, styling: { ...form.styling, buttonLabel: event.target.value } })} />
          </FormField>
          <FormField label="Descripcion" htmlFor="form-builder-description" className="md:col-span-2">
            <textarea id="form-builder-description" className={`${inputClass} min-h-20`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </FormField>
        </div>
      </Card>

      <Card>
        <CardHeader title="2. Campos" description="Ordena con los botones; el key es un identificador tecnico usado para mapeos y respuestas." action={<Button variant="secondary" onClick={addField}><Plus className="h-4 w-4" />Campo</Button>} />
        <div className="space-y-4 p-5">
          {form.fields.map((field, index) => (
            <div key={field._id || `${field.key}-${index}`} className="rounded-lg border border-slate-200 p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-semibold">Label<input className={inputClass} value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} /></label>
                <label className="text-xs font-semibold">Key<input className={inputClass} value={field.key} onChange={(event) => updateField(index, { key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} /></label>
                <label className="text-xs font-semibold">Tipo<select className={inputClass} value={field.type} onChange={(event) => updateField(index, { type: event.target.value })}>{fieldTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                <label className="text-xs font-semibold">Placeholder<input className={inputClass} value={field.placeholder} onChange={(event) => updateField(index, { placeholder: event.target.value })} /></label>
                {['select', 'multiselect', 'radio'].includes(field.type) ? <label className="text-xs font-semibold md:col-span-2">Opciones separadas por coma<input className={inputClass} value={field.options.join(', ')} onChange={(event) => updateField(index, { options: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></label> : null}
                {field.type === 'consent' ? <label className="text-xs font-semibold">Canal autorizado<select className={inputClass} value={field.consentChannel || ''} onChange={(event) => updateField(index, { consentChannel: event.target.value })}><option value="">Solo evidencia general</option>{['whatsapp', 'sms', 'email', 'call'].map((channel) => <option key={channel}>{channel}</option>)}</select></label> : null}
                <label className="text-xs font-semibold md:col-span-2">Mapeo CRM<select className={inputClass} value={mappingValue(field.key)} onChange={(event) => setMapping(field.key, event.target.value)}><option value="">Sin mapeo</option>{Object.entries(standardMappings).map(([entity, fields]) => fields.map((target) => <option key={`${entity}-${target}`} value={`${entity}:${target}`}>{entity}.{target}</option>))}{options.customFields.map((custom) => <option key={custom._id} value={`${custom.entityType}:custom:${custom.key}`}>{custom.entityType}.customFields.{custom.key}</option>)}</select></label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} />Requerido</label>
                <Button variant="secondary" onClick={() => moveField(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></Button>
                <Button variant="secondary" onClick={() => moveField(index, 1)} disabled={index === form.fields.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                <Button variant="danger" onClick={() => setForm({ ...form, fields: form.fields.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          {!form.fields.length ? <p className="text-sm text-slate-500">Agrega al menos un campo antes de publicar.</p> : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="3. Integracion y reglas" description="Define como cada envio se relaciona con CRM, oportunidades y reservas." />
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs font-semibold">Duplicados<select className={inputClass} value={form.settings.duplicateStrategy} onChange={(event) => setSetting('duplicateStrategy', event.target.value)}>{['create_new', 'update_existing', 'ignore_duplicate'].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs font-semibold">Estado inicial<select className={inputClass} value={form.settings.defaultContactStatus} onChange={(event) => setSetting('defaultContactStatus', event.target.value)}>{contactStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs font-semibold">Lifecycle<select className={inputClass} value={form.settings.defaultLifecycleStage} onChange={(event) => setSetting('defaultLifecycleStage', event.target.value)}>{lifecycleStages.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs font-semibold">Asignar a<select className={inputClass} value={form.settings.assignTo} onChange={(event) => setSetting('assignTo', event.target.value)}><option value="">Sin asignacion</option>{options.users.filter((user) => ['ADMIN', 'SUPERVISOR', 'CALLCENTER'].includes(user.role)).map((user) => <option key={user._id} value={user._id}>{user.name} ({user.role})</option>)}</select></label>
          <label className="text-xs font-semibold">Pipeline<select className={inputClass} value={form.settings.pipelineId} onChange={(event) => setSetting('pipelineId', event.target.value)}><option value="">Sin pipeline</option>{options.pipelines.map((pipeline) => <option key={pipeline._id} value={pipeline._id}>{pipeline.name}</option>)}</select></label>
          <label className="text-xs font-semibold">Etapa<select className={inputClass} value={form.settings.stageId} onChange={(event) => setSetting('stageId', event.target.value)}><option value="">Sin etapa</option>{options.stages.map((stage) => <option key={stage._id} value={stage._id}>{stage.name}</option>)}</select></label>
          <label className="text-xs font-semibold">Booking link<select className={inputClass} value={form.settings.bookingLinkId} onChange={(event) => setSetting('bookingLinkId', event.target.value)}><option value="">Sin booking</option>{options.bookings.map((booking) => <option key={booking._id} value={booking._id}>{booking.title}</option>)}</select></label>
          <label className="text-xs font-semibold">Tags<select multiple className={`${inputClass} min-h-28`} value={form.settings.addTags} onChange={(event) => setSetting('addTags', [...event.target.selectedOptions].map((option) => option.value))}>{options.tags.map((tag) => <option key={tag._id} value={tag._id}>{tag.name}</option>)}</select></label>
          <label className="text-xs font-semibold">Notificar usuarios<select multiple className={`${inputClass} min-h-28`} value={form.settings.notifyUsers} onChange={(event) => setSetting('notifyUsers', [...event.target.selectedOptions].map((option) => option.value))}>{options.users.map((user) => <option key={user._id} value={user._id}>{user.name}</option>)}</select></label>
          {[
            ['createContact', 'Crear contacto'],
            ['updateExistingContact', 'Actualizar contacto existente'],
            ['createOpportunity', 'Crear oportunidad'],
            ['allowMultipleSubmissions', 'Permitir multiples envios'],
            ['requireConsent', 'Exigir consentimiento'],
            ['spamProtection', 'Proteccion anti-spam']
          ].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.settings[key]} onChange={(event) => setSetting(key, event.target.checked)} />{label}</label>)}
        </div>
      </Card>

      <Card>
        <CardHeader title="4. Resultado publico" description="Configura la respuesta posterior al envio y las protecciones basicas." />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label className="text-xs font-semibold">Mensaje de exito<textarea className={`${inputClass} min-h-20`} value={form.settings.successMessage} onChange={(event) => setSetting('successMessage', event.target.value)} /></label>
          <label className="text-xs font-semibold">Redirect URL<input className={inputClass} value={form.settings.redirectUrl} onChange={(event) => setSetting('redirectUrl', event.target.value)} /></label>
          <label className="text-xs font-semibold">Honeypot key<input className={inputClass} value={form.settings.honeypotField} onChange={(event) => setSetting('honeypotField', event.target.value)} /></label>
          <label className="text-xs font-semibold">Tiempo minimo (ms)<input type="number" min="0" className={inputClass} value={form.settings.minimumSubmitTimeMs} onChange={(event) => setSetting('minimumSubmitTimeMs', Number(event.target.value))} /></label>
        </div>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => save(false)}><Save className="h-4 w-4" />Guardar draft</Button>
        <Button disabled={busy || !form.fields.length} onClick={() => save(true)}><CirclePlay className="h-4 w-4" />Guardar y publicar</Button>
      </div>
    </PageShell>
  );
}

function PublicField({ field, value, onChange }) {
  const common = {
    name: field.key,
    required: field.required,
    value: value ?? '',
    placeholder: field.placeholder,
    className: 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm',
    onChange: (event) => onChange(event.target.value)
  };
  if (field.hidden) return null;
  if (field.type === 'textarea') return <textarea {...common} className={`${common.className} min-h-28`} />;
  if (field.type === 'select') return <select {...common}><option value="">Selecciona</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select>;
  if (field.type === 'multiselect') return <select {...common} multiple value={value || []} onChange={(event) => onChange([...event.target.selectedOptions].map((option) => option.value))}>{field.options.map((option) => <option key={option}>{option}</option>)}</select>;
  if (field.type === 'radio') return <div className="mt-2 flex flex-wrap gap-3">{field.options.map((option) => <label key={option} className="flex items-center gap-2 text-sm"><input type="radio" name={field.key} value={option} checked={value === option} onChange={() => onChange(option)} required={field.required} />{option}</label>)}</div>;
  if (['checkbox', 'boolean', 'consent'].includes(field.type)) return <label className="mt-2 flex items-start gap-2 text-sm"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} required={field.required} /><span>{field.placeholder || field.label}</span></label>;
  if (field.type === 'hidden') return null;
  return <input {...common} type={field.type === 'phone' ? 'tel' : field.type} />;
}

export function PublicFormRenderer({ slug, source = {}, embedded = false }) {
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError('');
    setForm(null);
    getPublicForm(slug, publicMarketingQuery())
      .then((data) => {
        if (
          !data ||
          !Array.isArray(data.fields) ||
          !data.settings ||
          !data.styling ||
          !data.company
        ) {
          throw new Error('La API devolvio un formulario publico invalido.');
        }
        setForm(data);
        setValues(Object.fromEntries(data.fields.map((field) => [
          field.key,
          field.type === 'multiselect'
            ? []
            : ['checkbox', 'boolean', 'consent'].includes(field.type)
              ? Boolean(field.defaultValue)
              : field.defaultValue ?? ''
        ])));
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [slug, reloadKey]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await submitPublicForm(slug, {
        values,
        submissionToken: form.submissionToken,
        [form.settings.honeypotField]: event.currentTarget.elements[form.settings.honeypotField]?.value || '',
        source,
        ...publicMarketingContext(),
        ...publicTracking()
      });
      setResult(response);
      if (response.redirectUrl) {
        window.setTimeout(() => window.location.assign(response.redirectUrl), 1000);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6 text-center text-sm text-slate-500">Cargando formulario...</div>;
  if (error && !form) {
    return (
      <CrmLoadError
        message={error}
        onRetry={() => setReloadKey((current) => current + 1)}
      />
    );
  }
  if (result) return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center"><h2 className="text-xl font-semibold text-emerald-950">Envio recibido</h2><p className="mt-2 text-emerald-800">{result.successMessage}</p></div>;

  const content = (
    <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" style={{ backgroundColor: form.styling.backgroundColor }}>
      <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">{form.company.name}</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-950">{form.name}</h1>
      {form.description ? <p className="mt-2 text-sm text-slate-600">{form.description}</p> : null}
      <form className="mt-6 grid gap-4" onSubmit={submit}>
        {form.fields.map((field) => field.type === 'hidden' ? null : (
          <label key={field.key} className="text-xs font-semibold text-slate-700">
            {!['checkbox', 'boolean', 'consent'].includes(field.type) ? field.label : null}
            <PublicField field={field} value={values[field.key]} onChange={(value) => setValues({ ...values, [field.key]: value })} />
            {field.helpText ? <span className="mt-1 block font-normal text-slate-500">{field.helpText}</span> : null}
          </label>
        ))}
        <input name={form.settings.honeypotField} tabIndex="-1" autoComplete="off" className="hidden" />
        {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
        <button disabled={busy} className="rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: form.styling.primaryColor }}>
          {busy ? 'Enviando...' : form.styling.buttonLabel}
        </button>
        {form.settings.bookingLinkSlug ? <Link className="text-center text-sm font-semibold text-cyan-700" to={`/book/${form.settings.bookingLinkSlug}`}>Reservar una cita</Link> : null}
      </form>
    </section>
  );
  return embedded ? content : <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="w-full max-w-xl">{content}</div></main>;
}

export function PublicFormPage() {
  const { slug } = useParams();
  return <PublicFormRenderer slug={slug} />;
}
