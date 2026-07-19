# Arquitectura

## Capas de tenancy

La plataforma usa tres niveles:

1. Plataforma: gobernada por `SUPERADMIN`.
2. Distribuidor: identificado por `distributorId`.
3. Empresa: identificada por `companyId` y perteneciente a un distribuidor.

Los filtros tenant se construyen en backend a partir del usuario autenticado.
El frontend nunca decide el tenant efectivo.

## Roles

- `SUPERADMIN`: distribuidores, planes internos, suscripciones, billing,
  modulos, auditoria e impersonacion.
- `DISTRIBUTOR`: empresas, planes y suscripciones comerciales, facturas,
  pagos, configuracion comercial, branding y lectura de su billing de
  plataforma.
- `ADMIN`: usuarios, contactos, onboarding y lectura del billing de su empresa.
- `SUPERVISOR`: agentes y contactos de su equipo.
- `CALLCENTER`: contactos asignados.

En Fase 3, `crmScope.js` centraliza el alcance de contactos, oportunidades y
tareas. ADMIN usa `companyId`; SUPERVISOR usa sus agentes y a si mismo;
CALLCENTER usa `assignedTo = user._id`. Un query param nunca sustituye ese
filtro base.

## Core y modulos

El core contiene autenticacion, usuarios, tenants, permisos, auditoria,
entitlements y configuracion. `ModuleRegistry` describe capacidades
instalables. `ModuleEntitlement` aplica overrides por plan, distribuidor,
empresa o suscripcion.

`requireModule(moduleKey)` resuelve en este orden:

1. Override del distribuidor.
2. Override de la suscripcion de plataforma.
3. Override del plan de plataforma.
4. `includedModules` del plan.
5. `enabledByDefault` del registro.

`SUPERADMIN` omite esta validacion para poder recuperar configuraciones.

## Modelos comerciales

- `Plan` (`DistributorPlan` conceptualmente) y `Subscription`
  (`CompanySubscription` conceptualmente): distribuidor cobra a empresa.
- `PlatformPlan` y `PlatformSubscription`: plataforma cobra a distribuidor.
- `Invoice`: funciona en ambos sentidos mediante `issuerType`, `issuerId`,
  `customerType`, `customerId` y `subscriptionType`.
- `Payment`: pago manual, vinculado opcionalmente a factura.
- `UsageRecord`: consumo historico por distribuidor o empresa.

La numeracion de facturas es unica por emisor. Para distribuidores se obtiene
de `billingSettings.invoicePrefix` e `invoiceNextNumber`, incrementado
atomicamente en MongoDB.

## Aislamiento y estado

- Los IDs de distribuidor efectivos siempre salen del JWT autenticado.
- Una empresa, plan, suscripcion, factura o pago se valida contra ese tenant.
- `ADMIN` solo consulta documentos cuyo `customerId` o `payerId` es su
  `companyId`.
- Una empresa `suspended`, `cancelled` o legada `inactive` bloquea a
  `ADMIN`, `SUPERVISOR` y `CALLCENTER` en backend.
- `SUPERADMIN` y `DISTRIBUTOR` conservan acceso a sus paneles de gestion.
- El cierre de una impersonacion queda disponible aun si la empresa se
  suspende durante la sesion.

## Configuracion y marca

- `GlobalSettings`: moneda, impuestos, soporte y numeracion global.
- `Distributor.branding`: logo, colores, nombre y soporte.
- `Distributor.customDomain`: dominio, estado, token y verificacion futura.
- `Distributor.settings` y `billingSettings`: locale, timezone, moneda,
  impuestos, prefijo, numeracion y condiciones comerciales.
- `Company.settings`: timezone, locale, modulos e informacion comercial.

El contexto de sesion devuelve marca y configuracion tenant segura. El
frontend aplica nombre, logo y variables CSS con fallbacks. No existe
provisionamiento real de dominios.

## Onboarding

