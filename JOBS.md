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

El backend inicia el worker salvo `JOB_WORKER_ENABLED=false`. Cada runner
reclama atomicamente un job ejecutable. Los locks vencidos se recuperan. Un
fallo retryable usa backoff y un fallo no retryable o sin intentos queda
`dead`.

```env
JOB_WORKER_ENABLED=true
JOB_WORKER_CONCURRENCY=2
JOB_MAX_ATTEMPTS=5
```

El retry manual reutiliza un job pendiente/fallido y adelanta `runAt`; si el
anterior esta `dead`, crea uno nuevo.

`GET /api/ops/jobs` y `GET /api/ops/jobs/:id` permiten lectura global a
SUPERADMIN y lectura por empresa a ADMIN. Aceptan `status`, `type`,
`createdFrom` y `createdTo`. El payload nunca se expone.

MongoDB es suficiente para una beta controlada. Para alto volumen, scheduling
avanzado o multiples regiones se recomienda Redis/BullMQ conservando los
handlers de dominio.
