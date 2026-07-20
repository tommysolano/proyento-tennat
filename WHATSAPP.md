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

## Ciclo de vida de plantillas (HSM)

Las plantillas de WhatsApp (`channel: whatsapp_cloud`, `type: whatsapp_template`)
tienen ciclo completo: se redactan localmente (`draft`), se **registran** en el
WABA via Graph API y su estado se **sincroniza** desde Meta. La UI esta en
**Inbox -> Plantillas de mensajes**. El consumidor de
`accountGateway.getDefaultCloudAccount(companyId)` es este flujo.

### Modelo (`MessageTemplate`, retrocompatible)

- `headerType` (`none|text|image|document|video`), `headerText`, `headerMediaUrl`.
- `footer`, `buttons` (`[{ type: quick_reply|url|phone, text, url, phone }]`, max 3;
  `url` requiere URL, `phone` requiere numero; validado a nivel de esquema).
- `metaCategory` (`MARKETING|UTILITY|AUTHENTICATION`): categoria que se envia a
  Meta. Default derivado de `messageCategory` (mapeo suave, ver abajo).
- `status`: se agregan los estados del ciclo Meta (`draft`, `pending`, `approved`,
  `rejected`, `disabled`) manteniendo los legados. `pending_provider_approval` se
  muestra como `pending`.
- `variableSamples` (`[{ key, example }]`): Meta EXIGE un ejemplo por variable del
  cuerpo. `variables` sigue guardando los nombres; los ejemplos se indexan por
  nombre o por posicion (`{{1}}` -> `key: '1'`).
- `rejectionReason`, `syncedAt`, `usageCount` (se incrementa **solo** tras un
  envio exitoso de la plantilla, sea chat, workflow o campana).

Mapeo de categoria (documentado): `commercial`/`reply` -> `MARKETING`;
`transactional`/`operational` -> `UTILITY`. Un `metaCategory` explicito manda.

### Registro y sincronizacion (`TemplateSyncService`)

- `POST /api/message-templates/:id/register`: valida localmente (nombre en
  snake_case, un ejemplo por variable, botones validos), resuelve
  `getDefaultCloudAccount` y hace `POST /{WABA_ID}/message_templates` con los
  `components` construidos desde el modelo (HEADER/BODY/FOOTER/BUTTONS con
  ejemplos). Guarda `providerTemplateId` y `status='pending'`. Si la cuenta cloud
  esta incompleta, reporta el campo exacto que falta (`cloudAccountMissingFields`).
  Devuelve el error real de Meta si el registro falla ("Probar con Meta").
- `POST /api/message-templates/sync` (global) y `.../:id/sync`: hace
  `GET /{WABA_ID}/message_templates` y reconcilia por nombre+idioma: actualiza
  `status`/`rejectionReason`/`providerTemplateId`/`syncedAt` e **importa** como
  registros locales las plantillas que existen en Meta pero no localmente.
- `POST /api/message-templates/:id/duplicate`: una plantilla aprobada NO se edita;
  se duplica como borrador editable (sin `providerTemplateId`, `usageCount` a 0).
- `DELETE /api/message-templates/:id`: elimina la copia local (no la borra de Meta).
- `GET /api/message-templates/meta/cloud-status`: indica si hay una cuenta cloud
  completa (la UI muestra un EmptyState accionable hacia **Numeros de WhatsApp**
  cuando falta).

Solo un `draft` cambia su estructura (el PATCH rechaza con 409 editar una
plantilla ya enviada a Meta).

### Envio

El punto de envio de plantillas construye los `components` con las variables
sustituidas (`buildOutboundTemplate`, cae al ejemplo si no se pasa valor) y usa la
cuenta resuelta por el gateway. Si la conversacion resuelve a un numero **QR**, se
rechaza con un error claro ("El numero QR no admite plantillas") en vez de simular
un exito. Al enviar OK, `usageCount += 1`.

### Estado desde el webhook

El webhook de Meta trae `message_template_status_update`; se procesa junto al de
calidad (sin pipeline de mensajes, sin romper el 200): actualiza `status`/
`rejectionReason`/`syncedAt` de la plantilla y **notifica al ADMIN** de la empresa
(`template_status_changed`).

### Caveat de cabecera de media

El registro de una cabecera de imagen/documento/video exige a Meta un
`header_handle` subido por el upload reanudable; aqui se pasa la `headerMediaUrl`
publica como ejemplo. La subida binaria del handle queda como paso manual con
credenciales reales. Los tests no llaman a Meta (adapter mockeado).

## Limites externos

No se aprovisionan cuentas, numeros, permisos ni templates. Quedan pendientes
antivirus, retencion formal, upload binario a Graph API y providers cloud
completos. Facebook Messenger, Instagram, email y SMS siguen sin integracion
real. La puesta en produccion se guia por
[WHATSAPP_PRODUCTION_CHECKLIST.md](WHATSAPP_PRODUCTION_CHECKLIST.md).
