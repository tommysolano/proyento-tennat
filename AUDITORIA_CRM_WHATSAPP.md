# Auditoría CRM/WhatsApp + Plan de implementación

> **Objetivo del documento.** (1) Explicar en detalle cómo funciona el CRM de `proyecto_clinica`
> (WhatsApp por QR y por API, plantillas, automatizaciones, workflows, chats). (2) Auditar el estado
> actual de **nuestro** proyecto (`server/` + `client/`). (3) Entregar un plan paso a paso, con
> archivos y snippets concretos, para llevar nuestro proyecto a paridad funcional. (4) Auditar qué
> falta para que todo **funcione de verdad** (configuración, permisos, módulos, arranque, operación).
>
> `proyecto_clinica/` es **solo lectura / referencia**. No se modifica nada ahí.
>
> Fecha: 2026-07-20 · Autor: auditoría técnica.

---

## ✅ Estado de implementación (actualizado)

Ya implementado y verificado (la app arranca e importa limpio):

- **E.1 — Config.** `server/.env.example` documenta `WHATSAPP_QR_ENABLED`,
  `CREDENTIALS_ENCRYPTION_KEY`, todo el tuning `WHATSAPP_QR_*`, y sube Graph API
  `v20 → v23`.
- **D.1 — Workflows que envían WhatsApp.** Acciones `whatsapp.send` (texto/media)
  y `whatsapp.send_template` (HSM) implementadas en `WorkflowActionExecutor`,
  reutilizando `ConversationService.createOutboundMessage` (consentimiento,
  ventana 24h, cola, uso, realtime). Helper `workflowMessaging.js`. Un bloqueo de
  política se registra como *skip* (no reintenta); un error 4xx se marca
  no-reintentable. Activadas en `workflowCatalog` + `workflowValidation`.
  - Ejemplo (config JSON de la acción en la UI de Workflows):
    - `whatsapp.send` → `{ "text": "Hola {{entity.name}}, gracias por escribir" }`
    - `whatsapp.send_template` → `{ "templateId": "<id>", "variables": { "1": "{{entity.name}}", "2": "{{entity.startAt}}" } }`
- **D.2 — Triggers de chat + wait_reply.**
  - **Keyword:** el evento `message.inbound_received` ahora lleva `payload.text` y
    `payload.textNormalized` (minúsculas/sin acentos). Regla por palabra clave =
    condición del workflow: `payload.textNormalized` `contains` `"hola"`.
  - **`delay.wait_reply`:** nueva acción de control de flujo; pausa el run hasta
    que el contacto responde (o vence `timeoutMinutes`, default 1440).
  - **Clasificación sí/no:** `replyClassification.js` (`classifyReply`); al
    reanudar, `payload.lastReply` = `yes|no|other` para bifurcar con condiciones.
  - Reanudación cableada desde la ingesta de entrantes
    (`ConversationService.createInboundMessage` → `WorkflowService.resumeWaitingForReply`).
  - Ejemplo bot confirmación: trigger `contact.created` → `whatsapp.send`
    ("¿Confirmas? sí/no") → `delay.wait_reply` → condición `payload.lastReply
    equals yes` → `whatsapp.send` ("¡Listo!").
- **D.3 — Plantillas con media header.** `WhatsAppCloudAdapter.uploadResumableHeader`
  (Resumable Upload API: `/app` → `/uploads` → subida → `handle`) y
  `TemplateSyncService.registerTemplate` sube el binario de `headerMediaUrl` y
  registra con el `header_handle` real (antes se mandaba la URL cruda que Meta
  rechaza). Valida MIME (imagen JPG/PNG, documento PDF, video MP4).
- **D.6 — Recordatorios de cita por WhatsApp.** El recordatorio ya emite
  `appointment.reminder_sent`; con D.1 basta un workflow
  `appointment.reminder_sent → whatsapp.send_template`. El motor carga la cita en
  `context.entity` (interpola `{{entity.title}}`/`{{entity.startAt}}`) y ahora el
  payload también trae `contactId`/`startAt`/`title` para resolver el contacto.

Pendiente (siguiente iteración): **D.4** (motor de campañas/goteo por segmento),
**email.send/sms.send** (requieren proveedor de email/SMS — siguen en `planned` a
propósito para no ofrecer en la UI algo que fallaría), y **D.7** (CAPI/CTWA/editor
en grafo). La UI de Workflows ya expone las acciones nuevas automáticamente (el
formulario de acción es **JSON libre** poblado desde el catálogo).

> **Requisito operativo para que D.1/D.2/D.6 envíen:** un número de WhatsApp por
> defecto **conectado** (QR o Cloud), el módulo `whatsapp` habilitado, el
> `JobWorker` activo, y que el contacto tenga teléfono y (para categoría
> `commercial`) consentimiento `opted_in`. Ver PARTE E.

---

## 0. Resumen ejecutivo (lo que hay que entender antes de tocar código)

Las dos bases de código resuelven lo mismo (un CRM con mensajería WhatsApp), pero con
**arquitecturas muy distintas**:

| | **proyecto_clinica (referencia)** | **Nuestro proyecto (`server/`, `client/`)** |
|---|---|---|
| Runtime | CommonJS (`require`) | **ESM** (`import`, `"type":"module"`) |
| Estructura | Plana (`controllers/`, `models/`, `utils/`) | **Modular** (`src/modules/<dominio>/…`) + `core/` |
| Multi-tenant | Multi-clínica, pero WhatsApp es **global** (call center único) | **Multi-tenant real** por `companyId` (+ `distributorId`) |
| WhatsApp QR | `whatsapp-web.js` + Chromium + `LocalAuth` (sesión en **disco**) | **Baileys** (`@whiskeysockets/baileys`) + authState **cifrado en Mongo** |
| WhatsApp Cloud | `whatsappCloud.js` + `whatsappGateway.js` | `WhatsAppCloudAdapter` + `accountGateway.js` |
| Cola de trabajo | `setInterval` cada 60s por job | **Cola persistente** (`Job` + `JobWorker` + reintentos) |
| Motor de workflows | Grafo visual (react-flow) + lineal, **envía mensajes** | Event-driven robusto **pero NO envía mensajes** (acciones de envío en estado `planned`) |
| Plantillas HSM | Ciclo completo con Meta (incl. **subida real de media header**) | Ciclo casi completo, **falta la subida real del header de media** |
| Envío masivo / goteo | Campañas + `ScheduledMessage` + `dripRunner` | **No existe** motor de envío masivo |

**Conclusión clave:** nuestro backend es, en infraestructura, **igual o más avanzado** que el de la
clínica (cola persistente, cifrado de secretos, multi-tenant, gating por módulos, storage
abstraído, tracking de uso). Lo que falta es **"el último tramo"**: que las **automatizaciones/
workflows puedan enviar WhatsApp/plantillas/email**, cerrar el ciclo de **plantillas con imagen**,
añadir **disparadores de chat (keyword / respuesta sí-no) y esperas de respuesta**, y un
**motor de campañas/goteo**. Más varios **ajustes de configuración** para que WhatsApp QR y Cloud
queden operativos.

