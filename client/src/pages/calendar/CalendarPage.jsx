import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  RotateCcw,
  Settings,
  UserRound,
  XCircle
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  cancelAppointment,
  connectRealtime,
  createAppointment,
  getAppointmentMetrics,
  getAppointmentAnalytics,
  getAppointments,
  getCalendarAvailability,
  getCalendars,
  getContacts,
  getOpportunities,
  getUsers,
  rescheduleAppointment,
  updateAppointmentStatus
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { AppointmentAnalyticsPanel } from '../../components/AppointmentAnalyticsPanel.jsx';
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

const views = ['day', 'week', 'month', 'list'];
const activeStatuses = ['scheduled', 'confirmed'];
const statusLabels = {
  scheduled: 'Programada',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No asistio',
  rescheduled: 'Reprogramada'
};

function dateInput(date) {
  const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return copy.toISOString().slice(0, 10);
}

function dateTimeInput(date) {
  const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return copy.toISOString().slice(0, 16);
}

function rangeFor(anchorValue, view) {
  const anchor = new Date(`${anchorValue}T00:00:00`);
  const start = new Date(anchor);
  if (view === 'week') {
    const offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);
  }
  if (view === 'month') start.setDate(1);
  const end = new Date(start);
  if (view === 'day') end.setDate(end.getDate() + 1);
  else if (view === 'week') end.setDate(end.getDate() + 7);
  else if (view === 'month') end.setMonth(end.getMonth() + 1);
  else end.setDate(end.getDate() + 60);
  return { start, end };
}

function moveAnchor(anchorValue, view, direction) {
  const date = new Date(`${anchorValue}T00:00:00`);
  if (view === 'day') date.setDate(date.getDate() + direction);
  else if (view === 'week') date.setDate(date.getDate() + 7 * direction);
  else if (view === 'month') date.setMonth(date.getMonth() + direction);
  else date.setDate(date.getDate() + 30 * direction);
  return dateInput(date);
}

function appointmentTone(status) {
  if (status === 'confirmed') return 'active';
  if (status === 'completed') return 'completed';
  if (status === 'no_show') return 'failed';
  return status;
}

