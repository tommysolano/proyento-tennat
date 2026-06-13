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
  applyCalendarProfile,
  createAvailabilityException,
  createAvailabilityRule,
  createBookingLink,
  createCalendar,
  deleteAvailabilityException,
  deleteAvailabilityRule,
  getAvailabilityExceptions,
  getAvailabilityRules,
  getBookingLinks,
  getCalendarProfiles,
  getCalendars,
  getUsers,
  updateBookingLink,
  updateCalendar
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
import { PageShell } from '../../components/PageShell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const clientFieldOptions = [
  ['consultationReason', 'Motivo de consulta', 'textarea'],
  ['age', 'Edad', 'number'],
  ['document', 'Documento', 'text'],
  ['vehicleMake', 'Marca del vehiculo', 'text'],
  ['vehicleModel', 'Modelo del vehiculo', 'text'],
  ['licensePlate', 'Placa', 'text'],
  ['serviceReason', 'Motivo del servicio', 'textarea'],
  ['deviceType', 'Tipo de equipo', 'text'],
  ['deviceBrand', 'Marca del equipo', 'text'],
  ['reportedIssue', 'Falla reportada', 'textarea'],
  ['courtType', 'Tipo de cancha', 'text'],
  ['playerCount', 'Numero de jugadores', 'number'],
  ['classLevel', 'Nivel de la clase', 'text'],
  ['classTopic', 'Tema de la clase', 'textarea']
];