**Prioridad #1 absoluta:** implementar las acciones de mensajería en el motor de workflows
(`whatsapp.send`, `whatsapp.send_template`, `email.send`). Sin eso, "las automatizaciones" no
mandan nada aunque el chat y los números funcionen.

---

# PARTE A — Cómo funciona `proyecto_clinica` (referencia)

Arquitectura de mensajería en capas (de abajo hacia arriba):

```
                 ┌───────────────────────────────────────────────┐
   Workflows ───▶│                                               │
   Campañas  ───▶│   utils/messaging.js  (send / updateStatus)   │──▶ Conversation + Message (Mongo)
   Chat UI   ───▶│   ventana 24h · opt-out · plantillas · media  │
                 └───────────────────┬───────────────────────────┘
                                     │
                 ┌───────────────────▼───────────────────────────┐
                 │   utils/whatsappGateway.js  (enruta por cuenta)│
                 └──────────┬──────────────────────┬──────────────┘
                            │ connectionType='qr'  │ connectionType='cloud_api'
                 ┌──────────▼─────────┐   ┌─────────▼───────────────┐
                 │ whatsappQrManager  │   │ whatsappCloud.js (Meta) │
                 │ (whatsapp-web.js)  │   │ Graph API               │
                 └────────────────────┘   └─────────────────────────┘
```

Entrantes: webhook Cloud (`/api/chats/webhook/whatsapp`) **y** eventos de la sesión QR
desembocan en el **mismo** pipeline: `chatController.ingestExternalMessage()`.

## A.1 Modelo de número: `WhatsappAccount`

`proyecto_clinica/server/models/WhatsappAccount.js`. Un documento por número. Campo decisivo:
`connectionType: 'cloud_api' | 'qr'`.

- **Cloud API:** `phoneNumberId`, `businessAccountId` (WABA), `accessToken` (**cifrado** con
  `secretCrypto`, AES-256-GCM, prefijo `enc:v1:`), + salud (`qualityRating`, `messagingLimit`).
- **QR:** `status` (`disconnected|qr_pending|connecting|syncing|connected|auth_failure`),
  `sessionId`, `connectedPhone`, `lastConnectedAt`, `lastQrAt`.
- Comunes: `label`, `enabled`, `isDefault` (número para campañas/workflows), `displayPhone`.

## A.2 WhatsApp por **QR** — `utils/whatsappQrManager.js`

Usa `whatsapp-web.js` con `LocalAuth` (perfil de Chromium **en disco**, `server/.wwebjs_auth/`).
Explícitamente **NO** usan `RemoteAuth` (zips a Mongo) porque les tumbaba el proceso. Puntos que
merece la pena replicar como *lecciones de producción* (nosotros ya cubrimos varias con Baileys):

- **Un `Client` por número** en un `Map` en memoria; el QR se emite por socket.io y se **cachea**
  para poder recuperarlo por sondeo HTTP si el socket se cayó.
- **Watchdog de arranque (90s):** si no sale QR ni conecta, mata el cliente y avisa.
- **Watchdog de sincronización (3 min):** tras escanear, si nunca llega `ready`, reinicia desde la
  sesión guardada (1 reintento) y si no, deja `disconnected` con motivo.
- **Chequeo de salud periódico (45s) + `verifyConnected` con `getState`:** detecta el caso
  "desvinculé desde el teléfono y no llegó ningún evento" y corrige el estado.
- **Apagado ordenado (`shutdownAll` en SIGINT/SIGTERM):** cierra los Chromium con `destroy()` para
  no corromper la sesión en cada deploy.
- **Reconexión al boot** (`initEnabledOnBoot`): solo cuentas que **completaron** vinculación
  (`connectedPhone` presente).
- **Envío citando (reply):** localiza el mensaje a citar dentro del store de WhatsApp Web
  (por wamid, por hash o por texto) — mucha ingeniería para chats con "número oculto" (LID).
- Entrantes: `client.on('message')` → filtra grupos/estados → descarga media inline →
  `ingestExternalMessage()` (mismo pipeline que Cloud). `message_ack` → actualiza estado de entrega.

## A.3 WhatsApp por **Cloud API (Meta)** — `utils/whatsappCloud.js`

Cliente liviano sobre Graph API (`v23.0` por defecto):
`sendText`, `sendMedia` (por link público, no data-URL), `sendTemplate`, `downloadMedia`, `sendBulk`.
Recibe `creds` construidas por el gateway a partir de la `WhatsappAccount` (token descifrado).

## A.4 Gateway — `utils/whatsappGateway.js`

Abstrae "por qué número y por qué método sale esto":
`getDefaultAccount`, `resolveAccountForConversation(conv)`, `getCloudAccountByPhoneNumberId(pnid)`
(para enrutar webhooks), `getDefaultCloudAccount` (para plantillas), y `sendText/sendMedia/sendTemplate/downloadMedia`
que **enrutan** a `whatsappQrManager` o `whatsappCloud` según `connectionType`. Un número QR
**rechaza plantillas** (`qr_no_template`): el caller debe mandar texto libre.

## A.5 Pipeline central — `utils/messaging.js` (el corazón)

Función `send({...})`. Todo lo importante vive aquí:

1. **Resuelve conversación** (`Conversation` única por `(clinic, phone)`), paciente y **cuenta**
   (`resolveAccountForConversation`).
2. **Opt-out / consentimiento** (`optOutReasonFor`): respeta `marketing.optOutAt`,
   `whatsappOptIn`, `emailOptIn`. Palabras clave de baja (`BAJA/STOP/CANCELAR…`) → `isOptOutText`.
3. **Ventana de 24h** (solo Cloud): `window24hExpiresAt`. Fuera de ventana **sin plantilla** →
   `out_of_window` (se salta). Dentro de ventana o con plantilla → envía.
4. **Plantillas:** `enrichTemplateHeader` reconcilia el nº de parámetros del body contra las
   variables reales de la plantilla, resuelve variables por **nombre** (paciente + datos reales de
   la cita: `{{servicio}}/{{fecha}}/{{hora}}/{{doctor}}/{{sede}}`), y **antepone la cabecera de
   media**. Por **QR** renderiza la plantilla a **texto** y, si hay header de imagen, manda la
   imagen real con el texto de pie.
5. **Persiste** el `Message` (preview renderizado, `templateName`, `replyTo`, `deliveryStatus`),
   incrementa `usageCount` de la plantilla, actualiza el snapshot de la conversación, marca
   leídos si respondió un agente, y emite `chat:message` por socket.
