import {
  Archive,
  BarChart3,
  Check,
  Clipboard,
  ExternalLink,
  MessageSquareReply,
  Pause,
  Plus,
  Quote,
  Send,
  Star,
  X
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  approveReview,
  archiveReview,
  archiveReviewWidget,
  archiveSatisfactionSurvey,
  archiveTestimonial,
  cancelReviewRequest,
  createReviewRequest,
  createReviewWidget,
  createSatisfactionSurvey,
  createTestimonialFromReview,
  getContacts,
  getReputationOverview,
  getReviewRequests,
  getReviews,
  getReviewWidgets,
  getSatisfactionSurveys,
  getSurveyAnalytics,
  getSurveyResponses,
  getTestimonials,
  pauseSatisfactionSurvey,
  publishReview,
  publishReviewWidget,
  publishSatisfactionSurvey,
  publishTestimonial,
  rejectReview,
  respondToReview,
  updateSatisfactionSurvey,
  updateTestimonial
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass, localDate } from '../../components/CrmCommon.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';

const publicBase = () =>
  String(import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin).replace(/\/$/, '');

function statusTone(status) {
  return {
    published: 'active',
    approved: 'active',
    completed: 'active',
    opened: 'pending',
    pending: 'pending',
    new: 'pending',
    draft: 'pending',
    rejected: 'disabled',
    archived: 'disabled',
    cancelled: 'disabled',
    paused: 'inactive'
  }[status] || 'inactive';
}

function Stars({ rating }) {
  return (
    <span className="inline-flex text-amber-500">
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} className={`h-4 w-4 ${index < rating ? 'fill-current' : ''}`} />
      ))}
    </span>
  );
}

function usePageData(loader) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await loader());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [loader]);
  useEffect(() => { load(); }, [load]);
  return { data, setData, loading, error, setError, load };
}

