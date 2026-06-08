import { CheckCircle2, Send, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getPublicReferral,
  getPublicReviewRequest,
  getPublicReviewWidget,
  getPublicSatisfactionSurvey,
  submitPublicReferral,
  submitPublicReview,
  submitPublicSatisfactionSurvey
} from '../../api.js';
import { Button } from '../../components/Button.jsx';
import { inputClass } from '../../components/CrmCommon.jsx';

function PublicState({ error, loading, embedded = false, children }) {
  const height = embedded ? 'min-h-40' : 'min-h-screen';
  if (error) return <main className={`flex ${height} items-center justify-center bg-slate-50 p-6 text-center text-rose-700`}>{error}</main>;
  if (loading) return <main className={`flex ${height} items-center justify-center bg-slate-50 text-sm text-slate-500`}>Cargando...</main>;
  return children;
}

export function PublicReviewPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [rating, setRating] = useState(5);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    getPublicReviewRequest(token).then(setData).catch((requestError) => setError(requestError.message));
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setError('');
    try {
      await submitPublicReview(token, {
        rating,
        title: values.get('title'),
        comment: values.get('comment'),
        reviewerName: values.get('reviewerName'),
        reviewerEmail: values.get('reviewerEmail'),
        consent: values.get('consent') === 'on'
      });
      setSuccess(true);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return <PublicState error={error} loading={!data}>
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-9">
        {success ? <div className="py-14 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-5 text-3xl font-semibold">Gracias por tu resena</h1><p className="mt-3 text-slate-500">Tu opinion fue recibida y sera revisada.</p></div> : <>
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">{data.company.name}</p>
          <h1 className="mt-3 text-3xl font-semibold">Comparte tu experiencia</h1>
          <p className="mt-2 text-sm text-slate-500">Solicitud para {data.contactName || 'nuestro cliente'}</p>
          {!['pending', 'sent', 'opened'].includes(data.status) ? <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Esta solicitud esta {data.status} y no admite nuevas respuestas.</p> : <form onSubmit={submit} className="mt-7 space-y-4">
            <div><p className="mb-2 text-sm font-semibold">Calificacion</p><div className="flex gap-2">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} className="p-1 text-amber-500"><Star className={`h-8 w-8 ${value <= rating ? 'fill-current' : ''}`} /></button>)}</div></div>
            <input required name="reviewerName" className={inputClass} placeholder="Tu nombre" />
            <input type="email" name="reviewerEmail" className={inputClass} placeholder="Email (opcional)" />
            <input name="title" className={inputClass} placeholder="Titulo (opcional)" />
            <textarea required name="comment" maxLength="5000" className={`${inputClass} min-h-36`} placeholder="Cuentanos como fue tu experiencia" />
            <label className="flex items-start gap-2 text-sm text-slate-600"><input required type="checkbox" name="consent" className="mt-1" />Acepto que esta resena pueda ser moderada y publicada.</label>
            <Button type="submit" className="w-full" disabled={busy}><Send className="h-4 w-4" />{busy ? 'Enviando...' : 'Enviar resena'}</Button>
          </form>}
        </>}
      </div>
    </main>
  </PublicState>;
}

export function PublicReviewWidgetPage({ slug: providedSlug = '', embedded = false }) {
  const params = useParams();
  const slug = providedSlug || params.slug;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getPublicReviewWidget(slug).then(setData).catch((requestError) => setError(requestError.message));
  }, [slug]);
  const content = <div className="bg-white px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="text-center"><p className="text-xs font-bold uppercase tracking-widest text-cyan-700">{data.company.name}</p><h1 className="mt-3 text-3xl font-semibold">{data.name}</h1></div>
        {data.type === 'badge' ? <div className="mx-auto mt-8 w-fit rounded-full bg-slate-950 px-6 py-3 font-semibold text-white">{data.reviews.length} resenas publicadas</div> :
          <div className={`mt-8 grid gap-4 ${data.type === 'list' ? 'grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
            {[...data.testimonials, ...data.reviews].map((item, index) => <article key={`${item.authorName || item.reviewerName}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="flex text-amber-500">{Array.from({ length: 5 }, (_, starIndex) => <Star key={starIndex} className={`h-4 w-4 ${starIndex < item.rating ? 'fill-current' : ''}`} />)}</div><blockquote className="mt-4 text-slate-700">"{item.quote || item.comment}"</blockquote><p className="mt-4 font-semibold">{item.authorName || item.reviewerName}</p><p className="text-xs text-slate-500">{item.authorTitle || item.source}</p></article>)}
          </div>}
      </div>
    </div>;
  return <PublicState error={error} loading={!data} embedded={embedded}>
    {embedded ? content : <main className="min-h-screen bg-white">{content}</main>}
  </PublicState>;
}