6. `updateMessageStatus`: mapea acks (`sent/delivered/read/failed`) y los persiste; sabe
   reconciliar wamids con distinta forma de JID (chats LID).

## A.6 Webhook Cloud entrante — `controllers/chatController.js`

- `GET /api/chats/webhook/whatsapp` verifica `hub.verify_token` contra config global.
- `POST` valida `x-hub-signature-256` (HMAC del `rawBody`, `utils/metaWebhook.js`), enruta por
  `phone_number_id` a la `WhatsappAccount`, y procesa **cambios**:
  `message_template_status_update`/`template_category_update` → controller de plantillas;
  `phone_number_quality_update` → `whatsappQuality`; `calls` → llamadas; `statuses` → acks;
  `messages` → `ingestExternalMessage` (media por id, botones interactivos, `context.id` para
  citas, `referral` de anuncios click-to-WhatsApp).
- `ingestExternalMessage` es el **único** punto de ingesta (Cloud + QR): dedup por `externalId`,
  crea/actualiza conversación, vincula paciente por teléfono, crea oportunidad por anuncio,
  aplica opt-out, y **dispara los workflows**: `resumeOnReply`, `enrollForChatMessage`.

## A.7 Plantillas HSM — `controllers/messageTemplateController.js` + `models/MessageTemplate.js`

Ciclo de vida completo contra Meta:
- CRUD local (`draft`), `variables` autodetectadas de `{{...}}`.
- **`uploadHeaderImage`**: guarda la imagen (JPG/PNG, no WEBP) y devuelve URL pública autoalojada.
- **`submit`** → `submitTemplateToMeta`: convierte variables nombradas a **numeradas** (`{{1}}`),
  construye `components`, y para header de media **sube el archivo a la Resumable Upload API de
  Meta** (`/app` → `/uploads` → recibe `handle`) y registra con `example.header_handle:[handle]`.
  **Esto es lo que nosotros aún no hacemos.**
- **Sincronización** (`syncTemplatesFromMeta`, job periódico) y **webhook** de estado/categoría →
  actualiza estado local (`approved/pending/rejected/disabled`) y levanta alertas (recategorización
  a MARKETING encarece → alerta de costo).

## A.8 Automatizaciones / Workflows — `utils/workflowEngine.js` + `models/Workflow.js`

El motor **más completo** de la referencia. Dos representaciones:
- **Lineal** (`steps[]`, legacy) y **grafo visual** (`nodes[]`/`edges[]`, editor react-flow con
  ramas `yes/no`).
- **Disparadores** (`triggers[]`, lógica OR): eventos de dominio (`appointment_created`,
  `appointment_no_show`, `patient_birthday`, `sale_created`, `payment_received`, `quotation_sent`,
  `tag_added`…) **y de chat** (`inbound_message`, `keyword`, `new_conversation`, `ctwa_ad`).
- **Pasos de acción:** `send_message`, `send_template`, `send_media`, `send_email`,
  `assign_agent` (round-robin), `create_task`, `webhook`, `request_review`, `ai_reply`,
  `set_appointment_status`, `add_tag/remove_tag`, `move_stage`, `goal`, `meta_capi`,
  `fb_audience_add/remove`. **Sí envían mensajes de verdad** vía `messaging.send`.
- **Control de flujo:** `wait` (N min), `wait_until` (N días antes de la cita a hora fija),
  `wait_reply` (pausa hasta respuesta + timeout), `condition` (tag/stage/source/lastReply/clinic).
- **Inscripciones** (`WorkflowEnrollment`): una por (workflow, paciente, flujo); anti-duplicado por
  cita+evento; `context` (teléfono, appointmentId, appointmentDate); **log de ejecución** paso a
  paso (clave para diagnosticar envíos saltados); **reintentos** de canal caído (QR desconectado se
  reintenta 5 min hasta 3h, sin quemar el turno); recuperación de inscripciones atascadas.
- **Reanudación por respuesta** (`resumeOnReply`): clasifica `yes/no/other` para que las
  `condition` bifurquen. `syncEnrollmentsForAppointment` / `cancelWaitingEnrollmentsForAppointment`
  recalculan/anulan recordatorios si la cita se reagenda/cancela.
- **Bus de eventos** in-process (`utils/events.js`): los controladores emiten `emitDomainEvent(...)`
  y el motor reacciona (`subscribeDomainEvents`). Un `setInterval` cada 60s procesa esperas
  vencidas (`processDueEnrollments`).

## A.9 Chats / Conversaciones / CRM

`models/Conversation.js`: única por `(clinic, phone)`, `patient`, `assignedTo`, `status`,
`opportunity`/`opportunities` (Kanban `nuevo→…→ganado/perdido`), `tags`, `unreadCount` (no se
limpia al abrir, solo al **responder**), `window24hExpiresAt`, `attribution` (anuncios),
`internalNotes`. `models/Message.js`: `direction in/out`, `mediaType`, `externalId` (wamid),
`replyTo` (cita), `quoteResult`, `statusTimestamps`, `deliveryStatus`.

## A.10 Arranque — `index.js`

`process.env.TZ='America/Guayaquil'`; `unhandledRejection` no tumba el proceso; apagado ordenado de
Chromium; **jobs cada 60s** (flows, campañas, importaciones, goteo, workflows), reconexión QR a los
5s, sync de plantillas cada 60 min. Interruptor `JOBS_DISABLED=1` para desarrollo.

---

# PARTE B — Auditoría de NUESTRO proyecto (estado actual)

Buenas noticias: **la mayor parte de la infraestructura ya existe y está bien hecha.** Detalle por
capacidad, con archivos.

## B.1 WhatsApp por QR — ✅ **Muy completo** (Baileys)

`server/src/modules/conversations/WhatsAppQrSessionManager.js` (1419 líneas). Cubre —y en varios
casos supera— al `whatsappQrManager` de la clínica:

- **authState cifrado en Mongo** (`WhatsAppQrAuthStore.js` + `credentialCrypto.js`), no en disco →
  apto para hosting efímero y multi-instancia.
- **Lease de sesión** (`runtimeLease`): garantiza **un solo dueño** por sesión entre varias
  instancias (algo que la clínica no necesita porque corre en un único VPS).
- Watchdog de sincronización, **health monitor** (ping de presencia), reconexión con backoff
  exponencial, `regenerate-qr`, `logout` (borra authState), `disconnect`, `setEnabled`.
- Media entrante y saliente vía **storage provider** (`modules/storage/`), con validación de MIME/
  tamaño y **tracking de uso** (`media_storage_mb`, `media_files`).
- **Ingesta de `fromMe`** (mensajes enviados desde el teléfono) como salientes, con dedup.
- **Reconciliación** número↔sesión 1:1 (`reconcileCompanyQr`), `diagnostics`, `metrics`.
- Restauración al boot (`restoreSessions` en `server.js`).
- **Gate:** todo el subsistema está detrás de `WHATSAPP_QR_ENABLED === 'true'` (ver gaps de config).

