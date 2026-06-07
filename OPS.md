# Operaciones

## Panel

`/ops` esta disponible para SUPERADMIN y ADMIN. Muestra health, worker, jobs,
storage, realtime, firma WhatsApp y alertas. El header incluye un contador de
alertas criticas abiertas.

## Jobs

- `GET /api/ops/jobs`
- `GET /api/ops/jobs/:id`
- `POST /api/ops/jobs/:id/replay`

Los filtros soportan `status`, `type`, `createdFrom` y `createdTo`.
SUPERADMIN tiene alcance global; ADMIN queda limitado a su empresa. El payload
nunca se devuelve. ADMIN solo puede replay `message.whatsapp.send`,
`media.whatsapp.download`; webhooks y notificaciones con payload libre quedan
reservados a SUPERADMIN. Replay solo acepta `failed` o `dead`, crea una copia
limpia y registra trazabilidad y ActivityLog.

## Alertas

`OperationalAlert` soporta severidad `info`, `warning`, `critical`; estado
`open`, `acknowledged`, `resolved`; tenant, relacion y metadata sanitizada.

- `GET /api/ops/alerts`
- `PATCH /api/ops/alerts/:id/acknowledge`

Se crean alertas para jobs dead, firmas invalidas, credenciales/canales,
mensajes fallidos y limites. Alertas abiertas equivalentes se deduplican e
incrementan `metadata.occurrences`.

## Health

`GET /api/health` y `GET /health` informan MongoDB, worker/concurrencia,
pending/failed/dead jobs, provider/tamano de media, realtime, firma WhatsApp,
alertas, version y timestamp.

## Seguridad

Errores y metadata pasan por redaccion. No se exponen payloads, tokens,
headers Authorization, provider payload ni storage keys. ADMIN no puede
replay ni reconocer recursos de otra empresa.