`Distributor.onboarding` y `Company.onboarding` almacenan pasos booleanos. Los
helpers recalculan los pasos derivados despues de crear planes, empresas,
usuarios, suscripciones, contactos o asignaciones. El paso de perfil de
empresa tambien puede marcarse desde el panel `ADMIN`.

## Impersonacion

La jerarquia es estricta y solo se desciende:
`SUPERADMIN > DISTRIBUTOR > ADMIN > SUPERVISOR > CALLCENTER`.

- `SUPERADMIN`: cualquier usuario activo de cualquier rol inferior y tenant.
- `DISTRIBUTOR`: `ADMIN`, `SUPERVISOR` y `CALLCENTER` de empresas de su cartera.
- `ADMIN`: `SUPERVISOR` y `CALLCENTER` de su propia empresa.
- `SUPERVISOR` y `CALLCENTER`: nunca pueden impersonar.

Nunca se puede asumir un rol igual o superior al del actor raiz, ni a uno
mismo, ni a un usuario inactivo.

`server/src/core/permissions/impersonationScope.js` centraliza las reglas.
`POST /api/auth/impersonate` y el `authMiddleware` usan la misma funcion
`evaluateImpersonation`, de modo que el alcance se revalida en cada request.

### Un solo nivel real, objetivo intercambiable

Desde una sesion impersonada no se anida: se cambia de objetivo. El token
nuevo conserva el mismo `impersonatedBy` raiz, asi que siempre existe una
unica relacion `actor raiz -> objetivo actual` y terminar la impersonacion
devuelve al actor original aunque se hayan encadenado varios saltos
(ej. `SUPERADMIN -> ADMIN -> CALLCENTER`).

El permiso de cada salto se evalua contra el rol y el tenant del **actor
raiz**, nunca contra el usuario impersonado en curso. Un `DISTRIBUTOR` que
entra como `ADMIN` no gana acceso a empresas de otro distribuidor.

### Contratos

- `POST /api/auth/impersonate` acepta `targetUserId` (forma directa) y
  mantiene `distributorId` y `companyId` por compatibilidad, que resuelven al
  `DISTRIBUTOR` de la cartera y al `ADMIN` de la empresa respectivamente.
- `GET /api/auth/impersonation/targets` lista los candidatos del actor raiz
  con filtros por `search`, `role`, `companyId` y `distributorId`.
- `POST /api/auth/impersonation/end` cierra la sesion y devuelve el actor raiz.

El JWT impersonado expira en 30 minutos e incluye el actor original. El
frontend conserva la sesion raiz en `tenantdesk_original_session` y no la
sobrescribe al cambiar de objetivo. Cada cambio de objetivo y el cierre quedan
en `ActivityLog` con el actor raiz en `metadata`.

## Fundacion de UI

`client/src/components` contiene las primitivas compartidas. Las relevantes
para el layout:

- `PageShell`: cabecera, pestanas y ancho. `width` acepta `default`
  (`max-w-screen-2xl`), `full` (sin tope, para inbox, kanban y tablas anchas)
  y `narrow` (`max-w-4xl`, para configuracion). `Layout` ya no impone un
  contenedor fijo: solo aporta el padding lateral fluido.
- `PageTabs` (`Tabs.jsx`): sub-navegacion enlazada a rutas reales con
  `NavLink`, scrollable en horizontal en movil.
- `Drawer`: panel lateral (`md` 480px, `lg` 640px) con header y footer fijos.
  Es el patron por defecto para formularios largos, en lugar de modales
  estrechos. Cierra con overlay y Escape.
- `Table`: sin `whitespace-nowrap` global. Cada columna acepta `nowrap`,
  `truncate`, `width`, `align` y `hideBelow` (`sm`/`md`/`lg`) para ocultar
  columnas secundarias en pantallas pequenas. `density="compact"` reduce el
  alto de fila. El wrapper `overflow-x-auto` se mantiene como red de
  seguridad. La API previa (`columns`, `data`, `emptyText`) no cambia.