Rutas: `routes/whatsappSessionRoutes.js` (crear, listar, QR, connect/reconnect, regenerate-qr,
disconnect, logout, enabled, diagnostics, metrics) con permisos finos y rate-limit.
UI: `client/src/pages/inbox/WhatsAppQrSessionsPanel.jsx` + `WhatsAppNumbersPage.jsx`.

## B.2 WhatsApp por Cloud API (Meta) — ✅ **Completo**

`server/src/modules/conversations/adapters/WhatsAppCloudAdapter.js` (606 líneas):
`sendMessage` (texto/media/plantilla), `verifyWebhook` (`hub.verify_token`),
`verifySignature` (`x-hub-signature-256`), `normalizeInboundMessage`, `normalizeStatusUpdate`,
`getMediaMetadata`/`downloadMedia`, `testConnection`, `fetchQuality`, `createMessageTemplate`,
`listMessageTemplates`. Bloquea URLs privadas (SSRF) al mandar media por link.
Webhook: `routes/webhookRoutes.js` → encola job → `WhatsAppWebhookService.processPayload`.

## B.3 Gateway de cuentas — ✅ **Completo**

`server/src/modules/communications/accountGateway.js`: `getDefaultAccount`,
`resolveAccountForConversation`, `getDefaultCloudAccount`, `setDefaultAccount`,
`cloudAccountMissingFields`, `isCloudAccountComplete`. Todo scoped por `companyId`.

## B.4 Pipeline de envío/recepción — ✅ **Completo y robusto**

`server/src/modules/conversations/ConversationService.js`:
- `createOutboundMessage` → evalúa **política** (`CommunicationPolicyService`) → crea `Message`
  (`queued/scheduled`) → **encola job** → `processOutboundMessage` → `adapter.sendMessage`.
- **Política de comunicación** (`communicationPolicyRules.js`): consentimiento/opt-in,
  DND global, canal bloqueado, supresión, **horario silencioso** (quiet hours con reprogramación),
  **ventana 24h** (`recentInbound` para `category:'reply'`), permisos por categoría.
- Reintentos vía cola (`Job`, `JobWorker`), `trackUsage('whatsapp_messages')`, realtime.
- Entrantes: `WhatsAppInboundService` (dedup por `WebhookEvent`, `findOrCreateContact`,
  `findOrCreateConversation`, `createInboundMessage`), estados: `WhatsAppWebhookService.processStatus`.

## B.5 Plantillas — 🟡 **Casi completo (falta media header)**

`server/src/modules/communications/TemplateSyncService.js` + `models/MessageTemplate.js` + UI
`MessageTemplatesPage.jsx`: `buildComponents`, `buildOutboundTemplate`, `validateForRegister`,
registro (`createMessageTemplate`), sync (`listMessageTemplates`), webhook de estado
(`handleStatusWebhook`), `recordSuccessfulUse`.
**Gap:** el header de media pasa `headerMediaUrl` como `header_handle` (líneas ~84-89), pero Meta
exige un **handle real** de la Resumable Upload API. → registrar plantillas con header
IMAGE/VIDEO/DOCUMENT **falla**. (La clínica ya lo resolvió en `uploadHeaderMediaHandle`.)

## B.6 Workflows / Automatizaciones — 🟥 **El gap crítico**

`server/src/modules/workflows/` (event-driven, cola, idempotente, con condiciones, delays,
reintentos, alertas). Muy bien de infraestructura. **PERO:**

- `WorkflowActionExecutor.js` implementa acciones **solo de CRM**: `contact.*`, `opportunity.*`,
  `task.*`, `conversation.*` (assign/close/nota interna), `appointment.create_internal_reminder`,
  `notification.create`, `alert.create`, `activity_log.create`, `delay.*`.
- Las acciones de **mensajería al cliente** están en `PLANNED_ACTIONS` (`workflowCatalog.js`):
  **`email.send`, `sms.send`, `whatsapp.send`, `webhook.call`, `ai.generate`, `review_request.create`,
  `coupon.issue`, `referral.create`…** → al ejecutarse lanzan **`Accion no implementada`**.
- **No hay** `whatsapp.send_template`, ni disparador **`keyword`**, ni clasificación de respuesta
  **sí/no**, ni **`delay.wait_reply`** (pausa hasta que el cliente responde). Sí existe el trigger
  `message.inbound_received`, pero sin matching por palabra clave.
- Editor de workflows (`client/src/pages/workflows/WorkflowsPage.jsx`) es de **lista de acciones**
  (no grafo visual). Suficiente para empezar; el grafo es opcional.

**Traducción práctica:** hoy, un workflow puede mover etapas, crear tareas y notas… pero **no puede
mandar un WhatsApp, una plantilla ni un email al contacto.** Ese es el corazón de "las
automatizaciones" y es lo primero a construir.

## B.7 Envío masivo / campañas / goteo — 🟥 **No existe**

`models/Campaign.js` + `routes/campaignRoutes.js` son de **atribución de marketing** (presupuesto,
forms, landings, funnels), **no** un motor de difusión. No hay equivalente a
`ScheduledMessage`/`dripRunner`/`segmentResolver` de la clínica (envío por segmento con goteo).

## B.8 Cosas que la clínica tiene y nosotros no (menor prioridad)

- **Meta Conversions API (CAPI)** y **Custom Audiences** (`meta_capi`, `fb_audience_*`).
- **Click-to-WhatsApp** attribution (`referral`/`ctwa_ad`) → oportunidad por anuncio.
- **`request_review` / `ai_reply`** como pasos de workflow.
- **Editor visual en grafo** con ramas.

## B.9 Cosas que nosotros tenemos y la clínica no (ventajas a conservar)

Cola persistente con reintentos y DLQ, authState **cifrado en Mongo**, lease multi-instancia,
storage abstraído + validación de media, **gating por módulos** (`ModuleEntitlement`) y **permisos
finos**, límites de uso (`usage`), CRM genérico (pipelines, forms, funnels, landings, reputación,
loyalty, referidos), SSRF-guard en media.

---

# PARTE C — Análisis de brechas (tabla maestra)

