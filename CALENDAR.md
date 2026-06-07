# Calendario y citas

## Dominio

La agenda interna usa cinco modelos con `companyId` y `distributorId`:

- `Calendar`: propietario, equipo, zona horaria, color, estado y ajustes.
- `AvailabilityRule`: ventanas semanales generales o por usuario.
- `AvailabilityException`: bloqueos o aperturas extraordinarias por fecha.
- `Appointment`: cita con contacto, oportunidad, responsable y estado.
- `BookingLink`: configuracion del formulario publico de reserva.

Los calendarios pueden ser `personal`, `team` o `service`. Archivar no elimina
el historial. Las citas usan `scheduled`, `confirmed`, `completed`,
`cancelled`, `no_show` o `rescheduled`.

## Disponibilidad

`CalendarService.availability()`:

1. interpreta reglas y excepciones en la zona IANA del calendario;
2. convierte cada hora local a UTC con `Intl.DateTimeFormat`;
3. genera slots segun duracion e intervalo;
4. aplica buffers, anticipacion minima y dias maximos;
5. resta citas `scheduled` y `confirmed` del calendario o responsable;
6. devuelve fechas ISO UTC junto con la zona horaria del calendario.

En calendarios `team` y `service`, una consulta sin usuario combina la
disponibilidad de propietario y equipo. Slots coincidentes se deduplican y
conservan internamente el primer responsable libre.

Las excepciones sin hora bloquean o abren el dia completo. Una excepcion
`available_override` agrega una ventana aunque no exista regla semanal.

La creacion y reprogramacion vuelven a comprobar solapamientos en backend.
Una reprogramacion conserva la cita anterior con estado `rescheduled` y crea
una nueva cita enlazada mediante `rescheduledFrom`.

## API privada

- `GET/POST /api/calendars`
- `GET/PATCH/DELETE /api/calendars/:id`
- `GET /api/calendars/:id/availability`
- `GET/POST /api/calendars/:id/availability-rules`
- `PATCH/DELETE /api/availability-rules/:id`
- `GET/POST /api/calendars/:id/exceptions`
- `PATCH/DELETE /api/availability-exceptions/:id`
- `GET/POST /api/appointments`
- `GET/PATCH/DELETE /api/appointments/:id`
- `PATCH /api/appointments/:id/status`
- `PATCH /api/appointments/:id/reschedule`
- `GET /api/appointments/metrics`

ADMIN configura calendarios y disponibilidad. SUPERVISOR ve y gestiona citas
de si mismo y sus agentes. CALLCENTER solo opera citas propias. Contactos,
oportunidades, responsables y calendarios se validan contra el tenant y el
alcance del actor.

## CRM, jobs y realtime

Las fichas de contacto y oportunidad muestran citas y las incluyen en su
timeline. El inbox muestra proximas citas y abre la agenda con el contacto
preseleccionado.

Cada cita futura programa `appointment.reminder`. Los jobs obsoletos se
ignoran comparando `reminderJobId`; el handler solo avisa citas activas.
Creacion, cambios de estado, reprogramacion y recordatorio generan
`ActivityLog`, notificaciones internas y eventos SSE.

## Limites

Los planes comerciales pueden limitar `calendars`, `appointments` y
`bookingLinks`. El consumo mensual se registra como `calendars`,
`appointments` y `booking_links`.

No existen sincronizacion con Google Calendar/Outlook, videollamadas,
calendarios externos ni pagos. Para alta concurrencia multi-instancia se
recomienda agregar un lock distribuido o una reserva transaccional de slots.
Las ventanas semanales no cruzan medianoche; un turno nocturno debe dividirse
en dos reglas. Cada consulta de disponibilidad acepta como maximo 93 dias.

## Workflows

Creacion, cancelacion, finalizacion, no-show, reprogramacion y reminder enviado
pueden producir WorkflowEvent. `appointment.create_internal_reminder` crea un
job interno y valida cita/empresa. No crea eventos en proveedores externos.