function SurveyField({ question }) {
  const common = { name: question.key, required: question.required, className: inputClass };
  if (question.type === 'textarea') return <textarea {...common} className={`${inputClass} min-h-28`} />;
  if (['select', 'radio'].includes(question.type)) return <select {...common}><option value="">Selecciona</option>{question.options.map((option) => <option key={option}>{option}</option>)}</select>;
  if (question.type === 'checkbox') return <input type="checkbox" name={question.key} />;
  if (question.type === 'nps') return <select {...common}><option value="">0-10</option>{Array.from({ length: 11 }, (_, value) => <option key={value}>{value}</option>)}</select>;
  if (question.type === 'csat') return <select {...common}><option value="">1-5</option>{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select>;
  return <input type={question.type === 'number' ? 'number' : 'text'} {...common} />;
}

export function PublicSurveyPage({ slug: providedSlug = '', embedded = false }) {
  const params = useParams();
  const slug = providedSlug || params.slug;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  useEffect(() => {
    getPublicSatisfactionSurvey(slug).then(setData).catch((requestError) => setError(requestError.message));
  }, [slug]);
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = new FormData(form);
    const values = Object.fromEntries(data.questions.map((question) => [
      question.key,
      question.type === 'checkbox' ? raw.get(question.key) === 'on' : raw.get(question.key)
    ]));
    setBusy(true); setError('');
    try {
      const result = await submitPublicSatisfactionSurvey(slug, { values });
      setSuccess(result.successMessage || 'Gracias por tu respuesta.');
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  const content = <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-7 shadow-xl">
      <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">{data.company.name}</p>
      <h1 className="mt-3 text-3xl font-semibold">{data.settings.title || data.name}</h1>
      <p className="mt-2 text-slate-500">{data.settings.description}</p>
      {success ? <div className="mt-8 rounded-lg bg-emerald-50 p-5 text-emerald-800">{success}</div> : <form onSubmit={submit} className="mt-7 space-y-5">{[...data.questions].sort((a, b) => a.order - b.order).map((question) => <label key={question.key} className="block text-sm font-semibold text-slate-700">{question.label}<div className="mt-2"><SurveyField question={question} /></div></label>)}<Button className="w-full" type="submit" disabled={busy}>{busy ? 'Enviando...' : 'Enviar respuesta'}</Button></form>}
    </div>;
  return <PublicState error={error} loading={!data} embedded={embedded}>
    {embedded ? content : <main className="min-h-screen bg-slate-50 px-4 py-12">{content}</main>}
  </PublicState>;
}

export function PublicReferralPage() {
  const { programSlug, code } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    getPublicReferral(programSlug, code).then(setData).catch((requestError) => setError(requestError.message));
  }, [programSlug, code]);
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true); setError('');
    try { await submitPublicReferral(programSlug, code, values); setSuccess(true); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  return <PublicState error={error} loading={!data}>
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white"><div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/5 p-8">
      <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Programa de referidos</p>
      <h1 className="mt-3 text-4xl font-semibold">{data.program.name}</h1>
      <p className="mt-4 text-slate-300">{data.program.rewardDescription}</p>
      {data.program.refereeReward ? <p className="mt-4 rounded-lg bg-cyan-500/10 p-4 text-cyan-100">{data.program.refereeReward}</p> : null}
      {success ? <div className="mt-8 rounded-lg bg-emerald-500/10 p-5 text-emerald-200">Tu informacion fue recibida.</div> : <form onSubmit={submit} className="mt-8 space-y-4"><input required name="name" className={inputClass} placeholder="Nombre" /><input type="email" name="email" className={inputClass} placeholder="Email" /><input name="phone" className={inputClass} placeholder="Telefono" /><Button type="submit" className="w-full" disabled={busy}>{busy ? 'Enviando...' : 'Enviar'}</Button></form>}
    </div></main>
  </PublicState>;
}