| # | Capacidad | Clínica | Nuestro proyecto | Severidad | Sección plan |
|---|-----------|:-------:|:----------------:|:---------:|:------------:|
| G1 | Workflow envía **WhatsApp texto** | ✅ | 🟥 planned | **Crítica** | D.1 |
| G2 | Workflow envía **plantilla HSM** | ✅ | 🟥 no existe | **Crítica** | D.1 |
| G3 | Workflow envía **email** | ✅ | 🟥 planned | Alta | D.1 |
| G4 | Disparador **keyword** + `new_conversation` | ✅ | 🟥 | Alta | D.2 |
| G5 | **wait_reply** + clasificación sí/no | ✅ | 🟥 | Alta | D.2 |
| G6 | Plantillas: **subida real de media header** a Meta | ✅ | 🟡 caveat | Alta | D.3 |
| G7 | **Motor de campañas / goteo / segmentos** | ✅ | 🟥 | Media | D.4 |
| G8 | Config para **QR operativo** (`WHATSAPP_QR_ENABLED`, key) | n/a | 🟥 off | **Crítica** | D.5 |
| G9 | `WHATSAPP_GRAPH_API_VERSION` **v20 → vigente** | ✅ v23 | 🟡 v20 | Media | D.5 |
| G10 | **Reminders de cita** que envían WhatsApp (no solo interno) | ✅ | 🟡 solo interno | Alta | D.1 / D.6 |
| G11 | CAPI / Custom Audiences / CTWA | ✅ | 🟥 | Baja | D.7 |
| G12 | Editor **grafo visual** de workflows | ✅ | 🟡 lista | Baja | D.7 |

---

# PARTE D — Plan de implementación (pasos concretos para la IA)

> Convenciones: rutas relativas a la raíz del repo. Nuestro código es **ESM** (`import`/`export`),
> clases estáticas de servicio, todo **scoped por `companyId`**. Reutilizar SIEMPRE los servicios
> existentes (no reinventar el envío: pasa por `ConversationService`). Cada acción de workflow
> corre bajo un **actor interno** (`context.actor`) ya resuelto por `WorkflowService`.

## D.1 — [CRÍTICO] Acciones de mensajería en workflows (G1, G2, G3, G10)

**Meta:** que un workflow pueda enviar WhatsApp (texto/media), plantilla HSM y email al contacto
del evento, reutilizando toda la política/cola/24h ya existente.

### Paso 1.1 — Helper de resolución de conversación destino

Crear `server/src/modules/workflows/workflowMessaging.js`:

```js
import { Contact } from '../../models/Contact.js';
import { Conversation } from '../../models/Conversation.js';
import { ConversationService } from '../conversations/ConversationService.js';
import { getDefaultAccount, resolveAccountForConversation } from '../communications/accountGateway.js';

/** Resuelve (o crea) la conversación de WhatsApp del contacto del contexto del workflow. */
export async function resolveWorkflowConversation(context, { contactId } = {}) {
  const companyId = context.companyId;
  const cid = contactId
    || (context.event.entityType === 'contact' ? context.event.entityId : null)
    || context.payload.contactId
    || context.entity?.contactId
    || context.entity?._id;                    // si la entidad ya es el contacto
  const contact = await Contact.findOne({ _id: cid, companyId, archivedAt: null });
  if (!contact) throw Object.assign(new Error('El evento no tiene un contacto para mensajear'), { status: 400, retryable: false });

  // Conversación de WhatsApp existente o nueva (channel según número por defecto).
  let conversation = await Conversation.findOne({
    companyId, contactId: contact._id, channel: /whatsapp/, archivedAt: null
  }).sort({ lastMessageAt: -1 });
  if (!conversation) {
    const account = await getDefaultAccount(companyId);
    if (!account) throw Object.assign(new Error('No hay número de WhatsApp por defecto configurado'), { status: 409, retryable: false });
    ({ conversation } = await ConversationService.findOrCreateConversation({
      companyId,
      distributorId: context.distributorId,
      contactId: contact._id,
      channel: account.channel,               // 'whatsapp_qr' | 'whatsapp_cloud'
      channelConfigId: account._id,
      createdBy: context.actor._id
    }));
  }
  return { contact, conversation };
}
```

### Paso 1.2 — Implementar las acciones en `WorkflowActionExecutor.execute`

En `server/src/modules/workflows/WorkflowActionExecutor.js`, añadir `case`s. **Reutilizar
`ConversationService.createOutboundMessage`** (aplica política, 24h, cola, uso, realtime):

```js
case 'whatsapp.send': {
  const { conversation } = await resolveWorkflowConversation(context, { contactId: config.contactId });
  const message = await ConversationService.createOutboundMessage({
    user: actor,
    conversation,
    text: config.text,                          // ya interpolado por resolvedConfig()
    type: config.mediaStorageKey ? (config.mediaType || 'image') : 'text',
    media: config.mediaStorageKey
      ? { storageKey: config.mediaStorageKey, caption: config.caption, mimeType: config.mimeType }
      : {},
    category: config.category || 'commercial',
    adminOverride: false
  });
  await logAction(actor, context, 'workflow_whatsapp_sent', 'WhatsApp enviado por workflow',
    { conversationId: conversation._id, contactId: conversation.contactId, messageId: message._id });
  return { conversationId: conversation._id, messageId: message._id };
}

case 'whatsapp.send_template': {
  const { conversation } = await resolveWorkflowConversation(context, { contactId: config.contactId });
  const { MessageTemplate } = await import('../../models/MessageTemplate.js');
  const { buildOutboundTemplate } = await import('../communications/TemplateSyncService.js');
  const tpl = await MessageTemplate.findOne({
    _id: config.templateId, companyId, channel: 'whatsapp_cloud', status: 'approved'
  });
  if (!tpl) throw badRequest('Plantilla no encontrada o no aprobada');
  const providerTemplate = buildOutboundTemplate(tpl, config.variables || {});
  const message = await ConversationService.createOutboundMessage({
    user: actor,
    conversation,
    text: tpl.content,                          // texto renderizado para la burbuja
    type: 'text',
    template: providerTemplate,                 // el adapter Cloud lo manda como type:'template'
    templateId: tpl._id,
    category: tpl.category === 'MARKETING' ? 'commercial' : 'transactional'
  });
  return { conversationId: conversation._id, messageId: message._id, template: tpl.name };
}

case 'email.send': {
  // Requiere el proveedor de email (ver nota). Si aún no existe, dejar como no-op explícito.
  const to = config.to || context.entity?.email || context.payload?.email;
  if (!to) throw badRequest('El contacto no tiene email');
  const { EmailProvider } = await import('../communications/EmailProvider.js'); // a crear
  const result = await EmailProvider.send({
    companyId, to, subject: config.subject, html: config.body || config.html
  });
  await logAction(actor, context, 'workflow_email_sent', `Email enviado a ${to}`, { to });
  return { to, providerId: result.id };
}
```

> **Nota email:** la clínica usa `utils/emailProvider.js`. Nosotros no tenemos proveedor de email
> configurado todavía. Si no se va a integrar aún, **no** promuevas `email.send` a `active`: déjalo
> en `planned` para no ofrecer en la UI algo que fallará. Prioriza `whatsapp.send` /
> `whatsapp.send_template`.

### Paso 1.3 — Mover las acciones de `planned` a `active` en el catálogo

