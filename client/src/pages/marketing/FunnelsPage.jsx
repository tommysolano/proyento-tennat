import {
  Archive,
  BarChart3,
  CirclePause,
  CirclePlay,
  ExternalLink,
  Plus,
  Save
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  archiveFunnel,
  archiveFunnelStep,
  createFunnel,
  createFunnelStep,
  getBookingLinks,
  getForms,
  getFunnel,
  getFunnelAnalytics,
  getFunnels,
  getFunnelSteps,
  getLandingPages,
  getPublicFunnel,
  getSatisfactionSurveys,
  pauseFunnel,
  publishFunnel,
  publishFunnelStep,
  trackFunnelEvent,
  updateFunnel,
  updateFunnelStep
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass } from '../../components/CrmCommon.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PublicFormRenderer } from './FormsPage.jsx';
import { PublicLandingRenderer } from './LandingPagesPage.jsx';
import { PublicSurveyPage } from '../reputation/PublicReputationPages.jsx';

const stepTypes = [
  'landing',
  'form',
  'survey',
  'satisfaction_survey',
  'booking',
  'thank_you',
  'redirect'
];
const emptyFunnel = {
  name: '',
  slug: '',
  description: '',
  status: 'draft',
  settings: {
    defaultRedirectUrl: '',
    trackingEnabled: true,
    customDomainPlaceholder: '',
    entryStepId: ''
  }
};

function idOf(value) {
  return value?._id || value || '';
}

function tone(status) {
  return {
    published: 'active',
    draft: 'pending',
    paused: 'inactive',
    archived: 'disabled'
  }[status] || 'inactive';
}

function normalizeStep(step, order) {
  return {
    ...step,
    order: step.order ?? order,
    landingPageId: idOf(step.landingPageId),
    formId: idOf(step.formId),
    bookingLinkId: idOf(step.bookingLinkId),
    satisfactionSurveyId: idOf(step.satisfactionSurveyId),
    content: {
      title: '',
      description: '',
      html: '',
      ...(step.content || {})
    },
    settings: {
      redirectUrl: '',
      ...(step.settings || {}),
      nextStepId: idOf(step.settings?.nextStepId)
    }
  };
}