export function CalendarSettingsPage() {
  const { user, access } = useAuth();
  const bookingsEnabled = access.modules?.includes('bookings');
  const [calendars, setCalendars] = useState([]);
  const [users, setUsers] = useState([]);
  const [links, setLinks] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [rules, setRules] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const selected = calendars.find((item) => item._id === selectedId) || null;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [calendarData, userData, profileData] = await Promise.all([
        getCalendars(),
        getUsers(),
        getCalendarProfiles().catch(() => [])
      ]);
      const linkData = bookingsEnabled
        ? await getBookingLinks().catch(() => [])
        : [];
      setCalendars(calendarData);
      setUsers(userData);
      setLinks(linkData);
      setProfiles(profileData);
      setSelectedId((current) =>
        calendarData.some((item) => item._id === current)
          ? current
          : calendarData[0]?._id || ''
      );
    } catch (requestError) {
      setLoadError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [bookingsEnabled]);

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
        type: data.get('configurationProfile') ? undefined : data.get('type'),
        configurationProfile: data.get('configurationProfile') || undefined,
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
    const requiredFields = new Set(data.getAll('requiredClientFields'));
    const clientFields = data.getAll('clientFields').map((key) => {
      const option = clientFieldOptions.find(([itemKey]) => itemKey === key);
      return {
        key,
        label: option?.[1] || key,
        type: option?.[2] || 'text',
        required: requiredFields.has(key),
        enabled: true
      };
    });
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
          capacityPerSlot: Number(data.get('capacityPerSlot')),
          bufferBeforeMinutes: Number(data.get('bufferBeforeMinutes')),
          bufferAfterMinutes: Number(data.get('bufferAfterMinutes')),
          minNoticeMinutes: Number(data.get('minNoticeMinutes')),
          maxDaysInAdvance: Number(data.get('maxDaysInAdvance')),
          reminderMinutesBefore: Number(data.get('reminderMinutesBefore')),
          cancellationMinNoticeMinutes: Number(data.get('cancellationMinNoticeMinutes')),
          rescheduleMinNoticeMinutes: Number(data.get('rescheduleMinNoticeMinutes')),
          initialAppointmentStatus: data.get('initialAppointmentStatus'),
          locationType: data.get('locationType'),
          locationValue: data.get('locationValue'),
          internalNotesTemplate: data.get('internalNotesTemplate'),
          clientFields,
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

  async function applyProfile(profile) {
    if (!selected) return;
    const confirmed = window.confirm(
      `Aplicar ${profile.name} reemplazara la configuracion general y el horario semanal del calendario. Las excepciones se conservaran.`
    );
    if (!confirmed) return;
    await mutate(
      () => applyCalendarProfile(selected._id, profile.key, true),
      `Perfil ${profile.name} aplicado.`,
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
        consentRequests: data.getAll('consentChannels').map((channel) => ({
          channel,
          label: `Acepto recibir comunicaciones comerciales por ${channel}.`,
          required: false,
          version: 'booking-v1'
        })),
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
      {loading ? <CrmLoading /> : loadError ? (
        <CrmLoadError message={loadError} onRetry={load} />
      ) : (
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
                <FormField label="Nombre" htmlFor="calendar-create-name" required>
                  <input id="calendar-create-name" required name="name" className={inputClass} placeholder="Ej. Ventas" />
                </FormField>
                <FormField label="Tipo" htmlFor="calendar-create-type">
                  <select id="calendar-create-type" name="type" className={inputClass}><option value="personal">Personal</option><option value="team">Equipo</option><option value="service">Servicio</option></select>
                </FormField>
                <FormField
                  label="Perfil inicial"
                  htmlFor="calendar-create-profile"
                  hint="Opcional. Solo sugiere una configuracion que luego puedes editar."
                >
                  <select id="calendar-create-profile" name="configurationProfile" className={inputClass}>
                    <option value="">Sin perfil</option>
                    {profiles.map((profile) => (
                      <option key={profile.key} value={profile.key}>{profile.name}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Propietario" htmlFor="calendar-create-owner" required>
                  <select id="calendar-create-owner" required name="ownerUserId" defaultValue={user._id} className={inputClass}>
                    {users.filter((item) => ['ADMIN', 'SUPERVISOR', 'CALLCENTER'].includes(item.role)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Integrantes" htmlFor="calendar-create-team" hint="Usa Ctrl o Cmd para seleccionar varios usuarios.">
                  <select id="calendar-create-team" multiple name="teamUserIds" className={`${inputClass} min-h-28`}>
                    {users.filter((item) => item._id !== user._id).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Zona horaria" htmlFor="calendar-create-timezone" hint="Nombre IANA, por ejemplo America/Guayaquil." required>
                  <input id="calendar-create-timezone" required name="timezone" defaultValue="America/Guayaquil" className={inputClass} />
                </FormField>
                <FormField label="Color" htmlFor="calendar-create-color">
                  <input id="calendar-create-color" name="color" type="color" defaultValue="#0891b2" className={`${inputClass} h-11`} />
                </FormField>
                <Button type="submit" disabled={busy}><CalendarPlus className="h-4 w-4" />Crear</Button>
              </form>
            </Card>
          </div>

          {selected ? <div className="space-y-6">
            <Card>
              <CardHeader
                title="Perfiles de configuracion rapida"
                description="Son valores sugeridos. Aplicarlos requiere confirmacion y luego puedes editarlos."
              />
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {profiles.map((profile) => (
                  <button
                    type="button"
                    key={profile.key}
                    disabled={busy}
                    onClick={() => applyProfile(profile)}
                    className={`rounded-lg border p-4 text-left transition hover:border-cyan-400 ${
                      selected.configurationProfile === profile.key
                        ? 'border-cyan-500 bg-cyan-50'
                        : 'border-slate-200'
                    }`}
                  >
                    <p className="font-semibold text-slate-900">{profile.name}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {profile.description}
                    </p>
                  </button>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader
                title={`1. Informacion basica: ${selected.name}`}
                description="Configuracion general, responsables y duracion de slots."
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
                  ['appointmentDurationMinutes', 'Duracion base (min)', 5],
                  ['slotIntervalMinutes', 'Intervalo entre citas (min)', 5],
                  ['bufferBeforeMinutes', 'Buffer antes (min)', 0],
                  ['bufferAfterMinutes', 'Buffer despues (min)', 0],
                  ['minNoticeMinutes', 'Anticipacion minima (min)', 0],
                  ['maxDaysInAdvance', 'Anticipacion maxima (dias)', 1],
                  ['capacityPerSlot', 'Capacidad por bloque', 1],
                  ['reminderMinutesBefore', 'Recordatorio antes (min)', 0],
                  ['cancellationMinNoticeMinutes', 'Minimo para cancelar (min)', 0],
                  ['rescheduleMinNoticeMinutes', 'Minimo para reprogramar (min)', 0]
                ].map(([name, label, min]) => (
                  <label key={name} className="text-xs font-semibold">
                    {label}
                    <input
                      required
                      min={min}
                      type="number"
                      name={name}
                      defaultValue={selected.settings?.[name] ?? min}
                      className={inputClass}
                    />
                  </label>
                ))}
                <label className="text-xs font-semibold">Estado inicial
                  <select
                    name="initialAppointmentStatus"
                    defaultValue={selected.settings?.initialAppointmentStatus || 'scheduled'}
                    className={inputClass}
                  >
                    <option value="scheduled">Programada</option>
                    <option value="confirmed">Confirmada</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">Ubicacion<select name="locationType" defaultValue={selected.settings?.locationType} className={inputClass}>{['none', 'phone', 'in_person', 'google_meet_placeholder', 'zoom_placeholder', 'custom_url'].map((value) => <option key={value}>{value}</option>)}</select></label>
                <label className="text-xs font-semibold lg:col-span-2">Detalle de ubicacion<input name="locationValue" defaultValue={selected.settings?.locationValue} className={inputClass} /></label>
                <label className="text-xs font-semibold lg:col-span-3">
                  Notas internas sugeridas
                  <textarea
                    name="internalNotesTemplate"
                    defaultValue={selected.settings?.internalNotesTemplate || ''}
                    className={`${inputClass} min-h-20`}
                  />
                </label>
                <div className="flex flex-wrap gap-4 lg:col-span-3">
                  {[
                    ['requireContact', 'Requerir contacto'],
                    ['allowReschedule', 'Permitir reprogramar'],
                    ['allowCancel', 'Permitir cancelar'],
                    ['preventOverlaps', 'Evitar solapamientos']
                  ].map(([name, label]) => <label key={name} className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={selected.settings?.[name]} />{label}</label>)}
                </div>
                <fieldset className="space-y-3 lg:col-span-3">
                  <legend className="text-sm font-semibold text-slate-900">
                    Campos del cliente
                  </legend>
                  <p className="text-xs text-slate-500">
                    Selecciona los datos adicionales que se solicitaran en el booking publico.
                  </p>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {clientFieldOptions.map(([key, label]) => {
                      const configured = selected.settings?.clientFields?.find(
                        (field) => field.key === key && field.enabled !== false
                      );
                      return (
                        <div key={key} className="rounded-lg border border-slate-200 p-3">
                          <label className="flex items-center gap-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              name="clientFields"
                              value={key}
                              defaultChecked={Boolean(configured)}
                            />
                            {label}
                          </label>
                          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                            <input
                              type="checkbox"
                              name="requiredClientFields"
                              value={key}
                              defaultChecked={Boolean(configured?.required)}
                            />
                            Obligatorio
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
                <div className="lg:col-span-3"><Button type="submit" disabled={busy}><Save className="h-4 w-4" />Guardar</Button></div>
              </form>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="2. Disponibilidad semanal" description="Una regla general o por integrante." />
                <form onSubmit={submitRule} className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2">
                  <FormField label="Dia" htmlFor="availability-day">
                    <select id="availability-day" name="dayOfWeek" className={inputClass}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select>
                  </FormField>
                  <FormField label="Alcance" htmlFor="availability-user">
                    <select id="availability-user" name="userId" className={inputClass}><option value="">Todo el calendario</option>{calendarUsers.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
                  </FormField>
                  <FormField label="Hora de inicio" htmlFor="availability-start" required>
                    <input id="availability-start" required type="time" name="startTime" defaultValue="09:00" className={inputClass} />
                  </FormField>
                  <FormField label="Hora de fin" htmlFor="availability-end" required>
                    <input id="availability-end" required type="time" name="endTime" defaultValue="17:00" className={inputClass} />
                  </FormField>
                  <Button type="submit" disabled={busy}><Plus className="h-4 w-4" />Agregar regla</Button>
                </form>
                <div className="space-y-2 p-4">
                  {rules.map((rule) => <div key={rule._id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm"><div><strong>{weekdays[rule.dayOfWeek]}</strong> {rule.startTime}-{rule.endTime}<p className="text-xs text-slate-500">{rule.userId?.name || 'General'}</p></div><button onClick={() => mutate(() => deleteAvailabilityRule(rule._id), 'Regla eliminada.')}><Trash2 className="h-4 w-4 text-rose-600" /></button></div>)}
                </div>
              </Card>

              <Card>
                <CardHeader title="2. Excepciones de disponibilidad" description="Bloqueos o aperturas extraordinarias." />
                <form onSubmit={submitException} className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2">
                  <FormField label="Fecha" htmlFor="exception-date" required>
                    <input id="exception-date" required type="date" name="date" className={inputClass} />
                  </FormField>
                  <FormField label="Tipo" htmlFor="exception-type">
                    <select id="exception-type" name="type" className={inputClass}><option value="unavailable">No disponible</option><option value="available_override">Disponible extra</option></select>
                  </FormField>
                  <FormField label="Hora de inicio" htmlFor="exception-start">
                    <input id="exception-start" type="time" name="startTime" className={inputClass} />
                  </FormField>
                  <FormField label="Hora de fin" htmlFor="exception-end">
                    <input id="exception-end" type="time" name="endTime" className={inputClass} />
                  </FormField>
                  <FormField label="Alcance" htmlFor="exception-user">
                    <select id="exception-user" name="userId" className={inputClass}><option value="">Todo el calendario</option>{calendarUsers.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
                  </FormField>
                  <FormField label="Motivo" htmlFor="exception-reason">
                    <input id="exception-reason" name="reason" placeholder="Ej. Feriado local" className={inputClass} />
                  </FormField>
                  <Button type="submit" disabled={busy}><Clock3 className="h-4 w-4" />Agregar excepcion</Button>
                </form>
                <div className="space-y-2 p-4">
                  {exceptions.map((item) => <div key={item._id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm"><div><strong>{item.date}</strong> <Badge tone={item.type === 'unavailable' ? 'cancelled' : 'active'}>{item.type}</Badge><p className="text-xs text-slate-500">{item.startTime ? `${item.startTime}-${item.endTime}` : 'Todo el dia'} {item.reason}</p></div><button onClick={() => mutate(() => deleteAvailabilityException(item._id), 'Excepcion eliminada.')}><Trash2 className="h-4 w-4 text-rose-600" /></button></div>)}
                </div>
              </Card>
            </div>

            {bookingsEnabled ? <Card id="booking-links">
              <CardHeader title="5. Confirmacion y booking publico" description="Reserva sobre disponibilidad interna y conserva atribucion de origen." />
              <form onSubmit={submitLink} className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-2">
                <FormField label="Titulo publico" htmlFor="booking-link-title" required>
                  <input id="booking-link-title" required name="title" placeholder="Ej. Reserva una asesoria" className={inputClass} />
                </FormField>
                <FormField label="Slug" htmlFor="booking-link-slug" hint="Identificador opcional de la URL publica.">
                  <input id="booking-link-slug" name="slug" placeholder="asesoria-comercial" className={inputClass} />
                </FormField>
                <FormField label="Descripcion" htmlFor="booking-link-description">
                  <input id="booking-link-description" name="description" placeholder="Explica brevemente el servicio." className={inputClass} />
                </FormField>
                <FormField label="Mensaje de confirmacion" htmlFor="booking-link-thanks">
                  <input id="booking-link-thanks" name="thankYouMessage" defaultValue="Tu cita fue registrada correctamente." className={inputClass} />
                </FormField>
                <fieldset className="flex flex-wrap gap-3 text-sm md:col-span-2">
                  {['name', 'email', 'phone', 'notes'].map((field) => <label key={field} className="flex gap-1"><input type="checkbox" name="allowedFields" value={field} defaultChecked={field !== 'notes'} />{field}</label>)}
                  <label className="flex gap-1"><input type="checkbox" name="requireApproval" />Requiere aprobacion</label>
                </fieldset>
                <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm md:col-span-2">
                  <legend className="px-1 text-xs font-semibold">Consentimientos comerciales opcionales</legend>
                  <p className="text-xs text-slate-500">Las casillas se muestran sin seleccionar en el booking publico.</p>
                  <div className="flex flex-wrap gap-3">
                    {['whatsapp', 'sms', 'email', 'call'].map((channel) => <label key={channel} className="flex gap-1"><input type="checkbox" name="consentChannels" value={channel} />{channel}</label>)}
                  </div>
                </fieldset>
                <Button type="submit" disabled={busy}><Link2 className="h-4 w-4" />Crear enlace</Button>
              </form>
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {calendarLinks.map((item) => {
                  const url = `${window.location.origin}/book/${item.slug}`;
                  return <div key={item._id} className="rounded-lg border border-slate-200 p-4"><div className="flex items-start justify-between"><div><p className="font-semibold">{item.title}</p><p className="mt-1 break-all text-xs text-cyan-700">{url}</p></div><Badge tone={item.publicEnabled ? 'active' : 'inactive'}>{item.publicEnabled ? 'publico' : 'oculto'}</Badge></div><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => navigator.clipboard.writeText(url)}><Copy className="h-4 w-4" />Copiar</Button><Button variant="secondary" onClick={() => mutate(() => updateBookingLink(item._id, { publicEnabled: !item.publicEnabled }), 'Enlace actualizado.', { reloadAll: true })}>{item.publicEnabled ? 'Ocultar' : 'Publicar'}</Button><Button variant="danger" onClick={() => mutate(() => archiveBookingLink(item._id), 'Enlace archivado.', { reloadAll: true })}><Trash2 className="h-4 w-4" /></Button></div></div>;
                })}
              </div>
            </Card> : (
              <Card className="p-5 text-sm text-slate-500">
                El modulo de reservas publicas no esta habilitado en el plan efectivo de esta empresa.
              </Card>
            )}
          </div> : <Card className="p-8 text-center text-slate-500">Selecciona o crea un calendario.</Card>}
        </div>
      )}
    </PageShell>
  );
}