En `server/src/modules/workflows/workflowCatalog.js`, sacar de `PLANNED_ACTIONS` y añadir a
`WORKFLOW_ACTIONS` (con `requiredModules` = `whatsapp`/`conversations`):

```js
['whatsapp.send', ['text']],
['whatsapp.send_template', ['templateId']],
// 'email.send' solo cuando exista EmailProvider
```

Ajustar el `.map(...)` para que el módulo requerido de `whatsapp.*` sea `'whatsapp'`.

### Paso 1.4 — Validación de acciones

En `server/src/modules/workflows/workflowValidation.js`, añadir el schema de config de las nuevas
acciones (`whatsapp.send`: `text` o `mediaStorageKey`; `whatsapp.send_template`: `templateId` +
`variables`). Mantener la interpolación `{{event.…}}`/`{{entity.…}}`/`{{payload.…}}` que ya hace
`resolvedConfig`.

### Paso 1.5 — Interpolación de variables de contacto

Para que `{{contact.name}}` o `{{entity.name}}` funcionen en el `text`, cargar el contacto en el
`context` cuando el evento sea de contacto/conversación. `getSafePath` ya lee `context.entity`;
basta con que `WorkflowService.loadEntity` devuelva el contacto (ya lo hace para `entityType:'contact'`).
Documentar en la UI qué rutas hay disponibles.

**Criterios de aceptación D.1**
- Crear workflow con trigger `contact.created` + acción `whatsapp.send("Hola {{entity.name}}")` →
  el contacto recibe el WhatsApp por el número por defecto; queda `Message` outbound + `ActivityLog`
  `workflow_whatsapp_sent` + `WorkflowRun.executedActions[].status='completed'`.
- Fuera de ventana 24h sin plantilla → el `Message` queda `blocked` con `reasonCode` claro (la
  política ya lo hace); el run **no** revienta, lo registra.
- `whatsapp.send_template` con plantilla `approved` → llega la plantilla; `usageCount++`.

## D.2 — [ALTA] Disparadores de chat: keyword, new_conversation, wait_reply (G4, G5)

**Meta:** automatizar respuestas a mensajes entrantes (bot básico) y esperar la respuesta del cliente.

### Paso 2.1 — Emitir eventos de chat ricos

Hoy `message.inbound_received` se emite vía `recordActivity` → `WorkflowEventEmitter.emitFromActivity`
(mapeo por `activity.type`). Verificar que el **texto** del mensaje entrante viaje en el `payload`
del evento (para poder hacer matching por keyword). En `WhatsAppInboundService`/`ConversationService.createInboundMessage`,
al registrar la actividad `message_inbound_received`, incluir en `metadata`: `text`, `conversationId`,
`contactId`, `isNewConversation`. `emitFromActivity` ya pasa `metadata` como `payload`.

### Paso 2.2 — Trigger `keyword`

Añadir a `workflowCatalog.WORKFLOW_TRIGGERS` una variante `message.keyword` (sourceModule
`conversations`) **o** —más simple— soportar un **filtro** en las `conditions` del workflow sobre
`payload.text` con operador `contains`. Recomendado: implementar como **condición** reutilizando
`evaluateCondition` (ya tiene `contains`, `equals`, `in`), evitando un tipo de trigger nuevo:
- Trigger: `message.inbound_received`.
- Condición: `payload.text contains "cita"` (normalizar a minúsculas/sin acentos en `getSafePath`
  o en un operador nuevo `contains_ci`).

Si se quiere el trigger dedicado tipo clínica, replicar `keywordMatchesTrigger`
(`exact|starts|contains`) en `workflowValidation.js` y filtrarlo en `WorkflowService.queueRun`.

### Paso 2.3 — `delay.wait_reply`

Nuevo tipo de acción de control de flujo (como `delay.wait_minutes`, pero se resuelve por evento):
1. En `WorkflowService.executeWorkflowRun`, al encontrar `delay.wait_reply`: poner run en
   `waiting`, guardar `metadata.cursor`, `metadata.waitingForReply=true`,
   `metadata.waitConversationId`, y encolar un job de **timeout** (`runAt = now + timeoutMinutes`).
2. Nuevo servicio `WorkflowService.resumeOnReply({ companyId, conversationId, contactId, text })`:
   busca `WorkflowRun` en `waiting` con `metadata.waitingForReply` para esa conversación, mete
   `payload.lastReply = classifyReply(text)` (portar `YES_WORDS/NO_WORDS` de la clínica) y
   reanuda (`executeWorkflowRun`).
3. Invocar `resumeOnReply` desde el **ingest** de mensajes entrantes
   (`WhatsAppInboundService.processNormalized`, tras crear el `Message`), en fire-and-forget.
4. Las `condition` posteriores pueden evaluar `payload.lastReply == 'yes'`.

**Criterios de aceptación D.2**
- Enviar "hola" a un número conectado con workflow `keyword: hola → whatsapp.send("¡Bienvenido!")`
  → responde solo.
- Workflow con `whatsapp.send("¿Confirmas? sí/no")` → `wait_reply` → `condition lastReply==yes` →
  `whatsapp.send("¡Listo!")`. Responder "sí" reanuda y envía la confirmación.

## D.3 — [ALTA] Plantillas: subida real de media header a Meta (G6)

**Meta:** poder registrar plantillas con cabecera IMAGE/VIDEO/DOCUMENT.

Portar `uploadHeaderMediaHandle` de la clínica
(`proyecto_clinica/server/controllers/messageTemplateController.js`, líneas ~573-624) a nuestro
`WhatsAppCloudAdapter`:

1. Nuevo método `WhatsAppCloudAdapter.uploadResumableHeader({ buffer, mimeType })`:
   - `GET /{apiVersion}/app?access_token=…` → `app.id`.
   - `POST /{apiVersion}/{app.id}/uploads?file_length=…&file_type=…` → `session.id`.
   - `POST /{apiVersion}/{session.id}` con headers `Authorization: OAuth <token>`, `file_offset: 0`,
     body = buffer → devuelve `{ h: handle }`.
   - Validar MIME: IMAGE → jpg/png; DOCUMENT → pdf.
2. En `TemplateSyncService` (donde hoy se hace `buildComponents` para registrar): si
   `headerType ∈ {image,document,video}`, **leer los bytes del storage** (por `headerMediaUrl` o un
   `headerMediaStorageKey`), subirlos con el método nuevo y pasar `example.header_handle: [handle]`
   en vez de la URL.
3. Añadir a `MessageTemplate` un `headerMediaStorageKey` (o reutilizar el storage provider) para no
   depender de una URL pública accesible por Meta.

**Criterio de aceptación:** registrar una plantilla `UTILITY` con header imagen (JPG) → Meta la
acepta (`status: PENDING`) sin el error "header requires an example".