export function ReputationPage() {
  const loader = useCallback(() => getReputationOverview(), []);
  const { data, loading, error } = usePageData(loader);
  if (loading) return <PageShell title="Reputacion"><CrmLoading /></PageShell>;
  const metrics = [
    ['Rating promedio', data?.averageRating || 0],
    ['Reviews', data?.totalReviews || 0],
    ['Pendientes', data?.pendingReviews || 0],
    ['Publicadas', data?.publishedReviews || 0],
    ['Reviews negativas', data?.negativeReviews || 0],
    ['Solicitudes pendientes', data?.pendingReviewRequests || 0],
    ['Testimonios publicados', data?.publishedTestimonials || 0],
    ['NPS promedio', data?.npsAverage || 0],
    ['CSAT promedio', data?.csatAverage || 0],
    ['Cupones redimidos', data?.couponsRedeemed || 0],
    ['Referidos convertidos', data?.referralsConverted || 0]
  ];
  const quickLinks = [
    ['Solicitudes', '/reputation/requests'],
    ['Resenas', '/reputation/reviews'],
    ['Testimonios', '/reputation/testimonials'],
    ['Widgets', '/reputation/widgets'],
    ['Encuestas', '/reputation/surveys'],
    ['Cupones', '/reputation/coupons'],
    ['Referidos', '/reputation/referrals']
  ];
  return (
    <PageShell eyebrow="Fase 10" title="Reputacion" description="Resenas, satisfaccion y fidelizacion conectadas al CRM.">
      <CrmNotice error={error} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => (
          <MetricCard key={label} label={label} value={value} icon={BarChart3} tone="cyan" />
        ))}
      </div>
      <Card>
        <CardHeader title="Accesos rapidos" />
        <div className="flex flex-wrap gap-2 p-5">
          {quickLinks.map(([label, to]) => <Button key={to} as={Link} to={to} variant="secondary">{label}</Button>)}
        </div>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Reviews recientes" />
          <div className="space-y-3 p-5">
            {(data?.recentReviews || []).map((review) => (
              <div key={review._id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between"><Stars rating={review.rating} /><Badge tone={statusTone(review.status)}>{review.status}</Badge></div>
                <p className="mt-2 text-sm font-medium">{review.contactId?.name || review.reviewerName}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{review.comment}</p>
              </div>
            ))}
            {!data?.recentReviews?.length ? <p className="text-sm text-slate-500">Sin reviews todavia.</p> : null}
          </div>
        </Card>
        <Card>
          <CardHeader title="Solicitudes recientes" />
          <div className="space-y-3 p-5">
            {(data?.pendingRequests || []).map((request) => (
              <div key={request._id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div><p className="font-medium">{request.contactId?.name}</p><p className="text-xs text-slate-500">{localDate(request.requestedAt)}</p></div>
                <Badge tone={statusTone(request.status)}>{request.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}

export function ReviewRequestsPage() {
  const loader = useCallback(() => Promise.all([getReviewRequests(), getContacts({ limit: 500 })]), []);
  const { data, loading, error, setError, load } = usePageData(loader);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const requests = data?.[0] || [];
  const contacts = data?.[1] || [];

  async function create(event) {
    event.preventDefault();
    setBusy(true); setError('');
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await createReviewRequest({
        contactId: values.get('contactId'),
        channel: values.get('channel'),
        expiresAt: values.get('expiresAt') || undefined
      });
      form.reset();
      setNotice('Solicitud creada.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function mutate(action, message) {
    setBusy(true); setError('');
    try { await action(); setNotice(message); await load(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return (
    <PageShell eyebrow="Reputacion" title="Solicitudes de resena" description="Links seguros por contacto, sin envio externo automatico.">
      <CrmNotice notice={notice} error={error} />
      <Card>
        <CardHeader title="Nueva solicitud" />
        <form onSubmit={create} className="grid gap-3 p-5 md:grid-cols-4">
          <select required name="contactId" className={inputClass}><option value="">Contacto</option>{contacts.map((contact) => <option key={contact._id} value={contact._id}>{contact.name}</option>)}</select>
          <select name="channel" className={inputClass}><option value="manual">Manual</option><option value="internal">Interno</option><option value="whatsapp_planned">WhatsApp planned</option><option value="email_planned">Email planned</option><option value="sms_planned">SMS planned</option></select>
          <input type="datetime-local" name="expiresAt" className={inputClass} />
          <Button type="submit" disabled={busy}><Send className="h-4 w-4" />Crear solicitud</Button>
        </form>
      </Card>
      {loading ? <CrmLoading /> : (
        <div className="grid gap-4">
          {requests.map((request) => (
            <Card key={request._id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2"><h2 className="font-semibold">{request.contactId?.name}</h2><Badge tone={statusTone(request.status)}>{request.status}</Badge></div>
                  <p className="mt-1 text-xs text-slate-500">{request.channel} - vence {localDate(request.expiresAt)}</p>
                  <p className="mt-2 break-all text-xs text-slate-400">{request.publicUrl}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => navigator.clipboard.writeText(request.publicUrl)}><Clipboard className="h-4 w-4" />Copiar</Button>
                  {!['completed', 'expired', 'cancelled'].includes(request.status) ? <Button variant="danger" disabled={busy} onClick={() => mutate(() => cancelReviewRequest(request._id), 'Solicitud cancelada.')}><X className="h-4 w-4" />Cancelar</Button> : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}

export function ReviewsPage() {
  const [filters, setFilters] = useState({ status: '', rating: '', source: '' });
  const loader = useCallback(() => getReviews(filters), [filters]);
  const { data: loadedReviews, loading, error, setError, load } = usePageData(loader);
  const reviews = loadedReviews || [];
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function mutate(action, message) {
    setBusy(true); setError('');
    try { await action(); setNotice(message); await load(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  function response(review) {
    const text = window.prompt('Respuesta interna', review.responseText || '');
    if (text) mutate(() => respondToReview(review._id, text), 'Respuesta guardada.');
  }

  return (
    <PageShell eyebrow="Reputacion" title="Resenas" description="Moderacion, publicacion y respuestas internas.">
      <CrmNotice notice={notice} error={error} />
      <div className="grid gap-3 md:grid-cols-3">
        <select className={inputClass} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Todos los estados</option>{['new', 'approved', 'rejected', 'published', 'archived'].map((value) => <option key={value}>{value}</option>)}</select>
        <select className={inputClass} value={filters.rating} onChange={(event) => setFilters({ ...filters, rating: event.target.value })}><option value="">Cualquier rating</option>{[5, 4, 3, 2, 1].map((value) => <option key={value}>{value}</option>)}</select>
        <select className={inputClass} value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}><option value="">Cualquier origen</option>{['internal', 'google_placeholder', 'facebook_placeholder', 'imported'].map((value) => <option key={value}>{value}</option>)}</select>
      </div>
      {loading ? <CrmLoading /> : (
        <div className="grid gap-4">
          {reviews.map((review) => (
            <Card key={review._id} className="p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2"><Stars rating={review.rating} /><Badge tone={statusTone(review.status)}>{review.status}</Badge><Badge tone={review.sentiment}>{review.sentiment}</Badge></div>
                  <h2 className="mt-3 font-semibold">{review.title || review.reviewerName}</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{review.comment}</p>
                  <p className="mt-3 text-xs text-slate-400">{review.contactId?.name || review.reviewerName} - {localDate(review.createdAt)}</p>
                  {review.responseText ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><strong>Respuesta:</strong> {review.responseText}</p> : null}
                </div>
                <div className="flex max-w-xl flex-wrap gap-2">
                  {review.status === 'new' || review.status === 'rejected' ? <Button disabled={busy} onClick={() => mutate(() => approveReview(review._id), 'Resena aprobada.')}><Check className="h-4 w-4" />Aprobar</Button> : null}
                  {['new', 'approved'].includes(review.status) ? <Button disabled={busy} variant="secondary" onClick={() => mutate(() => rejectReview(review._id), 'Resena rechazada.')}><X className="h-4 w-4" />Rechazar</Button> : null}
                  {review.status === 'approved' ? <Button disabled={busy} onClick={() => mutate(() => publishReview(review._id), 'Resena publicada.')}><ExternalLink className="h-4 w-4" />Publicar</Button> : null}
                  {['approved', 'published'].includes(review.status) ? <Button disabled={busy} variant="secondary" onClick={() => mutate(() => createTestimonialFromReview(review._id), 'Testimonio creado.')}><Quote className="h-4 w-4" />Testimonio</Button> : null}
                  <Button disabled={busy} variant="secondary" onClick={() => response(review)}><MessageSquareReply className="h-4 w-4" />Responder</Button>
                  {review.status !== 'archived' ? <Button disabled={busy} variant="danger" onClick={() => mutate(() => archiveReview(review._id), 'Resena archivada.')}><Archive className="h-4 w-4" /></Button> : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}

export function TestimonialsPage() {
  const loader = useCallback(() => getTestimonials(), []);
  const { data: loadedItems, loading, error, setError, load } = usePageData(loader);
  const items = loadedItems || [];
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function mutate(action, message) {
    setBusy(true); setError('');
    try { await action(); setNotice(message); await load(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  return (
    <PageShell eyebrow="Reputacion" title="Testimonios" description="Contenido publico derivado de resenas aprobadas.">
      <CrmNotice notice={notice} error={error} />
      {loading ? <CrmLoading /> : <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <Card key={item._id} className="p-5">
            <div className="flex items-center justify-between"><Stars rating={item.rating} /><Badge tone={statusTone(item.status)}>{item.status}</Badge></div>
            <blockquote className="mt-4 text-lg text-slate-700">"{item.quote}"</blockquote>
            <p className="mt-3 font-semibold">{item.authorName}</p><p className="text-sm text-slate-500">{item.authorTitle}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => {
                const quote = window.prompt('Testimonio', item.quote);
                if (quote === null) return;
                const authorName = window.prompt('Autor', item.authorName);
                if (authorName === null) return;
                const authorTitle = window.prompt('Cargo o contexto', item.authorTitle || '');
                if (authorTitle !== null) {
                  mutate(
                    () => updateTestimonial(item._id, { quote, authorName, authorTitle }),
                    'Testimonio actualizado.'
                  );
                }
              }}>Editar</Button>
              <Button variant="secondary" disabled={busy} onClick={() => mutate(() => updateTestimonial(item._id, { featured: !item.featured }), item.featured ? 'Destacado removido.' : 'Testimonio destacado.')}>{item.featured ? 'Quitar featured' : 'Featured'}</Button>
              <Button variant="secondary" disabled={busy} onClick={() => {
                const order = window.prompt('Orden', item.order);
                if (order !== null) mutate(() => updateTestimonial(item._id, { order: Number(order) }), 'Orden actualizado.');
              }}>Orden {item.order}</Button>
              {item.status !== 'published' ? <Button disabled={busy} onClick={() => mutate(() => publishTestimonial(item._id), 'Testimonio publicado.')}>Publicar</Button> : null}
              {item.status !== 'archived' ? <Button variant="danger" disabled={busy} onClick={() => mutate(() => archiveTestimonial(item._id), 'Testimonio archivado.')}><Archive className="h-4 w-4" /></Button> : null}
            </div>
          </Card>
        ))}
      </div>}
    </PageShell>
  );
}

export function ReviewWidgetsPage() {
  const loader = useCallback(() => getReviewWidgets(), []);
  const { data: loadedWidgets, loading, error, setError, load } = usePageData(loader);
  const widgets = loadedWidgets || [];
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function create(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError('');
    try {
      await createReviewWidget({
        name: data.get('name'),
        slug: data.get('slug'),
        type: data.get('type'),
        settings: {
          minRating: Number(data.get('minRating')),
          maxItems: Number(data.get('maxItems')),
          onlyFeatured: data.get('onlyFeatured') === 'on'
        }
      });
      form.reset(); setNotice('Widget creado.'); await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  async function mutate(action, message) {
    setBusy(true); setError('');
    try { await action(); setNotice(message); await load(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  return (
    <PageShell eyebrow="Reputacion" title="Widgets de resenas" description="Embeds publicos sin datos internos del tenant.">
      <CrmNotice notice={notice} error={error} />
      <Card>
        <CardHeader title="Nuevo widget" />
        <form onSubmit={create} className="grid gap-3 p-5 md:grid-cols-3 xl:grid-cols-6">
          <input required name="name" className={inputClass} placeholder="Nombre" />
          <input required name="slug" className={inputClass} placeholder="slug-global" />
          <select name="type" className={inputClass}>{['grid', 'carousel', 'list', 'badge'].map((value) => <option key={value}>{value}</option>)}</select>
          <input name="minRating" type="number" min="1" max="5" defaultValue="4" className={inputClass} />
          <input name="maxItems" type="number" min="1" max="100" defaultValue="12" className={inputClass} />
          <Button type="submit" disabled={busy}><Plus className="h-4 w-4" />Crear</Button>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="onlyFeatured" />Solo featured</label>
        </form>
      </Card>
      {loading ? <CrmLoading /> : <div className="grid gap-4">
        {widgets.map((widget) => {
          const url = `${publicBase()}/widgets/reviews/${widget.slug}`;
          const embed = `<iframe src="${url}" title="${widget.name}" loading="lazy"></iframe>`;
          return <Card key={widget._id} className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div><div className="flex items-center gap-2"><h2 className="font-semibold">{widget.name}</h2><Badge tone={statusTone(widget.status)}>{widget.status}</Badge></div><p className="mt-1 text-sm text-slate-500">{widget.type} - min {widget.settings.minRating} estrellas</p></div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => navigator.clipboard.writeText(url)}><Clipboard className="h-4 w-4" />URL</Button>
                <Button variant="secondary" onClick={() => navigator.clipboard.writeText(embed)}>Embed</Button>
                {widget.status === 'published' ? <Button as={Link} to={`/widgets/reviews/${widget.slug}`} target="_blank" variant="secondary"><ExternalLink className="h-4 w-4" />Preview</Button> : null}
                {widget.status !== 'published' ? <Button disabled={busy} onClick={() => mutate(() => publishReviewWidget(widget._id), 'Widget publicado.')}>Publicar</Button> : null}
                {widget.status !== 'archived' ? <Button variant="danger" disabled={busy} onClick={() => mutate(() => archiveReviewWidget(widget._id), 'Widget archivado.')}><Archive className="h-4 w-4" /></Button> : null}
              </div>
            </div>
          </Card>;
        })}
      </div>}
    </PageShell>
  );
}

export function SurveysPage() {
  const loader = useCallback(() => getSatisfactionSurveys(), []);
  const { data: loadedSurveys, loading, error, setError, load } = usePageData(loader);
  const surveys = loadedSurveys || [];
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [insight, setInsight] = useState(null);
  async function create(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError('');
    try {
      const type = data.get('type');
      const questionsText = data.get('questions');
      await createSatisfactionSurvey({
        name: data.get('name'),
        slug: data.get('slug'),
        type,
        questions: questionsText ? JSON.parse(questionsText) : undefined
      });
      form.reset(); setNotice('Encuesta creada.'); await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  async function mutate(action, message) {
    setBusy(true); setError('');
    try { await action(); setNotice(message); await load(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  async function inspect(survey) {
    try {
      const [analytics, responses] = await Promise.all([
        getSurveyAnalytics(survey._id),
        getSurveyResponses(survey._id)
      ]);
      setInsight({ survey, analytics, responses });
    } catch (requestError) { setError(requestError.message); }
  }
  return (
    <PageShell eyebrow="Reputacion" title="Encuestas NPS y CSAT" description="Encuestas publicas ligeras con analytics por empresa.">
      <CrmNotice notice={notice} error={error} />
      <Card>
        <CardHeader title="Nueva encuesta" />
        <form onSubmit={create} className="grid gap-3 p-5 md:grid-cols-3">
          <input required name="name" className={inputClass} placeholder="Nombre" />
          <input required name="slug" className={inputClass} placeholder="slug-global" />
          <select name="type" className={inputClass}>{['nps', 'csat', 'custom'].map((value) => <option key={value}>{value}</option>)}</select>
          <textarea name="questions" className={`${inputClass} min-h-24 font-mono text-xs md:col-span-2`} placeholder='Opcional JSON: [{"key":"comentario","label":"Comentario","type":"textarea","required":false,"order":1}]' />
          <Button type="submit" disabled={busy}><Plus className="h-4 w-4" />Crear encuesta</Button>
        </form>
      </Card>
      {loading ? <CrmLoading /> : <div className="grid gap-4">
        {surveys.map((survey) => (
          <Card key={survey._id} className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div><div className="flex items-center gap-2"><h2 className="font-semibold">{survey.name}</h2><Badge tone={statusTone(survey.status)}>{survey.status}</Badge></div><p className="mt-1 text-sm text-slate-500">{survey.type} - {survey.questions.length} preguntas</p></div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => {
                  const questions = window.prompt(
                    'Preguntas en JSON',
                    JSON.stringify(survey.questions.map(({ key, label, type, required, options, order }) => ({
                      key, label, type, required, options, order
                    })), null, 2)
                  );
                  if (questions !== null) {
                    try {
                      const parsed = JSON.parse(questions);
                      mutate(
                        () => updateSatisfactionSurvey(survey._id, { questions: parsed }),
                        'Preguntas actualizadas.'
                      );
                    } catch {
                      setError('El JSON de preguntas no es valido.');
                    }
                  }
                }}>Editar preguntas</Button>
                <Button variant="secondary" onClick={() => inspect(survey)}><BarChart3 className="h-4 w-4" />Respuestas</Button>
                {survey.status === 'published' ? <Button as={Link} to={`/surveys/${survey.slug}`} target="_blank" variant="secondary"><ExternalLink className="h-4 w-4" />Abrir</Button> : null}
                {survey.status !== 'published' && survey.status !== 'archived' ? <Button disabled={busy} onClick={() => mutate(() => publishSatisfactionSurvey(survey._id), 'Encuesta publicada.')}>Publicar</Button> : null}
                {survey.status === 'published' ? <Button variant="secondary" disabled={busy} onClick={() => mutate(() => pauseSatisfactionSurvey(survey._id), 'Encuesta pausada.')}><Pause className="h-4 w-4" />Pausar</Button> : null}
                {survey.status !== 'archived' ? <Button variant="danger" disabled={busy} onClick={() => mutate(() => archiveSatisfactionSurvey(survey._id), 'Encuesta archivada.')}><Archive className="h-4 w-4" /></Button> : null}
              </div>
            </div>
          </Card>
        ))}
      </div>}
      {insight ? <Card>
        <CardHeader title={`Analytics: ${insight.survey.name}`} description={`${insight.analytics.totalResponses} respuestas`} />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <MetricCard label="NPS" value={insight.analytics.nps} icon={BarChart3} tone="cyan" />
          <MetricCard label="NPS promedio" value={insight.analytics.npsAverage} icon={BarChart3} tone="amber" />
          <MetricCard label="CSAT promedio" value={insight.analytics.csatAverage} icon={BarChart3} tone="emerald" />
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto px-5 pb-5">{insight.responses.map((response) => <div key={response._id} className="rounded-lg border border-slate-200 p-3 text-sm"><span className="font-semibold">{localDate(response.createdAt)}</span> - NPS {response.npsScore ?? '-'} / CSAT {response.csatScore ?? '-'}</div>)}</div>
      </Card> : null}
    </PageShell>
  );
}
