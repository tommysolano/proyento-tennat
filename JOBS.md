# Cola durable MongoDB

`Job` guarda tipo, estado, prioridad, payload oculto, intentos, `runAt`, lock,
fechas, error sanitizado y tenant. Los estados son `pending`, `processing`,
`completed`, `failed` y `dead`.

Tipos iniciales:

- `webhook.whatsapp.inbound`
- `webhook.whatsapp.status`
- `message.whatsapp.send`
- `media.whatsapp.download`
- `notification.dispatch`
- `appointment.reminder`
- `workflow.run`

El backend inicia el worker salvo `JOB_WORKER_ENABLED=false`. Cada runner
reclama atomicamente un job ejecutable. Los locks vencidos se recuperan. Un
fallo retryable usa backoff y un fallo no retryable o sin intentos queda
`dead`.

```env
JOB_WORKER_ENABLED=true
JOB_WORKER_CONCURRENCY=2
JOB_MAX_ATTEMPTS=5
```

El retry de mensaje/media puede reutilizar la operacion de dominio. El replay
ops de un job `failed` o `dead` siempre crea un job nuevo, conserva el original
y agrega `metadata.replayedFrom`, `replayedAt` y `replayedBy`.

`GET /api/ops/jobs` y `GET /api/ops/jobs/:id` permiten lectura global a
SUPERADMIN y lectura por empresa a ADMIN. Aceptan `status`, `type`,
`createdFrom` y `createdTo`. El payload nunca se expone.

`POST /api/ops/jobs/:id/replay` permite replay global a SUPERADMIN y solo de la
propia empresa a ADMIN. Cada job que termina `dead` crea o incrementa una
`OperationalAlert` critica. La UI `/ops` muestra intentos, fechas, error
sanitizado y boton Replay cuando corresponde.

MongoDB es suficiente para una beta controlada. Para alto volumen, scheduling
avanzado o multiples regiones se recomienda Redis/BullMQ conservando los
handlers de dominio.

`appointment.reminder` se agenda en `startAt - reminderMinutesBefore`. El
handler comprueba estado, `reminderJobId` y `reminderSentAt`, crea una
notificacion interna y registra `appointment_reminder_sent`. Reprogramar crea
un job nuevo; jobs anteriores quedan inofensivos por la comprobacion de ID.

`workflow.run` recibe solo `runId`. El handler carga definicion y evento desde
MongoDB, ejecuta desde `metadata.cursor` y completa el job. Un delay crea otro
job con `runAt` y deja el run `waiting`. Los fallos terminales crean alerta y
emiten `job.dead`; el payload nunca se expone por la API ops.
