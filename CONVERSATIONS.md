# Conversaciones Fase 5

## Modelo omnicanal

`Conversation` representa el hilo entre una empresa y un contacto, sin acoplar
el dominio al proveedor. Contiene canal, configuracion externa, asignacion,
estado, prioridad, no leidos y fechas del ultimo mensaje inbound/outbound.

`Message` pertenece a una conversacion y contacto. Sus direcciones son
`inbound`, `outbound` e `internal`; una nota interna nunca se envia al
proveedor. `providerPayload` usa `select: false`.

`MessageTemplate` almacena respuestas rapidas y metadatos preparados para
templates de WhatsApp. `ChannelConfig` mantiene la configuracion por empresa y
devuelve solo indicadores booleanos sobre secretos configurados.

## Servicio y adaptadores

`ConversationService` centraliza busqueda/creacion, mensajes, notas,
asignacion, estados, lectura, enlace con contactos y `ActivityLog`.

Los adaptadores implementan el contrato:

- `sendMessage`
- `handleWebhook`
- `verifyWebhook`
- `normalizeInboundMessage`
- `normalizeStatusUpdate`

`InternalAdapter` persiste envios internos. `WhatsAppCloudAdapter` construye
peticiones reales solo con canal conectado, telefono, token, Phone Number ID y
version de Graph API. Los adaptadores de Facebook, Instagram, email y SMS son
placeholders y devuelven fallo claro.

Para agregar un canal:

1. Crear el adaptador y normalizadores.
2. Registrarlo en `adapters/index.js`.
3. Agregar su tipo a los enums compatibles.
4. Resolver siempre el tenant mediante `ChannelConfig`.
5. Proteger configuracion con permiso y modulo.
6. Agregar pruebas de envio fallido, idempotencia y aislamiento tenant.

## API y permisos

`/api/conversations` ofrece filtros por estado, canal, responsable, contacto,
no leidos, prioridad, texto y fechas. Los mensajes viven en
`/api/conversations/:id/messages`; las notas internas en
`/api/conversations/:id/internal-note`.

ADMIN ve la empresa. SUPERVISOR ve su equipo. CALLCENTER solo ve y responde
conversaciones asignadas. Ninguna ruta acepta `companyId` o `distributorId`
del frontend.

## Frontend

`/inbox` incluye lista, filtros, mensajes, estados de entrega, composer,
plantillas, notas internas, asignacion, cierre, reapertura, archivado y
refresh. `/inbox/channels` y `/inbox/templates` son exclusivas de ADMIN.
Los dashboards consumen metricas con el mismo scope del inbox.

El inbox usa SSE autenticado mediante `fetch`, muestra estado de conexion,
mensajes pending/sent/delivered/read/failed, retry y adjuntos. La media local
se obtiene con `fetch` autenticado y un object URL temporal; nunca se incrusta
un `storageKey` en el DOM. Si SSE falla conserva refresh manual. Las metricas
incluyen canal, primera respuesta, mensajes fallidos, inbound/outbound de hoy
y datos por agente.

## Limites

No hay routing por horarios, skills ni condiciones avanzadas. Round-robin es
basico. La media local funciona para inbox/internal; para enviarla a WhatsApp
real hace falta una URL publica o una futura subida del binario a Graph API.
No hay antivirus ni inspeccion profunda por magic bytes. Los conectores
placeholder no realizan llamadas externas.

## Workflows

Conversaciones y mensajes inbound/fallidos emiten eventos desde el servicio de
dominio. Las acciones permiten asignar, cerrar y crear una nota interna. No
existe accion de envio real: WhatsApp, email, SMS y webhook externo se
mantienen planned.