function AppointmentCard({ item, busy, onStatus, onReschedule }) {
  return (
    <article
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
      style={{ borderLeftWidth: 4, borderLeftColor: item.calendarId?.color || '#0891b2' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{item.title}</p>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(item.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {' - '}
            {new Date(item.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <Badge tone={appointmentTone(item.status)}>
          {statusLabels[item.status] || item.status}
        </Badge>
      </div>
      <div className="mt-3 space-y-1 text-xs text-slate-600">
        <p className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{item.contactId?.name || 'Sin contacto'}</p>
        <p className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{item.calendarId?.name} - {item.assignedTo?.name}</p>
        {item.location?.value ? <p>{item.location.value}</p> : null}
      </div>
      {activeStatuses.includes(item.status) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.status === 'scheduled' ? (
            <button disabled={busy} className="text-xs font-semibold text-emerald-700" onClick={() => onStatus(item, 'confirmed')}>
              Confirmar
            </button>
          ) : null}
          <button disabled={busy} className="text-xs font-semibold text-cyan-700" onClick={() => onStatus(item, 'completed')}>
            Completar
          </button>
          <button disabled={busy} className="text-xs font-semibold text-amber-700" onClick={() => onStatus(item, 'no_show')}>
            No show
          </button>
          <button disabled={busy} className="text-xs font-semibold text-violet-700" onClick={() => onReschedule(item)}>
            Reprogramar
          </button>
          <button disabled={busy} className="text-xs font-semibold text-rose-700" onClick={() => onStatus(item, 'cancelled')}>
            Cancelar
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function CalendarPage() {
  const { user, access } = useAuth();
  const [searchParams] = useSearchParams();
  const permissions = new Set(access?.permissions || []);
  const modules = new Set(access?.modules || []);
  // Las oportunidades solo alimentan el selector del formulario de cita; si el
  // usuario no puede leerlas (o su empresa no tiene el modulo), esa parte se
  // degrada en vez de romper todo el calendario.
  const canReadOpportunities = modules.has('opportunities') && [
    'opportunities:manage',
    'opportunities:read_team',
    'opportunities:read_assigned'
  ].some((permission) => permissions.has(permission));
  const [view, setView] = useState(() =>
    views.includes(searchParams.get('view')) ? searchParams.get('view') : 'week'
  );
  const [anchor, setAnchor] = useState(dateInput(new Date()));
  const [calendars, setCalendars] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [users, setUsers] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState('');
  const [availability, setAvailability] = useState([]);
  const [filters, setFilters] = useState({
    calendarId: '',
    assignedTo: '',
    status: ''
  });
  const [showCreate, setShowCreate] = useState(Boolean(searchParams.get('contactId')));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const range = useMemo(() => rangeFor(anchor, view), [anchor, view]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setAnalyticsError('');
    try {
      const requestFilters = {
        from: range.start.toISOString(),
        to: range.end.toISOString(),
        contactId: searchParams.get('contactId') || '',
        opportunityId: searchParams.get('opportunityId') || '',
        calendarId: filters.calendarId,
        assignedTo: filters.assignedTo,
        status: filters.status
      };
      const analyticsRequest = getAppointmentAnalytics({
        from: requestFilters.from,
        to: requestFilters.to,
        calendarId: requestFilters.calendarId,
        assignedTo: requestFilters.assignedTo
      })
        .then((data) => ({ data }))
        .catch((requestError) => ({ error: requestError.message }));
      // Una fuente auxiliar caida (sin modulo/permiso o error puntual) no debe
      // tumbar el calendario entero: se degrada esa parte con su valor vacio.
      const soft = (promise, fallback) => promise.catch(() => fallback);
      // Nucleo: calendarios y citas. Si esto falla, el calendario no puede
      // mostrarse y el error se propaga al AsyncState.
      const [calendarData, appointmentData] = await Promise.all([
        getCalendars({ status: 'active' }),
        getAppointments(requestFilters)
      ]);
      setCalendars(calendarData);
      setAppointments(appointmentData);

      // Auxiliares en paralelo, tolerantes a fallos y gateadas por permiso.
      const [metricData, contactData, opportunityData, userData, analyticsResult] =
        await Promise.all([
          soft(getAppointmentMetrics(), {}),
          soft(getContacts({ limit: 500 }), []),
          canReadOpportunities ? soft(getOpportunities(), []) : Promise.resolve([]),
          user.role === 'CALLCENTER' ? Promise.resolve([]) : soft(getUsers(), []),
          analyticsRequest
        ]);
      setMetrics(metricData);
      setContacts(contactData);
      setOpportunities(opportunityData);
      setUsers(userData);
      setAnalytics(analyticsResult.data || null);
      setAnalyticsError(analyticsResult.error || '');
    } catch (requestError) {
      setLoadError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [
    canReadOpportunities,
    range.start.getTime(),
    range.end.getTime(),
    searchParams,
    user.role,
    filters.calendarId,
    filters.assignedTo,
    filters.status
  ]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => connectRealtime((event) => {
    if (event.event.startsWith('appointment.')) load();
  }), [load]);
  useEffect(() => {
    const calendarId = filters.calendarId || calendars[0]?._id;
    if (!calendarId) {
      setAvailability([]);
      return;
    }
    getCalendarAvailability(calendarId, {
      from: range.start.toISOString(),
      to: range.end.toISOString(),
      assignedTo: filters.assignedTo
    })
      .then((data) => setAvailability(data.slots || []))
      .catch(() => setAvailability([]));
  }, [
    calendars,
    filters.calendarId,
    filters.assignedTo,
    range.start.getTime(),
    range.end.getTime()
  ]);

  async function mutate(action, success) {
    setBusy(true);
    setError('');
    try {
      await action();
      setNotice(success);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitAppointment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const calendar = calendars.find((item) => item._id === data.get('calendarId'));
    const allowedUserIds = new Set([user._id, ...users.map((item) => item._id)]);
    const calendarMembers = [
      calendar?.ownerUserId?._id || calendar?.ownerUserId,
      ...(calendar?.teamUserIds || []).map((item) => item?._id || item)
    ].filter(Boolean);
    const defaultAssignee = calendarMembers.find((id) => allowedUserIds.has(String(id)));
    const startAt = new Date(data.get('startAt'));
    const duration = Number(data.get('duration') || calendar?.settings?.appointmentDurationMinutes || 30);
    const payload = {
      calendarId: data.get('calendarId'),
      contactId: data.get('contactId') || null,
      opportunityId: data.get('opportunityId') || null,
      assignedTo:
        data.get('assignedTo') ||
        defaultAssignee ||
        user._id,
      title: data.get('title'),
      description: data.get('description'),
      startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + duration * 60000).toISOString(),
      source: searchParams.get('source') || 'manual'
    };
    await mutate(() => createAppointment(payload), 'Cita creada.');
    form.reset();
    setShowCreate(false);
  }

  async function changeStatus(item, status) {
    if (status === 'cancelled') {
      const reason = window.prompt('Motivo de cancelacion') || '';
      return mutate(() => cancelAppointment(item._id, reason), 'Cita cancelada.');
    }
    return mutate(
      () => updateAppointmentStatus(item._id, status),
      `Cita marcada como ${status}.`
    );
  }

  async function reschedule(item) {
    const initial = dateTimeInput(new Date(item.startAt));
    const value = window.prompt('Nueva fecha y hora (YYYY-MM-DDTHH:mm)', initial);
    if (!value) return;
    await mutate(
      () => rescheduleAppointment(item._id, { startAt: new Date(value).toISOString() }),
      'Cita reprogramada.'
    );
  }

  const days = useMemo(() => {
    const count = view === 'day' ? 1 : view === 'week' ? 7 : 0;
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(range.start);
      date.setDate(date.getDate() + index);
      return date;
    });
  }, [range.start.getTime(), view]);

  const grouped = useMemo(() => {
    const result = new Map();
    for (const item of appointments) {
      const key = dateInput(new Date(item.startAt));
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(item);
    }
    return result;
  }, [appointments]);

  const selectedCalendar = calendars[0];
  const defaultStart = new Date();
  defaultStart.setMinutes(Math.ceil(defaultStart.getMinutes() / 30) * 30, 0, 0);

  return (
    <PageShell
      eyebrow="Agenda"
      title="Calendario"
      description="Citas de tu alcance, vinculadas con contactos, oportunidades e inbox."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowCreate((value) => !value)}>
            <Plus className="h-4 w-4" />Nueva cita
          </Button>
          {user.role === 'ADMIN' ? (
            <Button as={Link} to="/calendar/settings" variant="secondary">
              <Settings className="h-4 w-4" />Configurar
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {views.map((item) => (
            <Button key={item} variant={view === item ? 'primary' : 'secondary'} onClick={() => setView(item)}>
              {item}
            </Button>
          ))}
        </div>
      </div>

      <CrmNotice notice={notice} error={error} />

      <Card>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <FormField label="Calendario" htmlFor="calendar-filter-calendar">
            <select id="calendar-filter-calendar" className={inputClass} value={filters.calendarId} onChange={(event) => setFilters((current) => ({ ...current, calendarId: event.target.value }))}>
              <option value="">Todos los calendarios</option>
              {calendars.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
          </FormField>
          {user.role !== 'CALLCENTER' ? (
            <FormField label="Responsable" htmlFor="calendar-filter-assignee">
              <select id="calendar-filter-assignee" className={inputClass} value={filters.assignedTo} onChange={(event) => setFilters((current) => ({ ...current, assignedTo: event.target.value }))}><option value="">Todos los responsables</option>{users.filter((item) => ['ADMIN', 'SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
            </FormField>
          ) : <div />}
          <FormField label="Estado de la cita" htmlFor="calendar-filter-status">
            <select id="calendar-filter-status" className={inputClass} value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">Todos los estados</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </FormField>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Hoy', metrics.today || 0, Clock3],
          ['Proximas', metrics.upcoming || 0, CalendarDays],
          ['Completadas', metrics.byStatus?.completed || 0, CheckCircle2],
          ['Canceladas / no show', (metrics.byStatus?.cancelled || 0) + (metrics.byStatus?.no_show || 0), XCircle]
        ].map(([label, value, Icon]) => (
          <Card key={label} className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>
              <Icon className="h-6 w-6 text-cyan-700" />
            </div>
          </Card>
        ))}
      </div>
      {metrics.byUser?.length ? <Card><CardHeader title="Citas por responsable" /><div className="flex flex-wrap gap-3 p-4">{metrics.byUser.map((item) => <div key={item.userId} className="rounded-lg bg-slate-50 px-4 py-3"><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-slate-500">{item.count} citas</p></div>)}</div></Card> : null}
      <Card>
        <CardHeader title="Disponibilidad basica" description="Primeros slots libres del calendario y responsable filtrados." />
        <div className="flex flex-wrap gap-2 p-4">
          {availability.slice(0, 12).map((slot) => <span key={`${slot.startAt}-${slot.assignedTo || ''}`} className="rounded-lg bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800">{new Date(slot.startAt).toLocaleString()}</span>)}
          {!availability.length ? <p className="text-sm text-slate-500">No hay slots disponibles en este rango.</p> : null}
        </div>
      </Card>

      <AppointmentAnalyticsPanel
        report={analytics}
        loading={loading}
        error={analyticsError}
        onRetry={load}
      />

      {showCreate ? (
        <Card>
          <CardHeader title="Nueva cita" description="El backend volvera a validar solapamientos y pertenencia al calendario." />
          <form onSubmit={submitAppointment} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-semibold">Calendario
              <select required name="calendarId" defaultValue={selectedCalendar?._id || ''} className={inputClass}>
                <option value="">Seleccionar</option>
                {calendars.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold">Contacto
              <select name="contactId" defaultValue={searchParams.get('contactId') || ''} className={inputClass}>
                <option value="">Sin contacto</option>
                {contacts.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </label>
            {canReadOpportunities ? <label className="text-xs font-semibold">Oportunidad
              <select name="opportunityId" defaultValue={searchParams.get('opportunityId') || ''} className={inputClass}>
                <option value="">Sin oportunidad</option>
                {opportunities.map((item) => <option key={item._id} value={item._id}>{item.title}</option>)}
              </select>
            </label> : null}
            {user.role !== 'CALLCENTER' ? (
              <label className="text-xs font-semibold">Responsable
                <select name="assignedTo" className={inputClass}>
                  <option value="">Responsable del calendario</option>
                  {users.filter((item) => ['ADMIN', 'SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => (
                    <option key={item._id} value={item._id}>{item.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="text-xs font-semibold">Titulo<input required name="title" defaultValue="Reunion" className={inputClass} /></label>
            <label className="text-xs font-semibold">Inicio<input required type="datetime-local" name="startAt" defaultValue={dateTimeInput(defaultStart)} className={inputClass} /></label>
            <label className="text-xs font-semibold">Duracion
              <select name="duration" defaultValue="30" className={inputClass}>
                {[15, 30, 45, 60, 90, 120].map((value) => <option key={value} value={value}>{value} minutos</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold">Descripcion<input name="description" className={inputClass} /></label>
            <div className="md:col-span-2 xl:col-span-4 flex gap-2">
              <Button type="submit" disabled={busy || !calendars.length}><Plus className="h-4 w-4" />Crear cita</Button>
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Cerrar</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setAnchor(moveAnchor(anchor, view, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="secondary" onClick={() => setAnchor(dateInput(new Date()))}>Hoy</Button>
            <Button variant="secondary" onClick={() => setAnchor(moveAnchor(anchor, view, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <p className="font-semibold text-slate-800">{range.start.toLocaleDateString()} - {new Date(range.end.getTime() - 1).toLocaleDateString()}</p>
          <Button variant="ghost" onClick={load}><RotateCcw className="h-4 w-4" />Actualizar</Button>
        </div>
        {loading ? <CrmLoading label="Cargando agenda..." /> : loadError ? (
          <div className="p-4"><CrmLoadError message={loadError} onRetry={load} /></div>
        ) : days.length ? (
          <div className={`grid divide-y divide-slate-100 ${view === 'week' ? 'lg:grid-cols-7 lg:divide-x lg:divide-y-0' : ''}`}>
            {days.map((day) => {
              const key = dateInput(day);
              return (
                <section key={key} className="min-h-48 p-3">
                  <h3 className="mb-3 text-sm font-bold text-slate-700">{day.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</h3>
                  <div className="space-y-3">
                    {(grouped.get(key) || []).map((item) => (
                      <AppointmentCard key={item._id} item={item} busy={busy} onStatus={changeStatus} onReschedule={reschedule} />
                    ))}
                    {!grouped.get(key)?.length ? <p className="text-xs text-slate-400">Sin citas</p> : null}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {appointments.map((item) => (
              <div key={item._id} className="grid gap-3 p-4 md:grid-cols-[180px_1fr]">
                <div className="text-sm text-slate-500">{localDate(item.startAt)}</div>
                <AppointmentCard item={item} busy={busy} onStatus={changeStatus} onReschedule={reschedule} />
              </div>
            ))}
            {!appointments.length ? <p className="p-8 text-center text-sm text-slate-500">No hay citas en el rango seleccionado.</p> : null}
          </div>
        )}
      </Card>
    </PageShell>
  );
}