## D.4 — [MEDIA] Motor de campañas / goteo por segmento (G7)

**Meta:** difusión controlada (plantillas a un segmento) sin tumbar el número.

Diseño mínimo (portando la idea de `dripRunner` + `ScheduledMessage` de la clínica, adaptado a
nuestra cola persistente):

1. Nuevo modelo `BroadcastCampaign` (o extender `Campaign`): `templateId`, `segmentId`/`contactIds`,
   `channelConfigId`, `throttlePerMinute`, `status`, `stats`.
2. Reutilizar `Segment` (`models/Segment.js`) para resolver destinatarios (`segmentResolver`
   equivalente ya insinuado por el modelo).
3. Servicio `BroadcastService.launch(campaignId)`: resuelve contactos, y por cada uno **encola** un
   job `message.outbound.send` con `runAt` escalonado (`index / throttlePerMinute`) que crea el
   outbound vía `ConversationService.createOutboundMessage({ template })`. La política de
   comunicación (opt-out, 24h→exige plantilla) ya protege cada envío.
4. UI en `client/src/pages/marketing/` (nueva `BroadcastsPage`).

> Nota: como cada envío pasa por la política y por la cola, el "goteo" es simplemente `runAt`
> escalonado + `throttlePerMinute`. No hace falta el `setInterval` de la clínica.

## D.5 — [CRÍTICO/CONFIG] Dejar WhatsApp operativo (G8, G9) — ver también PARTE E

- `WHATSAPP_QR_ENABLED=true` (hoy ausente → QR **apagado**).
- `CREDENTIALS_ENCRYPTION_KEY` = clave fuerte (32 bytes). Sin ella no se pueden cifrar/descifrar
  tokens Cloud ni el authState QR.
- `WHATSAPP_GRAPH_API_VERSION`: subir de `v20.0` a una versión vigente (`v23.0`+).
- Documentar todas las `WHATSAPP_QR_*` (ver `whatsappQrConfig.js`).

## D.6 — [ALTA] Recordatorios de cita que envían WhatsApp (G10)

Hoy `appointment.create_internal_reminder` + `AppointmentReminderService` generan **recordatorio
interno/notificación**. Para paridad con la clínica (recordatorio real al paciente):
- Nueva acción de workflow `appointment.send_reminder` que use `whatsapp.send_template` con la
  plantilla de recordatorio y variables `{{fecha}}/{{hora}}/…` desde el `Appointment` del contexto,
  o
- que `AppointmentReminderService.process` (job `appointment.reminder`) invoque
  `ConversationService.createOutboundMessage({ template })` además de la notificación interna.

## D.7 — [BAJA] Extras (G11, G12)

CAPI/Custom Audiences (portar `metaConversions.js`/`metaCustomAudience.js` como acciones
`meta.capi`/`audience.add`), atribución CTWA (leer `referral` en el webhook Cloud →
`Conversation.attribution`/`Opportunity`), y editor visual en grafo (react-flow) para workflows.
Todo opcional; abordar tras D.1–D.3.

---

# PARTE E — Auditoría "qué falta para que funcione" (config, permisos, arranque, operación)

Aunque el código esté, hay **pasos de puesta en marcha** sin los cuales nada envía ni recibe.

## E.1 Variables de entorno (`server/.env.example` está incompleto)

| Variable | Estado hoy | Debe ser | Por qué |
|---|---|---|---|
| `WHATSAPP_QR_ENABLED` | **ausente** (=off) | `true` para usar QR | `WhatsAppQrSessionManager.assertEnabled()` lanza 503 si no |
| `CREDENTIALS_ENCRYPTION_KEY` | vacío | 32 bytes fuertes | cifra tokens Cloud + authState QR; sin ella el QR/Cloud no arrancan bien |
| `WHATSAPP_GRAPH_API_VERSION` | `v20.0` | `v23.0`+ | v20 fuera de soporte; envíos/plantillas fallan raro |
| `REQUIRE_WEBHOOK_SIGNATURE` | `false` | `true` en prod | valida `x-hub-signature-256` de Meta |
| `JOB_WORKER_ENABLED` | `true` | `true` | **si es `false`, NO se procesa NADA** (webhooks, envíos, workflows) |
| `MONGODB_URI` / `JWT_SECRET` | vacíos | definidos | arranque |
| `MEDIA_STORAGE_PROVIDER` | `local` | `local`/`s3`… | media entrante/saliente |
| `WHATSAPP_QR_*` (tuning) | ausentes | opcionales | leases, watchdogs, límites (ver `whatsappQrConfig.js`) |

> Recordatorio (memoria del proyecto): el `.env` local apunta a **Mongo local**, no Atlas. Cuidado
> de no correr jobs contra datos que no toca. La clínica tiene un `JOBS_DISABLED=1` para esto;
> nosotros usamos `JOB_WORKER_ENABLED=false` en dev si hace falta.

**Acción:** actualizar `server/.env.example` con estas variables y comentarios.

## E.2 Módulos (entitlements) — sin ellos las rutas dan 403

Todo pasa por `checkModuleAccess`. La empresa (o su plan) debe tener habilitados:
`conversations`, `inbox`, `whatsapp`, `automations`, `workflows`, `contacts`, `media`, `notifications`,
`realtime`. Rutas como `whatsappSessionRoutes` exigen **los tres**: `conversations` + `inbox` +
`whatsapp` (`assertModules`). El webhook Cloud exige `whatsapp`.
**Acción:** verificar `ModuleEntitlement`/`Plan`/`PlatformPlan` de la empresa de pruebas y activar
esos módulos. Revisar `core/modules/moduleRegistry.js` para dependencias.

## E.3 Permisos (RBAC) — `core/permissions/permissions.js`

Existen y están bien: `whatsapp_connections:read`, `whatsapp_sessions:{create,view_qr,reconnect,
disconnect,delete_auth,diagnostics,manage_companies}`, `whatsapp_messages:send`,
`conversations:{send,send_team,send_assigned}`, `messages:send_commercial|send_transactional`,
`consent:override`.
**Puntos a validar:**
- El **actor** que ejecuta workflows (`WorkflowService.actorFor`) es un usuario interno
  `ADMIN`/creador. Para D.1, ese actor necesita `whatsapp_messages:send` y
  `messages:send_commercial`/`send_transactional` (la política los exige en
  `CommunicationPolicyService`). **Asegurar** que el actor por defecto (ADMIN) los tenga, o
  bien saltar esa comprobación para envíos de sistema (documentar la decisión).
- El rol CALLCENTER tiene `conversations:send_assigned` + `whatsapp_messages:send` (ok para el chat).

## E.4 Cableado y arranque (verificado)

