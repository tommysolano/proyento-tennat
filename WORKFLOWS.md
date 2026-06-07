# Workflows

Un workflow pertenece a una empresa y conecta un evento interno con
condiciones AND y acciones ordenadas. La definicion persiste en `Workflow`;
cada evento normalizado en `WorkflowEvent`; y cada intento durable en
`WorkflowRun`.

## Estados

- `draft`: editable, no recibe eventos.
- `active`: puede crear runs.
- `paused`: conserva configuracion e historial.
- `archived`: baja logica.

## Triggers

El catalogo vive en
`server/src/modules/workflows/workflowCatalog.js` y se consulta con
`GET /api/workflows/catalog`. Los triggers emitidos actualmente incluyen
contactos, oportunidades, tareas, inbox, calendario, billing y jobs dead.

`contact.followup_due`, `task.overdue`, `appointment.reminder_due`,
`invoice.overdue` y `alert.created` aparecen como `planned`: aun no tienen
scheduler/emisor automatico y no se pueden seleccionar.

## Condiciones

Las condiciones se evaluan en AND. Sin condiciones, el run continua. Se
soportan igualdad, contenido, listas, existencia, comparaciones numericas y
fechas. Solo se aceptan rutas bajo `event.*`, `entity.*` y `payload.*`.
Se bloquean `__proto__`, `constructor`, `password`, `credentials`, `token`,
`secret` y `providerPayload`.

## Acciones

- contacto: status, lifecycle stage, prioridad, asignacion, tags y nota;
- oportunidad: etapa, won/lost, asignacion y nota;
- tareas: crear y completar;
- inbox: asignar, cerrar y nota interna;
- calendario: reminder interno;
- sistema: notificacion, alerta y ActivityLog;
- delays: `delay.wait_minutes` y `delay.wait_until`.

Email, SMS, WhatsApp, webhook externo, IA y funnels son `planned` y el
validador los rechaza.

## Ejecucion

`WorkflowEventEmitter` normaliza ActivityLog y eventos de jobs. El servicio
busca workflows activos del mismo `companyId`, crea un run idempotente y
encola `workflow.run`. Cada accion queda en `executedActions`.

Un delay guarda `metadata.cursor`, marca el run `waiting` y crea otro
`workflow.run` con `Job.runAt`. El job siguiente continua desde la accion
posterior.

## Idempotencia y loops

- Evento y run usan claves unicas.
- `runOncePerEntity`, `cooldownMinutes` y `allowReentry` controlan repeticion.
- `maxRunsPerDay` limita runs diarios.
- `preventSelfTrigger=true` ignora eventos del mismo workflow.
- `maxChainDepth` limita cadenas entre workflows.

Las actividades generadas llevan `sourceWorkflowId`, `sourceWorkflowRunId` y
`chainDepth`.

## API

- `GET/POST /api/workflows`
- `GET/PATCH /api/workflows/:id`
- `PATCH /api/workflows/:id/activate`
- `PATCH /api/workflows/:id/pause`
- `PATCH /api/workflows/:id/archive`
- `POST /api/workflows/:id/test`
- `GET /api/workflows/:id/runs`
- `GET /api/workflows/catalog`
- `GET /api/workflow-runs`
- `GET /api/workflow-runs/:id`

`/test` usa `dryRun=true` por defecto.

## Ejemplos

1. `contact.created` -> `task.create`.
2. `opportunity.stage_changed` -> `notification.create`.
3. `appointment.no_show` -> `contact.update_status` y `task.create`.
4. `message.inbound_received` -> `alert.create` si no hay responsable.

## Seguridad

Las rutas derivan el tenant del JWT. IDs fijos se validan al guardar y el
ejecutor repite el filtro tenant. `WorkflowEvent.payload` usa `select:false`,
se sanitiza y nunca aparece en JSON. Los errores tambien se sanitizan.
