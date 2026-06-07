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

Se permite un solo nivel:

- `SUPERADMIN` a `DISTRIBUTOR`.
- `DISTRIBUTOR` a `ADMIN` de una empresa propia.

El JWT impersonado incluye el actor original. El frontend conserva la sesion
original, muestra un indicador persistente y llama al endpoint de cierre antes
de restaurarla. Inicio y fin quedan en `ActivityLog`.

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
