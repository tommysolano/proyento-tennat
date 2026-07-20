# WhatsApp Cloud API

WhatsApp Cloud continua disponible y sus webhooks no son procesados por las
sesiones QR. La modalidad QR se documenta por separado en
[WHATSAPP_QR.md](WHATSAPP_QR.md).

## Estado de la integracion

La Fase 6 conserva el cifrado, firma HMAC y cola durable, y agrega descarga de
media, limites, diagnostico, estados, sandbox y operacion. El seed crea un
canal `pending` sin credenciales y nunca simula un envio exitoso.

## Configuracion

En `/inbox/channels`, ADMIN debe registrar:

- `phoneNumberId`
- `verifyToken` propio
- `accessToken` de Meta
- `appSecret` de la aplicacion Meta
- version de Graph API en `apiVersion` o `WHATSAPP_GRAPH_VERSION`
- estado `connected` cuando la configuracion sea valida

La URL mostrada tiene la forma:

`https://API_PUBLICA/api/webhooks/whatsapp/CHANNEL_CONFIG_ID`

En Meta se configura esa URL y el mismo verify token. La aplicacion responde
al challenge solo cuando `hub.mode=subscribe` y el token coincide.

`Validar configuracion` revisa campos localmente. `Probar con Meta` consulta
el Phone Number ID real y devuelve el error real del proveedor si falla.
`Diagnostico` revisa campos, modulo, empresa, consumo, jobs y mensajes
fallidos sin devolver secretos. `sandboxMode` solo etiqueta metricas y UI; no
cambia una respuesta fallida por exito.

## Flujo inbound

1. Express conserva el raw body.
2. Se carga `ChannelConfig` y se valida `x-hub-signature-256`.
3. El POST crea un `Job` durable y responde HTTP 200.
4. El worker normaliza mensajes y estados.
5. `WebhookEvent` reserva el evento con indice unico.
6. Se busca o crea contacto y conversacion dentro de la empresa.
7. Se aplica routing, se crea `Message` y se emiten SSE/notificaciones.
8. Si existe `providerMediaId`, se crea `media.whatsapp.download`.
9. El worker consulta Graph, descarga con Bearer token, valida y almacena.

Para mensajes se usa `message.id`. Para estados se usa
`status.id + status + timestamp`. Sin ID se usa SHA-256 del payload.

Los estados `sent`, `delivered`, `read` y `failed` actualizan timestamps,
error sanitizado, ActivityLog y el evento realtime. Un mensaje desconocido se
marca como webhook procesado con warning.

## Media y limites

Los tipos y tamanos permitidos estan en [MEDIA.md](MEDIA.md). Un upload local
puede enviarse por conversaciones internas. En WhatsApp queda pending y falla
claramente si no tiene URL publica o `providerMediaId`; no se simula una
subida a Meta.

Los contadores mensuales controlan mensajes inbound/outbound, archivos,
megabytes, conversaciones y contactos inbound. El consumo outbound se suma
solo despues de una respuesta exitosa del proveedor.

## Seguridad

`accessToken`, `appSecret`, `verifyToken` y secretos legados se cifran con
AES-256-GCM. No se seleccionan por defecto ni se devuelven. `providerPayload`
tampoco se devuelve. Logs, errores, jobs ops y ActivityLog pasan por redaccion.

En produccion use un secret manager, rote tokens, fije una version soportada
de Graph API y active `REQUIRE_WEBHOOK_SIGNATURE=true`.

## Gestion multi-numero

Una empresa puede tener varios numeros (Cloud API y QR) sobre el mismo Inbox.
La UI unificada esta en **Inbox -> Numeros de WhatsApp** (`/inbox/whatsapp-numbers`,
ADMIN con `channel_configs:manage`); la pagina antigua de canales queda como
"Canales (avanzado)" para diagnostico y rotacion de secretos.

Campos nuevos en `ChannelConfig`:

- `isDefault` (Boolean): numero por defecto de la empresa. Maximo uno; al marcar
  otro se desmarca el anterior en la misma operacion. Solo puede marcarse un
  canal habilitado; al deshabilitar el default se desmarca (no se reasigna solo).
- `displayPhone` (E.164 que declara el usuario) y `connectedPhone` (el que reporta
  WhatsApp al vincular por QR, poblado desde Baileys al conectar).
- Salud (solo Cloud): `qualityRating` (`GREEN|YELLOW|RED|UNKNOWN`), `messagingLimit`
  (ej. `TIER_1K`) y `qualityUpdatedAt`.

### Resolucion de cuenta (accountGateway)

`server/src/modules/communications/accountGateway.js` centraliza "por que numero
responde cada conversacion", siempre scoped por `companyId`:

- `getDefaultAccount(companyId)`: el canal habilitado marcado `isDefault`; si no
  hay, el mas antiguo `connected`; `null` si ninguno.
- `resolveAccountForConversation(conversation)`: **unico** camino por el que el
  envio elige numero. Usa el `channelConfigId` de la conversacion si ese canal
  sigue habilitado; si no (sin canal, borrado o deshabilitado) cae al default.
  El id resuelto se persiste SIEMPRE en el mensaje y en la conversacion.
- `getDefaultCloudAccount(companyId)`: para operaciones que exigen Cloud API
  (plantillas). Prefiere cuentas completas (`phoneNumberId` + `accessToken` +
  `externalBusinessId`); si ninguna lo esta, devuelve una para que el caller
  reporte el campo faltante via `cloudAccountMissingFields`.
- `setDefaultAccount(companyId, id)`: marca el default garantizando unicidad.

### Salud del numero (Cloud API)

- Webhook `phone_number_quality_update` (evento de Meta al webhook existente):
  `WhatsAppQualityService` actualiza `qualityRating`/`messagingLimit`/
  `qualityUpdatedAt` del canal por `phoneNumberId`. Al empeorar el rating
  (GREEN->YELLOW/RED) se registra en ActivityLog (`channel_quality_changed`); al
  pasar a RED se crea una OperationalAlert critica (`channel_quality_red`).
- Refresco manual: `POST /api/channel-configs/:id/refresh-quality` consulta el
  Phone Number ID en Graph API (`quality_rating`, `messaging_limit`) y actualiza;
  devuelve el error real del proveedor si falla.

## Limites externos

No se aprovisionan cuentas, numeros, permisos ni templates. Quedan pendientes
antivirus, retencion formal, upload binario a Graph API y providers cloud
completos. Facebook Messenger, Instagram, email y SMS siguen sin integracion
real. La puesta en produccion se guia por
[WHATSAPP_PRODUCTION_CHECKLIST.md](WHATSAPP_PRODUCTION_CHECKLIST.md).
