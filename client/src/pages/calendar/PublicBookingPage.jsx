import { CalendarDays, CheckCircle2, Clock3, MapPin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  createPublicAppointment,
  getPublicBookingAvailability,
  getPublicBookingLink
} from '../../api.js';

function dateKey(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function PublicBookingPage() {
  const { slug } = useParams();
  const [link, setLink] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const from = new Date();
        const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
        const [linkData, availability] = await Promise.all([
          getPublicBookingLink(slug),
          getPublicBookingAvailability(slug, {
            from: from.toISOString(),
            to: to.toISOString()
          })
        ]);
        if (!active) return;
        setLink(linkData);
        setSlots(availability.slots);
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [slug]);

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const slot of slots) {
      const key = dateKey(slot.startAt, link?.calendar.timezone);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(slot);
    }
    return [...groups.entries()];
  }, [slots, link?.calendar.timezone]);

  async function submit(event) {
    event.preventDefault();
    if (!selected) {
      setError('Selecciona una hora disponible.');
      return;
    }
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const response = await createPublicAppointment(slug, {
        name: data.get('name'),
        email: data.get('email'),
        phone: data.get('phone'),
        notes: data.get('notes'),
        startAt: selected
      });
      setResult(response);
      if (response.redirectUrl) {
        window.setTimeout(() => window.location.assign(response.redirectUrl), 1200);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Consultando disponibilidad...</main>;
  }

  if (error && !link) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="max-w-md rounded-xl border border-rose-200 bg-white p-8 text-center"><h1 className="text-xl font-semibold">Reserva no disponible</h1><p className="mt-3 text-sm text-rose-700">{error}</p></div></main>;
  }

  if (result) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <section className="w-full max-w-lg rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-xl">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-950">Reserva registrada</h1>
          <p className="mt-3 text-slate-600">{result.thankYouMessage}</p>
          <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            {new Date(result.appointment.startAt).toLocaleString([], { timeZone: result.appointment.timezone })} ({result.appointment.timezone})
          </div>
        </section>
      </main>
    );
  }

  const allowed = new Set(link.allowedFields);
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.75fr_1.25fr]">
        <aside className="rounded-2xl bg-slate-950 p-7 text-white shadow-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">{link.company.name}</p>
          <h1 className="mt-4 text-3xl font-semibold">{link.title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{link.description || link.calendar.description}</p>
          <div className="mt-8 space-y-4 text-sm text-slate-200">
            <p className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-cyan-300" />{link.calendar.durationMinutes} minutos</p>
            <p className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-cyan-300" />Zona horaria: {link.calendar.timezone}</p>
            <p className="flex items-center gap-3"><MapPin className="h-5 w-5 text-cyan-300" />{link.calendar.locationType.replaceAll('_', ' ')}</p>
          </div>
          {link.requireApproval ? <p className="mt-8 rounded-lg bg-amber-300/10 p-3 text-xs text-amber-200">La empresa confirmara la cita despues de recibir tu solicitud.</p> : null}
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-slate-950">Selecciona fecha y hora</h2>
          <div className="mt-4 max-h-72 space-y-4 overflow-y-auto pr-2">
            {grouped.map(([day, daySlots]) => (
              <div key={day}>
                <p className="mb-2 text-sm font-semibold text-slate-700">{new Date(daySlots[0].startAt).toLocaleDateString([], { timeZone: link.calendar.timezone, weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map((slot) => (
                    <button
                      type="button"
                      key={slot.startAt}
                      onClick={() => setSelected(slot.startAt)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold ${selected === slot.startAt ? 'border-cyan-700 bg-cyan-700 text-white' : 'border-slate-200 text-slate-700 hover:border-cyan-400'}`}
                    >
                      {new Date(slot.startAt).toLocaleTimeString([], { timeZone: link.calendar.timezone, hour: '2-digit', minute: '2-digit' })}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!slots.length ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No hay horarios disponibles en los proximos 14 dias.</p> : null}
          </div>

          <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
            {allowed.has('name') ? <label className="text-xs font-semibold text-slate-600">Nombre<input required name="name" maxLength="120" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label> : null}
            {allowed.has('email') ? <label className="text-xs font-semibold text-slate-600">Email<input type="email" name="email" maxLength="180" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label> : null}
            {allowed.has('phone') ? <label className="text-xs font-semibold text-slate-600">Telefono<input name="phone" maxLength="40" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label> : null}
            {allowed.has('notes') ? <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Notas<textarea name="notes" maxLength="1000" className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label> : null}
            {error ? <p className="text-sm font-medium text-rose-700 sm:col-span-2">{error}</p> : null}
            <button disabled={busy || !selected} className="rounded-lg bg-cyan-700 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50 sm:col-span-2">
              {busy ? 'Registrando...' : 'Confirmar reserva'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