- `FormGrid` / `FormGridFull`: seccion de formulario con grid de 1 o 2
  columnas como maximo, para que los campos no se compriman.
- `EmptyState` y `Skeleton`: estados vacios y de carga. `LoadingState` acepta
  `variant="table"` o `variant="page"` para dibujar skeletons con la forma del
  contenido.

### Paneles por subrutas

Los paneles de SUPERADMIN y DISTRIBUTOR estan divididos en subrutas con
`PageTabs` en vez de una pagina larga con anclas. Cada seccion vive en
`pages/<rol>/sections/` y los datos se cargan con un hook por familia de
rutas (`useDistributorWorkspace`, `useSuperAdminWorkspace`), que recibe la
lista de datasets que la ruta necesita para no sobre-consultar la API.

`routes/HashRedirect.jsx` mantiene compatibilidad con los enlaces antiguos
basados en hash.

## Dominio CRM

`Contact` mantiene compatibilidad con Fases 1 y 2. `Tag`, `CustomField`,
`Segment`, `Pipeline`, `PipelineStage`, `Opportunity`, `Task` y `Note`
pertenecen siempre a una empresa. Los timelines combinan actividad, notas,
tareas y oportunidades relacionadas.

Las rutas CRM aplican permisos, `requireModule('crm')` y el modulo especifico.
La UI vive bajo `/crm`; Kanban mueve etapas mediante selector y la importacion
MVP recibe JSON o CSV pegado.

## Dominio de conversaciones

`Conversation` es el agregado omnicanal por contacto. `Message` registra
entradas, salidas y notas internas; `MessageTemplate` contiene respuestas por
empresa; `ChannelConfig` resuelve credenciales y ajustes del proveedor; y
`WebhookEvent` garantiza idempotencia por proveedor, configuracion y evento.

La logica compartida vive en `ConversationService`. Las rutas autenticadas y
los webhooks usan el mismo servicio para actualizar ultimo mensaje, no leidos,
asignacion, estado y actividad. Los adaptadores bajo
`server/src/modules/conversations/adapters` aislan el transporte del dominio.

El scope se calcula siempre en backend:

1. ADMIN: toda su empresa.
2. SUPERVISOR: si mismo y agentes cuyo `supervisorId` apunta al supervisor.
3. CALLCENTER: conversaciones con `assignedTo` igual al usuario.
4. Webhook: empresa y distribuidor salen exclusivamente de `ChannelConfig`.

Los payloads del proveedor se guardan con `select: false`. Las credenciales y
tokens del canal tampoco se seleccionan por defecto y las respuestas usan una
representacion redactada.

## Endurecimiento Fase 5

`ChannelConfig` guarda secretos como envelopes AES-256-GCM con IV y auth tag
por valor. El descifrado solo se realiza en adaptadores o validacion del
webhook. Los documentos legados en texto plano se cifran al siguiente `save`.

El POST de WhatsApp valida `x-hub-signature-256` sobre `req.rawBody`. Express
captura los bytes mediante el callback `verify` de `express.json` solo para
`/api/webhooks/whatsapp/*`.

`Job` implementa la cola MongoDB durable. El worker usa claim atomico, lock,
recuperacion de locks vencidos, backoff y estado `dead`. `RealtimeService`
mantiene SSE autenticado; `Notification` persiste avisos por usuario y
`RoutingRule` aplica `unassigned`, `contact_owner` o `round_robin`.

La cola MongoDB es apropiada para una beta controlada. Alta escala debe migrar
el transporte a Redis/BullMQ sin cambiar los handlers de dominio.

## Operacion Fase 6

`StorageProvider` separa el dominio de media del backend fisico.
`LocalStorageProvider` escribe fuera del arbol publico, usa claves UUID por
tenant y sirve binarios solo despues de validar JWT, permisos, modulo y scope
de conversacion. S3, R2 y DigitalOcean Spaces conservan el mismo contrato como
placeholders explicitos.