export function FunnelsPage() {
  const { user } = useAuth();
  const canManage = user.role === 'ADMIN';
  const [funnels, setFunnels] = useState([]);
  const [selected, setSelected] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFunnels(await getFunnels());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createNew() {
    setBusy(true);
    try {
      const created = await createFunnel({
        ...emptyFunnel,
        name: 'Nuevo funnel',
        slug: `funnel-${Date.now()}`
      });
      navigate(`/marketing/funnels/${created._id}`);
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

  async function inspect(funnel) {
    setSelected(funnel);
    try {
      setAnalytics(await getFunnelAnalytics(funnel._id));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <PageShell eyebrow="Marketing" title="Funnels" description="Secuencias publicas medibles con pasos de landing, formulario, encuesta y booking.">
      <div>{canManage ? <Button disabled={busy} onClick={createNew}><Plus className="h-4 w-4" />Nuevo funnel</Button> : null}</div>
      <CrmNotice notice={notice} error={error} />
      {loading ? <CrmLoading /> : (
        <div className="grid gap-4">
          {funnels.map((funnel) => (
            <Card key={funnel._id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{funnel.name}</h2><Badge tone={tone(funnel.status)}>{funnel.status}</Badge></div>
                  <p className="mt-1 text-sm text-slate-500">{funnel.description || 'Sin descripcion'}</p>
                  <p className="mt-2 text-xs text-slate-400">/f/{funnel.slug}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canManage ? <Button variant="secondary" onClick={() => inspect(funnel)}><BarChart3 className="h-4 w-4" />Analytics</Button> : null}
                  {canManage ? <Button as={Link} to={`/marketing/funnels/${funnel._id}`} variant="secondary">Editar</Button> : null}
                  {funnel.status === 'published' ? <Button as={Link} to={`/f/${funnel.slug}`} target="_blank" variant="secondary"><ExternalLink className="h-4 w-4" />Abrir</Button> : null}
                  {canManage && funnel.status !== 'published' && funnel.status !== 'archived' ? <Button disabled={busy} onClick={() => mutate(() => publishFunnel(funnel._id), 'Funnel publicado.')}><CirclePlay className="h-4 w-4" />Publicar</Button> : null}
                  {canManage && funnel.status === 'published' ? <Button disabled={busy} variant="secondary" onClick={() => mutate(() => pauseFunnel(funnel._id), 'Funnel pausado.')}><CirclePause className="h-4 w-4" />Pausar</Button> : null}
                  {canManage && funnel.status !== 'archived' ? <Button disabled={busy} variant="danger" onClick={() => window.confirm('Archivar funnel?') && mutate(() => archiveFunnel(funnel._id), 'Funnel archivado.')}><Archive className="h-4 w-4" /></Button> : null}
                </div>
              </div>
            </Card>
          ))}
          {!funnels.length ? <Card className="p-8 text-center text-sm text-slate-500">No hay funnels.</Card> : null}
        </div>
      )}
      {selected && analytics ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Visitas" value={analytics.views} icon={BarChart3} tone="cyan" />
            <MetricCard label="Conversiones" value={analytics.conversions} icon={BarChart3} tone="emerald" />
            <MetricCard label="Submissions" value={analytics.submissions} icon={BarChart3} tone="amber" />
            <MetricCard label="Contactos" value={analytics.contactsCreated} icon={BarChart3} tone="rose" />
          </div>
          <Card>
            <CardHeader title={`Pasos: ${selected.name}`} />
            <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
              {analytics.byStep.map((step) => <div key={step.stepId} className="rounded-lg border border-slate-200 p-4"><strong>{step.name}</strong><p className="mt-2 text-sm text-slate-500">{step.views} vistas · {step.conversions} conversiones · {step.conversionRate}%</p><p className="mt-1 text-xs text-slate-400">Abandono: {step.abandonment}</p></div>)}
            </div>
          </Card>
        </>
      ) : null}
    </PageShell>
  );
}

export function FunnelBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [funnel, setFunnel] = useState(emptyFunnel);
  const [steps, setSteps] = useState([]);
  const [references, setReferences] = useState({
    pages: [],
    forms: [],
    bookings: [],
    satisfactionSurveys: []
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const [funnelData, stepData, pages, forms, bookings, satisfactionSurveys] = await Promise.all([
      id ? getFunnel(id) : Promise.resolve(emptyFunnel),
      id ? getFunnelSteps(id) : Promise.resolve([]),
      getLandingPages({ status: 'published' }),
      getForms({ status: 'published' }),
      getBookingLinks({ status: 'active' }),
      getSatisfactionSurveys()
    ]);
    setFunnel({
      ...emptyFunnel,
      ...funnelData,
      settings: {
        ...emptyFunnel.settings,
        ...(funnelData.settings || {}),
        entryStepId: idOf(funnelData.settings?.entryStepId)
      }
    });
    setSteps(stepData.map(normalizeStep));
    setReferences({
      pages,
      forms,
      bookings,
      satisfactionSurveys: satisfactionSurveys.filter((survey) => survey.status === 'published')
    });
  }, [id]);

  useEffect(() => {
    load().catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [load]);

  function updateStep(index, patch) {
    setSteps(steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  }

  async function addStep() {
    if (!id) {
      setError('Guarda el funnel antes de agregar pasos.');
      return;
    }
    setBusy(true);
    try {
      await createFunnelStep(id, {
        name: `Paso ${steps.length + 1}`,
        slug: `paso-${steps.length + 1}`,
        type: 'landing',
        order: steps.length,
        content: { title: `Paso ${steps.length + 1}`, description: '', html: '' }
      });
      await load();
      setNotice('Step creado.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(publishAfter = false) {
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...funnel,
        settings: {
          ...funnel.settings,
          entryStepId: funnel.settings.entryStepId || null
        }
      };
      const saved = id ? await updateFunnel(id, payload) : await createFunnel(payload);
      if (id) {
        await Promise.all(steps.map((step, order) => updateFunnelStep(step._id, {
          ...step,
          order,
          landingPageId: step.landingPageId || null,
          formId: step.formId || null,
          bookingLinkId: step.bookingLinkId || null,
          satisfactionSurveyId: step.satisfactionSurveyId || null,
          settings: { ...step.settings, nextStepId: step.settings.nextStepId || null }
        })));
      }
      if (publishAfter) {
        await Promise.all(steps.filter((step) => step.status !== 'published').map((step) => publishFunnelStep(step._id)));
        await publishFunnel(saved._id);
      }
      setNotice(publishAfter ? 'Funnel y steps publicados.' : 'Funnel guardado.');
      if (!id) navigate(`/marketing/funnels/${saved._id}`, { replace: true });
      else await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function archiveStep(step) {
    setBusy(true);
    try {
      await archiveFunnelStep(step._id);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageShell title="Constructor de funnel"><CrmLoading /></PageShell>;

  return (
    <PageShell eyebrow="Marketing" title={funnel.name || 'Nuevo funnel'} description="Constructor lineal de pasos con referencias verificadas por empresa.">
      <div><Button as={Link} to="/marketing/funnels" variant="secondary">Volver</Button></div>
      <CrmNotice notice={notice} error={error} />
      <Card>
        <CardHeader title="Funnel" />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label className="text-xs font-semibold">Nombre<input className={inputClass} value={funnel.name} onChange={(event) => setFunnel({ ...funnel, name: event.target.value })} /></label>
          <label className="text-xs font-semibold">Slug<input className={inputClass} value={funnel.slug} onChange={(event) => setFunnel({ ...funnel, slug: event.target.value })} /></label>
          <label className="text-xs font-semibold md:col-span-2">Descripcion<textarea className={`${inputClass} min-h-20`} value={funnel.description} onChange={(event) => setFunnel({ ...funnel, description: event.target.value })} /></label>
          <label className="text-xs font-semibold">Step de entrada<select className={inputClass} value={funnel.settings.entryStepId} onChange={(event) => setFunnel({ ...funnel, settings: { ...funnel.settings, entryStepId: event.target.value } })}><option value="">Primer step publicado</option>{steps.map((step) => <option key={step._id} value={step._id}>{step.name}</option>)}</select></label>
          <label className="text-xs font-semibold">Redirect por defecto<input className={inputClass} value={funnel.settings.defaultRedirectUrl} onChange={(event) => setFunnel({ ...funnel, settings: { ...funnel.settings, defaultRedirectUrl: event.target.value } })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={funnel.settings.trackingEnabled} onChange={(event) => setFunnel({ ...funnel, settings: { ...funnel.settings, trackingEnabled: event.target.checked } })} />Tracking habilitado</label>
          {funnel.slug ? <p className="text-sm text-slate-500">URL publica: <code>/f/{funnel.slug}</code></p> : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Steps" description="El orden guardado define la secuencia y el calculo de abandono." action={<Button variant="secondary" disabled={busy} onClick={addStep}><Plus className="h-4 w-4" />Step</Button>} />
        <div className="space-y-4 p-5">
          {steps.map((step, index) => (
            <div key={step._id} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><strong>Paso {index + 1}</strong><Badge tone={tone(step.status)}>{step.status}</Badge></div><Button variant="danger" disabled={busy} onClick={() => window.confirm('Archivar step?') && archiveStep(step)}><Archive className="h-4 w-4" /></Button></div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-semibold">Nombre<input className={inputClass} value={step.name} onChange={(event) => updateStep(index, { name: event.target.value })} /></label>
                <label className="text-xs font-semibold">Slug<input className={inputClass} value={step.slug} onChange={(event) => updateStep(index, { slug: event.target.value })} /></label>
                <label className="text-xs font-semibold">Tipo<select className={inputClass} value={step.type} onChange={(event) => updateStep(index, { type: event.target.value })}>{stepTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                <label className="text-xs font-semibold">Siguiente step<select className={inputClass} value={step.settings.nextStepId} onChange={(event) => updateStep(index, { settings: { ...step.settings, nextStepId: event.target.value } })}><option value="">Siguiente por orden</option>{steps.filter((item) => item._id !== step._id).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
                {step.type === 'landing' ? <label className="text-xs font-semibold">Landing<select className={inputClass} value={step.landingPageId} onChange={(event) => updateStep(index, { landingPageId: event.target.value, formId: '', bookingLinkId: '' })}><option value="">Selecciona</option>{references.pages.map((page) => <option key={page._id} value={page._id}>{page.name}</option>)}</select></label> : null}
                {['form', 'survey'].includes(step.type) ? <label className="text-xs font-semibold">Formulario<select className={inputClass} value={step.formId} onChange={(event) => updateStep(index, { formId: event.target.value, landingPageId: '', bookingLinkId: '' })}><option value="">Selecciona</option>{references.forms.filter((form) => step.type !== 'survey' || form.type === 'survey').map((form) => <option key={form._id} value={form._id}>{form.name}</option>)}</select></label> : null}
                {step.type === 'booking' ? <label className="text-xs font-semibold">Booking<select className={inputClass} value={step.bookingLinkId} onChange={(event) => updateStep(index, { bookingLinkId: event.target.value, landingPageId: '', formId: '' })}><option value="">Selecciona</option>{references.bookings.map((booking) => <option key={booking._id} value={booking._id}>{booking.title}</option>)}</select></label> : null}
                {step.type === 'satisfaction_survey' ? <label className="text-xs font-semibold">Encuesta de satisfaccion<select className={inputClass} value={step.satisfactionSurveyId} onChange={(event) => updateStep(index, { satisfactionSurveyId: event.target.value, bookingLinkId: '', landingPageId: '', formId: '' })}><option value="">Selecciona</option>{references.satisfactionSurveys.map((survey) => <option key={survey._id} value={survey._id}>{survey.name}</option>)}</select></label> : null}
                <label className="text-xs font-semibold">Titulo<input className={inputClass} value={step.content.title} onChange={(event) => updateStep(index, { content: { ...step.content, title: event.target.value } })} /></label>
                <label className="text-xs font-semibold md:col-span-2">Descripcion<input className={inputClass} value={step.content.description} onChange={(event) => updateStep(index, { content: { ...step.content, description: event.target.value } })} /></label>
                {['thank_you', 'landing'].includes(step.type) ? <label className="text-xs font-semibold md:col-span-2">HTML limitado<textarea className={`${inputClass} min-h-24`} value={step.content.html} onChange={(event) => updateStep(index, { content: { ...step.content, html: event.target.value } })} /></label> : null}
                {step.type === 'redirect' ? <label className="text-xs font-semibold md:col-span-2">Redirect URL<input className={inputClass} value={step.settings.redirectUrl} onChange={(event) => updateStep(index, { settings: { ...step.settings, redirectUrl: event.target.value } })} /></label> : null}
              </div>
              {funnel.slug && step.slug ? <p className="mt-3 text-xs text-slate-400">/f/{funnel.slug}/{step.slug}</p> : null}
            </div>
          ))}
          {!steps.length ? <p className="text-sm text-slate-500">Guarda el funnel y agrega su primer step.</p> : null}
        </div>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => save(false)}><Save className="h-4 w-4" />Guardar</Button>
        <Button disabled={busy || !steps.length} onClick={() => save(true)}><CirclePlay className="h-4 w-4" />Publicar steps y funnel</Button>
      </div>
    </PageShell>
  );
}

export function PublicFunnelPage() {
  const { funnelSlug, stepSlug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getPublicFunnel(funnelSlug, stepSlug)
      .then(setData)
      .catch((requestError) => setError(requestError.message));
  }, [funnelSlug, stepSlug]);

  useEffect(() => {
    if (data?.step.type === 'redirect' && data.step.redirectUrl) {
      window.location.replace(data.step.redirectUrl);
    }
  }, [data]);

  if (error) return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-rose-700">{error}</main>;
  if (!data) return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Cargando funnel...</main>;
  const source = { funnelSlug: data.funnel.slug, stepSlug: data.step.slug };
  const nextUrl = data.step.nextStepSlug ? `/f/${data.funnel.slug}/${data.step.nextStepSlug}` : '';

  let body = null;
  if (data.step.type === 'landing' && data.step.landingPageSlug) {
    body = <PublicLandingRenderer slug={data.step.landingPageSlug} embedded />;
  } else if (['form', 'survey'].includes(data.step.type) && data.step.formSlug) {
    body = <div className="mx-auto max-w-xl"><PublicFormRenderer slug={data.step.formSlug} source={source} embedded /></div>;
  } else if (data.step.type === 'satisfaction_survey' && data.step.satisfactionSurveySlug) {
    body = <PublicSurveyPage slug={data.step.satisfactionSurveySlug} embedded />;
  } else if (data.step.type === 'booking' && data.step.bookingLinkSlug) {
    body = <div className="text-center"><h1 className="text-3xl font-semibold">{data.step.content.title || 'Reserva tu cita'}</h1><p className="mt-3 text-slate-600">{data.step.content.description}</p><Link to={`/book/${data.step.bookingLinkSlug}?funnelSlug=${encodeURIComponent(data.funnel.slug)}&stepSlug=${encodeURIComponent(data.step.slug)}`} className="mt-8 inline-flex rounded-lg bg-cyan-700 px-6 py-3 font-semibold text-white">Ver disponibilidad</Link></div>;
  } else if (data.step.type === 'redirect') {
    body = <p className="text-center text-sm text-slate-500">Redirigiendo...</p>;
  } else {
    body = <div className="text-center"><h1 className="text-4xl font-semibold">{data.step.content.title || data.step.name}</h1><p className="mt-4 text-slate-600">{data.step.content.description}</p>{data.step.content.html ? <div className="prose mx-auto mt-6" dangerouslySetInnerHTML={{ __html: data.step.content.html }} /> : null}</div>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <p className="mb-6 text-center text-xs font-bold uppercase tracking-widest text-cyan-700">{data.company.name} · {data.funnel.name}</p>
        {body}
        {nextUrl ? <div className="mt-10 text-center"><Link to={nextUrl} onClick={() => trackFunnelEvent(data.funnel.slug, data.step.slug, { type: 'button_click', label: 'next_step' }).catch(() => {})} className="inline-flex rounded-lg bg-slate-950 px-6 py-3 font-semibold text-white">Continuar</Link></div> : null}
      </div>
    </main>
  );
}
