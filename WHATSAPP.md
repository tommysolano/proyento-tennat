# WhatsApp Cloud API

## Estado de la integracion

La Fase 4 prepara verificacion de webhook, mensajes inbound, actualizaciones
de estado y envio de texto/template mediante Graph API. El seed crea un canal
`pending` sin credenciales. Si la configuracion no permite un envio real, el
mensaje queda `failed` con un error explicito.

## Configuracion

En `/inbox/channels`, ADMIN debe registrar:

- `phoneNumberId`
- `verifyToken` propio
- `accessToken` de Meta
- version de Graph API en `apiVersion` o `WHATSAPP_GRAPH_VERSION`
- estado `connected` cuando la configuracion sea valida

La URL mostrada tiene la forma:

`https://API_PUBLICA/api/webhooks/whatsapp/CHANNEL_CONFIG_ID`

En Meta se configura esa URL y el mismo verify token. La aplicacion responde
al challenge solo cuando `hub.mode=subscribe` y el token coincide.

## Flujo inbound

1. El POST responde HTTP 200 inmediatamente.
2. El proceso carga `ChannelConfig`; el payload publico no decide el tenant.
3. El adaptador normaliza mensajes y estados.
4. `WebhookEvent` reserva el evento con indice unico.
5. Se busca el contacto por WhatsApp ID o telefono dentro de la empresa.
6. Si falta, se crea como lead `nuevo` con source `whatsapp_cloud`.
7. Se busca o crea conversacion conservando `contact.assignedTo`.
8. Se crea `Message`, se incrementan no leidos y se registra actividad.

Para mensajes se usa `message.id`. Para estados se usa
`status.id + status + timestamp`. Sin ID se usa SHA-256 del payload.

## Seguridad

`credentials`, `verifyToken` y `webhookSecret` no se seleccionan por defecto.
Las respuestas nunca devuelven el access token; solo indican si esta
configurado. `providerPayload` tampoco se devuelve en consultas normales. Los
logs de webhook registran hashes y errores sanitizados, no tokens.

Pendiente antes de produccion:

- cifrar credenciales en reposo;
- usar un secret manager;
- rotar y revocar tokens;
- validar firma del webhook con `webhookSecret`;
- fijar una version soportada de Graph API;
- agregar colas/reintentos y observabilidad;
- revisar ventanas de conversacion y aprobacion real de templates.

## Limites

No se aprovisionan cuentas de Meta, numeros, permisos ni templates. No se
probo un envio contra una cuenta real porque el proyecto no incluye
credenciales. Facebook Messenger, Instagram, email y SMS siguen sin
integracion real.
