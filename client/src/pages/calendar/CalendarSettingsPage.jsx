import {
  Archive,
  CalendarPlus,
  Clock3,
  Copy,
  Link2,
  Plus,
  Save,
  Trash2
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  archiveBookingLink,
  archiveCalendar,
  createAvailabilityException,
  createAvailabilityRule,
  createBookingLink,
  createCalendar,
  deleteAvailabilityException,
  deleteAvailabilityRule,
  getAvailabilityExceptions,
  getAvailabilityRules,
  getBookingLinks,
  getCalendars,
  getUsers,
  updateBookingLink,
  updateCalendar
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass } from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

export function CalendarSettingsPage() {
  const { user } = useAuth();
  const [calendars, setCalendars] = useState([]);
  const [users, setUsers] = useState([]);
  const [links, setLinks] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [rules, setRules] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const selected = calendars.find((item) => item._id === selectedId) || null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [calendarData, userData, linkData] = await Promise.all([
        getCalendars(),
        getUsers(),
        getBookingLinks()
      ]);
      setCalendars(calendarData);
      setUsers(userData);
      setLinks(linkData);
      setSelectedId((current) =>
        calendarData.some((item) => item._id === current)
          ? current
          : calendarData[0]?._id || ''
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAvailability = useCallback(async () => {
    if (!selectedId) {
      setRules([]);
      setExceptions([]);
      return;
    }
    try {
      const [ruleData, exceptionData] = await Promise.all([
        getAvailabilityRules(selectedId),
        getAvailabilityExceptions(selectedId)
      ]);
      setRules(ruleData);
      setExceptions(exceptionData);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAvailability(); }, [loadAvailability]);

  async function mutate(action, success, { reloadAll = false } = {}) {
    setBusy(true);
    setError('');
    try {
      await action();
      setNotice(success);
      if (reloadAll) await load();
      else await loadAvailability();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCalendar(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await mutate(
      () => createCalendar({
        name: data.get('name'),
        type: data.get('type'),
        ownerUserId: data.get('ownerUserId'),
        teamUserIds: data.getAll('teamUserIds'),
        timezone: data.get('timezone'),
        color: data.get('color')
      }),
      'Calendario creado.',
      { reloadAll: true }
    );
    form.reset();
  }

  async function saveCalendar(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate(
      () => updateCalendar(selectedId, {
        name: data.get('name'),
        description: data.get('description'),
        type: data.get('type'),
        ownerUserId: data.get('ownerUserId'),
        teamUserIds: data.getAll('teamUserIds'),
        timezone: data.get('timezone'),
        color: data.get('color'),
        settings: {
          appointmentDurationMinutes: Number(data.get('appointmentDurationMinutes')),
          slotIntervalMinutes: Number(data.get('slotIntervalMinutes')),
          bufferBeforeMinutes: Number(data.get('bufferBeforeMinutes')),
          bufferAfterMinutes: Number(data.get('bufferAfterMinutes')),
          minNoticeMinutes: Number(data.get('minNoticeMinutes')),
          maxDaysInAdvance: Number(data.get('maxDaysInAdvance')),
          reminderMinutesBefore: Number(data.get('reminderMinutesBefore')),
          locationType: data.get('locationType'),
          locationValue: data.get('locationValue'),
          requireContact: data.get('requireContact') === 'on',
          allowReschedule: data.get('allowReschedule') === 'on',
          allowCancel: data.get('allowCancel') === 'on',
          preventOverlaps: data.get('preventOverlaps') === 'on'
        }
      }),
      'Configuracion guardada.',
      { reloadAll: true }
    );
  }

  async function submitRule(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await mutate(
      () => createAvailabilityRule(selectedId, {
        dayOfWeek: Number(data.get('dayOfWeek')),
        startTime: data.get('startTime'),
        endTime: data.get('endTime'),
        userId: data.get('userId') || null
      }),
      'Regla agregada.'
    );
    form.reset();
  }

  async function submitException(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await mutate(
      () => createAvailabilityException(selectedId, {
        date: data.get('date'),
        type: data.get('type'),
        startTime: data.get('startTime'),
        endTime: data.get('endTime'),
        userId: data.get('userId') || null,
        reason: data.get('reason')
      }),
      'Excepcion agregada.'
    );
    form.reset();
  }

  async function submitLink(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await mutate(
      () => createBookingLink({
        calendarId: selectedId,
        title: data.get('title'),
        slug: data.get('slug'),
        description: data.get('description'),
        allowedFields: data.getAll('allowedFields'),
        requireApproval: data.get('requireApproval') === 'on',
        thankYouMessage: data.get('thankYouMessage')
      }),
      'Enlace publico creado.',
      { reloadAll: true }
    );
    form.reset();
  }

  const calendarUsers = selected
    ? [selected.ownerUserId, ...(selected.teamUserIds || [])].filter(Boolean)
    : [];
  const calendarLinks = links.filter((item) => item.calendarId?._id === selectedId);

  return (
    <PageShell
      eyebrow="Agenda"
      title="Configuracion de calendarios"
      description="Horarios semanales, excepciones, buffers, recordatorios y enlaces publicos."
    >
      <div><Button as={Link} to="/calendar" variant="secondary">Volver al calendario</Button></div>
      <CrmNotice notice={notice} error={error} />
      {loading ? <CrmLoading /> : (
        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader title="Calendarios" />
              <div className="space-y-2 p-4">
                {calendars.map((item) => (
                  <button
                    key={item._id}
                    onClick={() => setSelectedId(item._id)}
                    className={`w-full rounded-lg border p-3 text-left ${selectedId === item._id ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{item.name}</span>
                      <span className="h-3 w-3 rounded-full" style={{ background: item.color }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.type} - {item.timezone}</p>
                  </button>
                ))}
                {!calendars.length ? <p className="text-sm text-slate-500">Crea tu primer calendario.</p> : null}
              </div>
            </Card>
            <Card>
              <CardHeader title="Crear calendario" />
              <form onSubmit={submitCalendar} className="space-y-3 p-4">
                <input required name="name" className={inputClass} placeholder="Nombre" />
                <select name="type" className={inputClass}><option value="personal">Personal</option><option value="team">Equipo</option><option value="service">Servicio</option></select>
                <select required name="ownerUserId" defaultValue={user._id} className={inputClass}>
                  {users.filter((item) => ['ADMIN', 'SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                </select>
                <select multiple name="teamUserIds" className={`${inputClass} min-h-28`}>
                  {users.filter((item) => item._id !== user._id).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                </select>
                <input required name="timezone" defaultValue="America/Guayaquil" className={inputClass} />
                <input name="color" type="color" defaultValue="#0891b2" className={`${inputClass} h-11`} />
                <Button type="submit" disabled={busy}><CalendarPlus className="h-4 w-4" />Crear</Button>
              </form>
            </Card>
          </div>

          {selected ? <div className="space-y-6">
            <Card>
              <CardHeader
                title={selected.name}
                description="Configuracion general y de slots"
                action={<Button variant="danger" disabled={busy} onClick={() => {
                  if (window.confirm('Archivar calendario?')) mutate(() => archiveCalendar(selected._id), 'Calendario archivado.', { reloadAll: true });
                }}><Archive className="h-4 w-4" />Archivar</Button>}
              />
              <form key={selected._id} onSubmit={saveCalendar} className="grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs font-semibold">Nombre<input required name="name" defaultValue={selected.name} className={inputClass} /></label>
                <label className="text-xs font-semibold">Tipo<select name="type" defaultValue={selected.type} className={inputClass}><option value="personal">Personal</option><option value="team">Equipo</option><option value="service">Servicio</option></select></label>
                <label className="text-xs font-semibold">Color<input name="color" type="color" defaultValue={selected.color} className={`${inputClass} h-11`} /></label>
                <label className="text-xs font-semibold">Zona horaria<input name="timezone" defaultValue={selected.timezone} className={inputClass} /></label>
                <label className="text-xs font-semibold">Propietario<select name="ownerUserId" defaultValue={selected.ownerUserId?._id} className={inputClass}>{users.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
                <label className="text-xs font-semibold">Equipo<select multiple name="teamUserIds" defaultValue={selected.teamUserIds?.map((item) => item._id)} className={`${inputClass} min-h-24`}>{users.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
                <label className="text-xs font-semibold lg:col-span-3">Descripcion<input name="description" defaultValue={selected.description} className={inputClass} /></label>
                {[
                  ['appointmentDurationMinutes', 'Duracion base'],
                  ['slotIntervalMinutes', 'Intervalo de slots'],
                  ['bufferBeforeMinutes', 'Buffer antes'],
                  ['bufferAfterMinutes', 'Buffer despues'],
                  ['minNoticeMinutes', 'Anticipacion minima'],
                  ['maxDaysInAdvance', 'Dias maximos'],
                  ['reminderMinutesBefore', 'Recordatorio antes']
                ].map(([name, label]) => <label key={name} className="text-xs font-semibold">{label}<input required min="0" type="number" name={name} defaultValue={selected.settings?.[name]} className={inputClass} /></label>)}
                <label className="text-xs font-semibold">Ubicacion<select name="locationType" defaultValue={selected.settings?.locationType} className={inputClass}>{['none', 'phone', 'in_person', 'google_meet_placeholder', 'zoom_placeholder', 'custom_url'].map((value) => <option key={value}>{value}</option>)}</select></label>
                <label className="text-xs font-semibold lg:col-span-2">Detalle de ubicacion<input name="locationValue" defaultValue={selected.settings?.locationValue} className={inputClass} /></label>
                <div className="flex flex-wrap gap-4 lg:col-span-3">
                  {[
                    ['requireContact', 'Requerir contacto'],
                    ['allowReschedule', 'Permitir reprogramar'],
                    ['allowCancel', 'Permitir cancelar'],
                    ['preventOverlaps', 'Evitar solapamientos']
                  ].map(([name, label]) => <label key={name} className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={selected.settings?.[name]} />{label}</label>)}
                </div>
                <div className="lg:col-span-3"><Button type="submit" disabled={busy}><Save className="h-4 w-4" />Guardar</Button></div>
              </form>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Horario semanal" description="Una regla general o por integrante." />
                <form onSubmit={submitRule} className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2">
                  <select name="dayOfWeek" className={inputClass}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select>
                  <select name="userId" className={inputClass}><option value="">Todo el calendario</option>{calendarUsers.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
                  <input required type="time" name="startTime" defaultValue="09:00" className={inputClass} />
                  <input required type="time" name="endTime" defaultValue="17:00" className={inputClass} />
                  <Button type="submit" disabled={busy}><Plus className="h-4 w-4" />Agregar regla</Button>
                </form>
                <div className="space-y-2 p-4">
                  {rules.map((rule) => <div key={rule._id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm"><div><strong>{weekdays[rule.dayOfWeek]}</strong> {rule.startTime}-{rule.endTime}<p className="text-xs text-slate-500">{rule.userId?.name || 'General'}</p></div><button onClick={() => mutate(() => deleteAvailabilityRule(rule._id), 'Regla eliminada.')}><Trash2 className="h-4 w-4 text-rose-600" /></button></div>)}
                </div>
              </Card>

              <Card>
                <CardHeader title="Excepciones" description="Bloqueos o aperturas extraordinarias." />
                <form onSubmit={submitException} className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2">
                  <input required type="date" name="date" className={inputClass} />
                  <select name="type" className={inputClass}><option value="unavailable">No disponible</option><option value="available_override">Disponible extra</option></select>
                  <input type="time" name="startTime" className={inputClass} />
                  <input type="time" name="endTime" className={inputClass} />
                  <select name="userId" className={inputClass}><option value="">Todo el calendario</option>{calendarUsers.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
                  <input name="reason" placeholder="Motivo" className={inputClass} />
                  <Button type="submit" disabled={busy}><Clock3 className="h-4 w-4" />Agregar excepcion</Button>
                </form>
                <div className="space-y-2 p-4">
                  {exceptions.map((item) => <div key={item._id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm"><div><strong>{item.date}</strong> <Badge tone={item.type === 'unavailable' ? 'cancelled' : 'active'}>{item.type}</Badge><p className="text-xs text-slate-500">{item.startTime ? `${item.startTime}-${item.endTime}` : 'Todo el dia'} {item.reason}</p></div><button onClick={() => mutate(() => deleteAvailabilityException(item._id), 'Excepcion eliminada.')}><Trash2 className="h-4 w-4 text-rose-600" /></button></div>)}
                </div>
              </Card>
            </div>

            <Card id="booking-links">
              <CardHeader title="Enlaces publicos" description="No incluyen integraciones externas; reservan sobre la disponibilidad interna." />
              <form onSubmit={submitLink} className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-2">
                <input required name="title" placeholder="Titulo publico" className={inputClass} />
                <input name="slug" placeholder="slug-opcional" className={inputClass} />
                <input name="description" placeholder="Descripcion" className={inputClass} />
                <input name="thankYouMessage" defaultValue="Tu cita fue registrada correctamente." className={inputClass} />
                <fieldset className="flex flex-wrap gap-3 text-sm md:col-span-2">
                  {['name', 'email', 'phone', 'notes'].map((field) => <label key={field} className="flex gap-1"><input type="checkbox" name="allowedFields" value={field} defaultChecked={field !== 'notes'} />{field}</label>)}
                  <label className="flex gap-1"><input type="checkbox" name="requireApproval" />Requiere aprobacion</label>
                </fieldset>
                <Button type="submit" disabled={busy}><Link2 className="h-4 w-4" />Crear enlace</Button>
              </form>
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {calendarLinks.map((item) => {
                  const url = `${window.location.origin}/book/${item.slug}`;
                  return <div key={item._id} className="rounded-lg border border-slate-200 p-4"><div className="flex items-start justify-between"><div><p className="font-semibold">{item.title}</p><p className="mt-1 break-all text-xs text-cyan-700">{url}</p></div><Badge tone={item.publicEnabled ? 'active' : 'inactive'}>{item.publicEnabled ? 'publico' : 'oculto'}</Badge></div><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => navigator.clipboard.writeText(url)}><Copy className="h-4 w-4" />Copiar</Button><Button variant="secondary" onClick={() => mutate(() => updateBookingLink(item._id, { publicEnabled: !item.publicEnabled }), 'Enlace actualizado.', { reloadAll: true })}>{item.publicEnabled ? 'Ocultar' : 'Publicar'}</Button><Button variant="danger" onClick={() => mutate(() => archiveBookingLink(item._id), 'Enlace archivado.', { reloadAll: true })}><Trash2 className="h-4 w-4" /></Button></div></div>;
                })}
              </div>
            </Card>
          </div> : <Card className="p-8 text-center text-slate-500">Selecciona o crea un calendario.</Card>}
        </div>
      )}
    </PageShell>
  );
}