- `server.js`: `startJobWorker()`, `warnWhatsAppQrConfig()`, `restoreSessions()`, shutdown limpio. ✅
- `app.js`: rutas montadas (`/api/whatsapp-sessions`, `/api/webhooks/whatsapp/:channelConfigId`,
  `/api/conversations`, `/api/message-templates`, `/api/workflows`, …), `rawBody` para
  `/api/webhooks/*` (firma), CORS, helmet. ✅
- `recordActivity` → `WorkflowEventEmitter.emitFromActivity` (bridge actividad→evento→workflow). ✅
- **Riesgo:** si `JOB_WORKER_ENABLED=false` o el worker no corre, los webhooks se **encolan pero
  nunca se procesan** (mensajes entrantes/salientes quedan colgados). Verificar en el deploy.

## E.5 Configuración funcional (pasos de usuario, una vez desplegado)

**Para WhatsApp Cloud (Meta):**
1. Crear un `ChannelConfig` canal `whatsapp_cloud` con `phoneNumberId`, `externalBusinessId`
   (WABA), `accessToken` (se cifra), `verifyToken`, `appSecret` (webhookSecret).
2. En Meta App → Webhooks → suscribir el WABA a la URL
   `https://<host>/api/webhooks/whatsapp/<channelConfigId>` con el `verifyToken`.
3. Suscribir los campos: `messages`, `message_template_status_update`, `phone_number_quality_update`.
4. Marcar el número como `isDefault` (o `setDefaultAccount`).
5. `testConnection` (ruta de channel-config) para validar credenciales.

**Para WhatsApp QR (Baileys):**
1. `WHATSAPP_QR_ENABLED=true` + `CREDENTIALS_ENCRYPTION_KEY` definida.
2. Crear sesión (`POST /api/whatsapp-sessions`), pedir QR (`GET /:id/qr`), escanear desde el
   teléfono (WhatsApp → Dispositivos vinculados).
3. Verificar `status: connected` en `WhatsAppNumbersPage`/`WhatsAppQrSessionsPanel`.
4. Requiere **proceso siempre activo** y (idealmente) **una sola instancia** por sesión (el lease lo
   protege). En hosting con FS efímero está OK porque el authState va cifrado a Mongo.

**Para plantillas:** crear plantilla → (con D.3) registrar en Meta → esperar `approved` (webhook) →
usar en chat/workflows.

**Para automatizaciones (tras D.1):** crear workflow con trigger + acción `whatsapp.send` /
`whatsapp.send_template`; comprobar `WorkflowRun` en `/api/workflow-runs` y el `Message` outbound.

## E.6 Checklist operativo de humo (end-to-end)

1. [ ] `GET /api/health` responde `ok`.
2. [ ] Worker de jobs vivo (log `server.started` + jobs procesándose).
3. [ ] Módulos `whatsapp/inbox/conversations/workflows` activos en la empresa de prueba.
4. [ ] **Cloud:** webhook verificado (GET 200 con challenge) + mensaje entrante crea `Contact` +
   `Conversation` + `Message`.
5. [ ] **Cloud:** responder desde el chat → `Message` outbound `sent` → ack `delivered/read`.
6. [ ] **QR:** sesión `connected`; entrante y saliente funcionan; `fromMe` se ingiere.
7. [ ] Plantilla `approved` enviable desde el chat.
8. [ ] **(D.1)** Workflow `contact.created → whatsapp.send` entrega el mensaje.
9. [ ] Opt-out (`STOP`/consent) bloquea el envío con `reasonCode`.
10. [ ] Fuera de 24h sin plantilla → bloqueado; con plantilla → enviado.

---

# PARTE F — Orden recomendado de ejecución

1. **E.1–E.5 (config/arranque)** — sin esto no se puede ni probar. (horas)
2. **D.1 (workflows envían WhatsApp/plantilla)** — el corazón de "automatizaciones". (1–2 días)
3. **D.3 (plantillas con media header)** — desbloquea plantillas ricas. (medio día)
4. **D.2 (keyword + wait_reply + sí/no)** — bot básico y confirmaciones. (1–2 días)
5. **D.6 (recordatorios de cita por WhatsApp)** — alto valor, corto. (medio día)
6. **D.4 (campañas/goteo)** — difusión. (2–3 días)
7. **D.7 (CAPI, CTWA, editor grafo)** — extras. (según prioridad de negocio)

---

## Apéndice — Mapa de archivos de referencia (clínica → nuestro)

| Función | proyecto_clinica | Nuestro equivalente |
|---|---|---|
| QR runtime | `utils/whatsappQrManager.js` | `modules/conversations/WhatsAppQrSessionManager.js` |
| Auth QR | `.wwebjs_auth/` (disco) | `modules/conversations/WhatsAppQrAuthStore.js` (Mongo cifrado) |
| Cloud API | `utils/whatsappCloud.js` | `modules/conversations/adapters/WhatsAppCloudAdapter.js` |
| Gateway | `utils/whatsappGateway.js` | `modules/communications/accountGateway.js` |
| Pipeline envío | `utils/messaging.js` | `modules/conversations/ConversationService.js` |
| Política/opt-out/24h | (dentro de `messaging.js`) | `modules/communications/CommunicationPolicyService.js` + `communicationPolicyRules.js` |
| Webhook Cloud | `controllers/chatController.js` | `routes/webhookRoutes.js` + `WhatsAppWebhookService.js` |
| Ingesta común | `chatController.ingestExternalMessage` | `WhatsAppInboundService.processNormalized` |
| Plantillas | `controllers/messageTemplateController.js` | `modules/communications/TemplateSyncService.js` |
| Modelo plantilla | `models/MessageTemplate.js` | `models/MessageTemplate.js` |
| Workflows | `utils/workflowEngine.js` + `models/Workflow.js` | `modules/workflows/WorkflowService.js` + `WorkflowActionExecutor.js` + `models/Workflow.js` |
| Bus de eventos | `utils/events.js` | `modules/workflows/WorkflowEventEmitter.js` + `utils/activity.js` |
| Cola de jobs | `setInterval` en `index.js` | `modules/jobs/JobService.js` + `JobWorker.js` + `jobHandlers.js` |
| Cifrado secretos | `utils/secretCrypto.js` | `utils/credentialCrypto.js` |
| Firma webhook | `utils/metaWebhook.js` | `WhatsAppCloudAdapter.verifySignature` |
| Conversación/Mensaje | `models/Conversation.js` / `models/Message.js` | `models/Conversation.js` / `models/Message.js` |
| UI chat | (client clínica) | `client/src/pages/inbox/InboxPage.jsx` |
| UI plantillas | (client clínica) | `client/src/pages/inbox/MessageTemplatesPage.jsx` |
| UI workflows | editor react-flow | `client/src/pages/workflows/WorkflowsPage.jsx` |
| UI números/QR | (client clínica) | `WhatsAppNumbersPage.jsx` + `WhatsAppQrSessionsPanel.jsx` |