El inbound de WhatsApp crea `media.whatsapp.download`; el worker consulta
metadata y descarga con el token cifrado del canal, valida tipo/tamano,
almacena y actualiza `Message.media`. `storageKey` y IDs internos del proveedor
se eliminan del JSON publico.

`OperationalAlert` centraliza fallos de jobs, firmas, credenciales, canales y
limites. `GET /api/ops/*` nunca expone payloads de jobs. El replay clona el
trabajo fallido, conserva `replayedFrom` y aplica scope global o de empresa.

Los limites comerciales usan `UsageRecord` mensual y los campos de `Plan`.
Las comprobaciones se realizan en backend antes de conversaciones, mensajes y
media; el frontend solo presenta el resultado.

## Calendario y reservas Fase 7

`server/src/modules/calendar` concentra conversion de zonas IANA,
disponibilidad, buffers, solapamientos, estados y recordatorios. Los modelos
`Calendar`, `AvailabilityRule`, `AvailabilityException`, `Appointment` y
`BookingLink` permanecen separados para conservar historial y permitir reglas
por usuario.

Las rutas privadas combinan rol, permiso, `calendar`/`bookings` y filtros de
empresa/equipo/asignacion. La API publica deriva el tenant del slug persistido,
aplica rate limit y vuelve a validar el slot al crear. Fechas se almacenan en
UTC; la zona IANA se conserva para presentar y reconstruir horas locales.

Las citas reutilizan Contact, Opportunity, ActivityLog, Notification, Job y
RealtimeService. No hay dependencia con calendarios o videollamadas externas.

## Automatizaciones Fase 8

`WorkflowEventEmitter` convierte actividad y eventos terminales en
`WorkflowEvent`. `WorkflowService` busca definiciones activas del mismo
tenant, aplica idempotencia, cooldown, run-once y profundidad, crea
`WorkflowRun` y encola `workflow.run`.

`WorkflowActionExecutor` solo modifica modelos internos con filtro tenant. Los
delays guardan un cursor y usan `Job.runAt`. El payload durable esta
sanitizado, oculto por defecto y excluido del JSON. Las acciones externas
estan registradas como planned, no implementadas.

## Marketing publico Fase 9

`Form`, `LandingPage` y `Funnel` son agregados de empresa. `FormSubmission`,
`FunnelStep`, `PageView` y `ConversionEvent` conservan tenant, origen y
relaciones CRM. Los slugs de formularios, landings y funnels son globales; el
slug de step es unico dentro del funnel.

Las rutas publicas resuelven el tenant exclusivamente desde el slug
persistido, validan empresa, modulo y estado publicado. No aceptan
`companyId` ni `distributorId`. `marketingSecurity.js` limita keys, HTML,
URLs, payloads, user agent e IP hasheada. Los formularios agregan rate limit,
honeypot, token firmado y tiempo minimo.

`FormsService` valida respuestas y mappings, crea o actualiza contactos,
aplica tags y puede crear oportunidades. `FunnelService` valida referencias
del mismo tenant, renderiza payloads publicos, registra vistas y conversiones.
Ambos reutilizan ActivityLog, Notification, UsageRecord y WorkflowEvent.

## Reputacion y fidelizacion Fase 10

`ReviewRequest`, `Review`, `Testimonial`, `ReviewWidget`,
`SatisfactionSurvey`, `SurveyResponse`, `Coupon`, `CouponRedemption`,
`ReferralProgram` y `Referral` son agregados multi-tenant. Los servicios
`ReputationService` y `LoyaltyService` concentran transiciones, auditoria,
notificaciones, workflow events y medidores.

Los recursos publicos resuelven tenant exclusivamente desde token, slug y
codigo. Las IP se hashean; los payloads se sanitizan y nunca aceptan
`companyId` o `distributorId`.
