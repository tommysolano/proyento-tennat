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
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  archiveLandingPage,
  createLandingPage,
  getBookingLinks,
  getForms,
  getLandingPage,
  getLandingPageAnalytics,
  getLandingPages,
  getPublicLandingPage,
  pauseLandingPage,
  publishLandingPage,
  trackLandingPageEvent,
  updateLandingPage
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass } from '../../components/CrmCommon.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { PublicFormRenderer } from './FormsPage.jsx';

const sectionTypes = [
  'hero', 'text', 'image', 'button', 'form_embed',
  'booking_embed', 'faq', 'custom_html_limited'
];
const emptyPage = {
  name: '',
  slug: '',
  title: '',
  description: '',
  status: 'draft',
  content: { sections: [], html: '', blocks: [] },
  seo: { title: '', description: '', imageUrl: '', noIndex: false },
  styling: {
    primaryColor: '#0e7490',
    backgroundColor: '#ffffff',
    textColor: '#0f172a'
  },
  settings: {
    redirectUrl: '',
    trackingEnabled: true,
    associatedFormId: '',
    associatedBookingLinkId: ''
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

function normalizePage(page) {
  return {
    ...emptyPage,
    ...page,
    content: {
      ...emptyPage.content,
      ...(page.content || {}),
      sections: (page.content?.sections || []).map((section, order) => ({
        ...section,
        order,
        content: section.content || {},
        settings: section.settings || {}
      }))
    },
    seo: { ...emptyPage.seo, ...(page.seo || {}) },
    styling: { ...emptyPage.styling, ...(page.styling || {}) },
    settings: {
      ...emptyPage.settings,
      ...(page.settings || {}),
      associatedFormId: idOf(page.settings?.associatedFormId),
      associatedBookingLinkId: idOf(page.settings?.associatedBookingLinkId)
    }
  };
}

function defaultContent(type) {
  return {
    hero: { eyebrow: 'Bienvenido', title: 'Una propuesta clara', text: 'Explica aqui el beneficio principal.', buttonLabel: 'Comenzar', href: '#contenido' },
    text: { title: 'Titulo de seccion', text: 'Contenido de la seccion.' },
    image: { imageUrl: 'https://images.unsplash.com/photo-1557804506-669a67965ba0', alt: 'Imagen de portada' },
    button: { label: 'Continuar', href: '/' },
    form_embed: { formId: '' },
    booking_embed: { bookingLinkId: '', label: 'Reservar una cita' },
    faq: { items: [{ question: 'Pregunta frecuente', answer: 'Respuesta breve.' }] },
    custom_html_limited: { html: '<p>Contenido HTML limitado.</p>' }
  }[type];
}

export function LandingPagesPage() {
  const [pages, setPages] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPages(await getLandingPages());
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
      const created = await createLandingPage({
        ...emptyPage,
        name: 'Nueva landing page',
        title: 'Nueva landing page',
        slug: `landing-${Date.now()}`
      });
      navigate(`/marketing/landing-pages/${created._id}`);
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

  async function inspect(page) {
    setSelected(page);
    try {
      setAnalytics(await getLandingPageAnalytics(page._id));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <PageShell eyebrow="Marketing" title="Landing Pages" description="Paginas publicas basicas construidas por secciones seguras.">
      <div><Button disabled={busy} onClick={createNew}><Plus className="h-4 w-4" />Nueva landing</Button></div>
      <CrmNotice notice={notice} error={error} />
      {loading ? <CrmLoading /> : (
        <div className="grid gap-4">
          {pages.map((page) => (
            <Card key={page._id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{page.name}</h2><Badge tone={tone(page.status)}>{page.status}</Badge></div>
                  <p className="mt-1 text-sm text-slate-500">{page.title}</p>
                  <p className="mt-2 text-xs text-slate-400">/p/{page.slug} · {page.content.sections.length} secciones</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => inspect(page)}><BarChart3 className="h-4 w-4" />Analytics</Button>
                  <Button as={Link} to={`/marketing/landing-pages/${page._id}`} variant="secondary">Editar</Button>
                  {page.status === 'published' ? <Button as={Link} to={`/p/${page.slug}`} target="_blank" variant="secondary"><ExternalLink className="h-4 w-4" />Abrir</Button> : null}
                  {page.status !== 'published' && page.status !== 'archived' ? <Button disabled={busy} onClick={() => mutate(() => publishLandingPage(page._id), 'Landing publicada.')}><CirclePlay className="h-4 w-4" />Publicar</Button> : null}
                  {page.status === 'published' ? <Button disabled={busy} variant="secondary" onClick={() => mutate(() => pauseLandingPage(page._id), 'Landing pausada.')}><CirclePause className="h-4 w-4" />Pausar</Button> : null}
                  {page.status !== 'archived' ? <Button disabled={busy} variant="danger" onClick={() => window.confirm('Archivar landing?') && mutate(() => archiveLandingPage(page._id), 'Landing archivada.')}><Archive className="h-4 w-4" /></Button> : null}
                </div>
              </div>
            </Card>
          ))}
          {!pages.length ? <Card className="p-8 text-center text-sm text-slate-500">No hay landing pages.</Card> : null}
        </div>
      )}
      {selected && analytics ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Visitas" value={analytics.views} icon={BarChart3} tone="cyan" />
          <MetricCard label="Conversiones" value={analytics.conversions} icon={BarChart3} tone="emerald" />
          <MetricCard label="Formularios" value={analytics.submissions} icon={BarChart3} tone="amber" />
          <MetricCard label="Conversion" value={`${analytics.conversionRate}%`} icon={BarChart3} tone="rose" />
        </div>
      ) : null}
    </PageShell>
  );
}

export function LandingPageBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(emptyPage);
  const [references, setReferences] = useState({ forms: [], bookings: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    Promise.all([
      id ? getLandingPage(id) : Promise.resolve(emptyPage),
      getForms({ status: 'published' }),
      getBookingLinks({ status: 'active' })
    ]).then(([pageData, forms, bookings]) => {
      setPage(normalizePage(pageData));
      setReferences({ forms, bookings });
    }).catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [id]);

  function updateSection(index, patch) {
    setPage({
      ...page,
      content: {
        ...page.content,
        sections: page.content.sections.map((section, sectionIndex) =>
          sectionIndex === index ? { ...section, ...patch } : section
        )
      }
    });
  }

  function moveSection(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= page.content.sections.length) return;
    const sections = [...page.content.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    setPage({
      ...page,
      content: {
        ...page.content,
        sections: sections.map((section, order) => ({ ...section, order }))
      }
    });
  }

  function addSection(type = 'hero') {
    setPage({
      ...page,
      content: {
        ...page.content,
        sections: [...page.content.sections, {
          type,
          order: page.content.sections.length,
          content: defaultContent(type),
          settings: {}
        }]
      }
    });
  }

  async function save(publishAfter = false) {
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...page,
        content: {
          ...page.content,
          sections: page.content.sections.map((section, order) => ({ ...section, order }))
        },
        settings: {
          ...page.settings,
          associatedFormId: page.settings.associatedFormId || null,
          associatedBookingLinkId: page.settings.associatedBookingLinkId || null
        }
      };
      const saved = id
        ? await updateLandingPage(id, payload)
        : await createLandingPage(payload);
      if (publishAfter) await publishLandingPage(saved._id);
      setNotice(publishAfter ? 'Landing guardada y publicada.' : 'Landing guardada.');
      if (!id) navigate(`/marketing/landing-pages/${saved._id}`, { replace: true });
      else setPage(normalizePage(publishAfter ? await getLandingPage(saved._id) : saved));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageShell title="Constructor de landing"><CrmLoading /></PageShell>;

  return (
    <PageShell eyebrow="Marketing" title={page.name || 'Nueva landing'} description="Builder MVP por secciones, sin editor visual complejo.">
      <div><Button as={Link} to="/marketing/landing-pages" variant="secondary">Volver</Button></div>
      <CrmNotice notice={notice} error={error} />
      <Card>
        <CardHeader title="Pagina y SEO" />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label className="text-xs font-semibold">Nombre<input className={inputClass} value={page.name} onChange={(event) => setPage({ ...page, name: event.target.value })} /></label>
          <label className="text-xs font-semibold">Slug<input className={inputClass} value={page.slug} onChange={(event) => setPage({ ...page, slug: event.target.value })} /></label>
          <label className="text-xs font-semibold">Titulo publico<input className={inputClass} value={page.title} onChange={(event) => setPage({ ...page, title: event.target.value })} /></label>
          <label className="text-xs font-semibold">SEO title<input className={inputClass} value={page.seo.title} onChange={(event) => setPage({ ...page, seo: { ...page.seo, title: event.target.value } })} /></label>
          <label className="text-xs font-semibold md:col-span-2">Descripcion<textarea className={`${inputClass} min-h-20`} value={page.description} onChange={(event) => setPage({ ...page, description: event.target.value })} /></label>
          <label className="text-xs font-semibold md:col-span-2">SEO description<textarea className={`${inputClass} min-h-20`} value={page.seo.description} onChange={(event) => setPage({ ...page, seo: { ...page.seo, description: event.target.value } })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={page.settings.trackingEnabled} onChange={(event) => setPage({ ...page, settings: { ...page.settings, trackingEnabled: event.target.checked } })} />Tracking habilitado</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={page.seo.noIndex} onChange={(event) => setPage({ ...page, seo: { ...page.seo, noIndex: event.target.checked } })} />No index</label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Secciones" action={<div className="flex gap-2"><select id="new-section-type" className={inputClass}>{sectionTypes.map((type) => <option key={type}>{type}</option>)}</select><Button variant="secondary" onClick={() => addSection(document.getElementById('new-section-type').value)}><Plus className="h-4 w-4" />Agregar</Button></div>} />
        <div className="space-y-4 p-5">
          {page.content.sections.map((section, index) => (
            <div key={section._id || index} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <select className={inputClass} value={section.type} onChange={(event) => updateSection(index, { type: event.target.value, content: defaultContent(event.target.value) })}>{sectionTypes.map((type) => <option key={type}>{type}</option>)}</select>
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={index === 0} onClick={() => moveSection(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="secondary" disabled={index === page.content.sections.length - 1} onClick={() => moveSection(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="danger" onClick={() => setPage({ ...page, content: { ...page.content, sections: page.content.sections.filter((_, itemIndex) => itemIndex !== index) } })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              {section.type === 'form_embed' ? (
                <label className="mt-3 block text-xs font-semibold">Formulario<select className={inputClass} value={idOf(section.content.formId)} onChange={(event) => updateSection(index, { content: { formId: event.target.value } })}><option value="">Selecciona</option>{references.forms.map((form) => <option key={form._id} value={form._id}>{form.name}</option>)}</select></label>
              ) : section.type === 'booking_embed' ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-semibold">Booking<select className={inputClass} value={idOf(section.content.bookingLinkId)} onChange={(event) => updateSection(index, { content: { ...section.content, bookingLinkId: event.target.value } })}><option value="">Selecciona</option>{references.bookings.map((booking) => <option key={booking._id} value={booking._id}>{booking.title}</option>)}</select></label>
                  <label className="text-xs font-semibold">Label<input className={inputClass} value={section.content.label || ''} onChange={(event) => updateSection(index, { content: { ...section.content, label: event.target.value } })} /></label>
                </div>
              ) : (
                <label className="mt-3 block text-xs font-semibold">Contenido JSON<textarea key={`${section.type}-${section._id || index}`} className={`${inputClass} min-h-40 font-mono text-xs`} defaultValue={JSON.stringify(section.content, null, 2)} onBlur={(event) => {
                  try {
                    updateSection(index, { content: JSON.parse(event.target.value) });
                    setError('');
                  } catch {
                    setError(`JSON invalido en seccion ${index + 1}`);
                  }
                }} /></label>
              )}
            </div>
          ))}
          {!page.content.sections.length ? <p className="text-sm text-slate-500">Agrega secciones para construir la pagina.</p> : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Asociaciones y estilo" />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label className="text-xs font-semibold">Formulario asociado<select className={inputClass} value={page.settings.associatedFormId} onChange={(event) => setPage({ ...page, settings: { ...page.settings, associatedFormId: event.target.value } })}><option value="">Ninguno</option>{references.forms.map((form) => <option key={form._id} value={form._id}>{form.name}</option>)}</select></label>
          <label className="text-xs font-semibold">Booking asociado<select className={inputClass} value={page.settings.associatedBookingLinkId} onChange={(event) => setPage({ ...page, settings: { ...page.settings, associatedBookingLinkId: event.target.value } })}><option value="">Ninguno</option>{references.bookings.map((booking) => <option key={booking._id} value={booking._id}>{booking.title}</option>)}</select></label>
          <label className="text-xs font-semibold">Redirect URL<input className={inputClass} value={page.settings.redirectUrl} onChange={(event) => setPage({ ...page, settings: { ...page.settings, redirectUrl: event.target.value } })} /></label>
          <label className="text-xs font-semibold">Color principal<input type="color" className={inputClass} value={page.styling.primaryColor} onChange={(event) => setPage({ ...page, styling: { ...page.styling, primaryColor: event.target.value } })} /></label>
        </div>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => save(false)}><Save className="h-4 w-4" />Guardar draft</Button>
        <Button disabled={busy || !page.content.sections.length} onClick={() => save(true)}><CirclePlay className="h-4 w-4" />Guardar y publicar</Button>
      </div>
    </PageShell>
  );
}

function LandingSection({ section, pageSlug, primaryColor }) {
  const content = section.content || {};
  if (section.type === 'hero') {
    return <section className="bg-slate-950 px-6 py-20 text-center text-white"><p className="text-xs font-bold uppercase tracking-widest text-cyan-300">{content.eyebrow}</p><h1 className="mx-auto mt-4 max-w-4xl text-4xl font-semibold sm:text-6xl">{content.title}</h1><p className="mx-auto mt-5 max-w-2xl text-slate-300">{content.text}</p>{content.buttonLabel ? <a href={content.href || '#contenido'} className="mt-8 inline-flex rounded-lg px-5 py-3 font-semibold text-white" style={{ backgroundColor: primaryColor }}>{content.buttonLabel}</a> : null}</section>;
  }
  if (section.type === 'text') return <section id="contenido" className="mx-auto max-w-4xl px-6 py-14"><h2 className="text-3xl font-semibold">{content.title}</h2><p className="mt-4 whitespace-pre-wrap leading-7 text-slate-600">{content.text}</p></section>;
  if (section.type === 'image') return <section className="mx-auto max-w-5xl px-6 py-10"><img className="w-full rounded-2xl object-cover shadow-xl" src={content.imageUrl} alt={content.alt || ''} /></section>;
  if (section.type === 'button') return <section className="px-6 py-10 text-center"><a href={content.href || '/'} onClick={() => trackLandingPageEvent(pageSlug, { type: 'button_click', label: content.label || '' }).catch(() => {})} className="inline-flex rounded-lg px-6 py-3 font-semibold text-white" style={{ backgroundColor: primaryColor }}>{content.label || 'Continuar'}</a></section>;
  if (section.type === 'form_embed' && content.formSlug) return <section className="mx-auto max-w-xl px-4 py-12"><PublicFormRenderer slug={content.formSlug} source={{ landingSlug: pageSlug }} embedded /></section>;
  if (section.type === 'booking_embed' && content.bookingLinkSlug) return <section className="px-6 py-12 text-center"><Link className="inline-flex rounded-lg px-6 py-3 font-semibold text-white" style={{ backgroundColor: primaryColor }} to={`/book/${content.bookingLinkSlug}?landingSlug=${encodeURIComponent(pageSlug)}`}>{content.label || 'Reservar una cita'}</Link></section>;
  if (section.type === 'faq') return <section className="mx-auto max-w-4xl space-y-3 px-6 py-14">{(content.items || []).map((item, index) => <details key={index} className="rounded-lg border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold">{item.question}</summary><p className="mt-3 text-slate-600">{item.answer}</p></details>)}</section>;
  if (section.type === 'custom_html_limited') return <section className="mx-auto max-w-4xl px-6 py-12" dangerouslySetInnerHTML={{ __html: content.html || '' }} />;
  return null;
}

export function PublicLandingRenderer({ slug, embedded = false }) {
  const [page, setPage] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getPublicLandingPage(slug)
      .then((data) => {
        setPage(data);
        document.title = data.seo.title || data.title;
      })
      .catch((requestError) => setError(requestError.message));
  }, [slug]);
  if (error) return <div className="flex min-h-64 items-center justify-center p-6 text-rose-700">{error}</div>;
  if (!page) return <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">Cargando pagina...</div>;
  const content = <div style={{ backgroundColor: page.styling.backgroundColor, color: page.styling.textColor }}>{page.content.sections.map((section, index) => <LandingSection key={section.id || index} section={section} pageSlug={slug} primaryColor={page.styling.primaryColor} />)}</div>;
  return embedded ? content : <main className="min-h-screen">{content}</main>;
}

export function PublicLandingPage() {
  const { slug } = useParams();
  return <PublicLandingRenderer slug={slug} />;
}
