# Realtime SSE

`GET /api/realtime/events` usa Server-Sent Events. El frontend abre la
conexion con `fetch` y header `Authorization: Bearer`; el JWT no viaja en query
string. Hay heartbeat cada 25 segundos y cierre si el usuario deja de estar
activo.

Eventos:

- `conversation.created`
- `conversation.updated`
- `conversation.assigned`
- `conversation.closed`
- `message.created`
- `message.status_updated`
- `internal_note.created`
- `notification.created`
- `operational_alert.created`
- `appointment.created`
- `appointment.updated`
- `appointment.status_updated`
- `appointment.reminder`

ADMIN recibe su empresa. SUPERVISOR recibe conversaciones asignadas a si mismo
o sus agentes. CALLCENTER solo recibe asignaciones propias. Las notificaciones
dirigidas se comparan por `userId`.

El servicio es en memoria y funciona en una sola instancia. Para escalar se
necesita un bus compartido, por ejemplo Redis pub/sub. Los proxies deben
desactivar buffering para `text/event-stream`. Si SSE falla, el inbox conserva
refresh manual.

Las descargas de media y los webhooks de estado reutilizan
`message.status_updated`, por lo que el inbox vuelve a cargar el mensaje y su
adjunto seguro. El badge operativo se refresca por polling para seguir
funcionando aunque SSE no este disponible.

Los eventos de cita usan `companyId` y `assignedTo`, por lo que reutilizan el
mismo filtro ADMIN/equipo/asignacion del broker. El frontend puede recargar la
agenda ante estos eventos; las notificaciones de cita tambien llegan como
`notification.created`.

Fase 8 publica `workflow.run_queued`, `workflow.run_completed` y
`workflow.run_failed` con `companyId`, `workflowId` y `runId`, sin incluir el
payload del evento. MongoDB continua siendo la fuente durable.
