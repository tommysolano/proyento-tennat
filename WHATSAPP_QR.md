# WhatsApp mediante QR

## Alcance

Esta implementacion agrega `whatsapp_qr` sin reemplazar `whatsapp_cloud`.
Ambos proveedores usan `ChannelConfig`, los servicios de `Conversation` y
`Message`, la politica central de comunicacion, el almacenamiento de media y
los eventos SSE existentes.

La libreria de transporte es `@whiskeysockets/baileys@6.7.23`. No instala ni
ejecuta Chromium. Esta fijada en la rama estable compatible con Node.js 20+ y
encapsulada por `WhatsAppQrAdapter` y `WhatsAppQrSessionManager`.

## Persistencia y aislamiento

- Cada `WhatsAppSession` pertenece a una empresa y a un `ChannelConfig`.
- El estado de autenticacion se serializa con `BufferJSON`, se cifra con
  AES-256-GCM y se guarda en MongoDB Atlas.
- No se guardan carpetas de autenticacion en el disco local.
- El contenido del QR solo vive en memoria. MongoDB conserva unicamente las
  fechas de generacion y expiracion.
- Un lease atomico en MongoDB impide que dos procesos sean propietarios de la
  misma sesion al mismo tiempo.
- Conversaciones y mensajes conservan `provider` y `channelConfigId`. La
  deduplicacion incluye empresa, proveedor, integracion e ID externo.

## Activacion

El proveedor queda desactivado por defecto:

```env
WHATSAPP_QR_ENABLED=false
```

Antes de cambiarlo a `true`:

1. Configure `CREDENTIALS_ENCRYPTION_KEY` con al menos 32 caracteres.
2. Use MongoDB Atlas con respaldos y acceso de red restringido.
3. Verifique que el servicio use Node.js 20 o superior.
4. Configure almacenamiento externo privado para media.
5. Inicie con una sola instancia del servicio que ejecuta sockets QR y jobs.
6. Pruebe conexion, reinicio, reconexion, logout y recepcion de media.

Variables:

```env
WHATSAPP_QR_AUTO_RESTORE=true
WHATSAPP_QR_MAX_SESSIONS_PER_COMPANY=5
WHATSAPP_QR_MAX_ACTIVE_SESSIONS=20
WHATSAPP_QR_RESTORE_LIMIT=10
WHATSAPP_QR_QR_TTL_SECONDS=60
WHATSAPP_QR_SESSION_LEASE_SECONDS=90
WHATSAPP_QR_MAX_RECONNECT_ATTEMPTS=5
WHATSAPP_QR_RECONNECT_BASE_MS=2000
WHATSAPP_QR_RECONNECT_MAX_MS=60000
WHATSAPP_QR_ALLOW_GROUPS=false
```

## Limitaciones de Render

La autenticacion no depende del disco efimero y puede restaurarse desde Atlas.
Eso no garantiza por si solo continuidad operacional:

- Un socket WebSocket vive en memoria de un proceso concreto.
- El broker SSE actual tambien es local al proceso.
- Con varias instancias, un job outbound puede ser tomado por una instancia que
  no posee el socket. No existe afinidad distribuida.
- Para escalar horizontalmente se necesita un worker de sesiones dedicado o
  routing distribuido que asigne cada sesion y sus jobs al mismo proceso.
- Los providers S3/R2/Spaces del repositorio siguen siendo placeholders. No se
  debe habilitar media QR en produccion hasta implementar y probar uno.

Por estas razones `render.yaml` conserva `WHATSAPP_QR_ENABLED=false`. La
activacion es una decision operativa explicita, no una promesa de alta
disponibilidad.

## Seguridad y cumplimiento

- CALLCENTER puede enviar desde conversaciones asignadas, pero no administra
  sesiones ni ve QR.
- Crear, ver QR, reconectar, desconectar, borrar autenticacion y consultar
  diagnostico tienen permisos separados.
- Desconectar, borrar autenticacion y deshabilitar exigen confirmar el nombre
  exacto de la sesion y generan auditoria.
- Los envios pasan por `CommunicationPolicyService` al crearse y nuevamente al
  procesarse.
- Los mensajes inbound aplican el opt-out exacto existente; una respuesta no se
  convierte en consentimiento comercial.
- Archivos inbound validan tamano y MIME. Grupos estan desactivados por defecto.
- QR, cookies, autenticacion y payloads del proveedor no se escriben en logs ni
  se devuelven al frontend.

## Riesgo del metodo QR

Baileys implementa el protocolo de WhatsApp Web y no es una API oficial de
Meta. Puede cambiar sin aviso, requerir una nueva vinculacion o quedar
temporalmente incompatible. No ofrece el SLA, soporte ni garantias de WhatsApp
Cloud API. La empresa debe evaluar terminos de uso, cumplimiento y riesgo de
bloqueo antes de habilitarlo.

## Prueba recomendada

1. Desplegar backend con QR desactivado y validar health, jobs y Cloud API.
2. Implementar almacenamiento externo privado y probar descarga autenticada.
3. Habilitar QR en una instancia de staging.
4. Crear una sesion desde `Inbox > Canales`, iniciar conexion y escanear el QR.
5. Reiniciar la instancia y comprobar restauracion desde Atlas.
6. Enviar y recibir texto y cada MIME permitido.
7. Probar DND, opt-out, consentimiento y horario silencioso.
8. Desconectar conservando autenticacion y luego cerrar borrando autenticacion.
9. Confirmar que otra empresa no puede consultar el ID de la sesion.
10. Repetir en produccion solo con alertas y limites conservadores.

## Numero conectado y gestion multi-numero

Al vincular por QR, Baileys reporta el numero real y se guarda en el
`ChannelConfig` asociado como `connectedPhone` (ademas de `phoneNumberId`). Ese
numero es el que muestra la UI unificada **Inbox -> Numeros de WhatsApp**, donde
las conexiones QR conviven con las Cloud API: se puede marcar una conexion QR
como numero por defecto de la empresa, habilitarla/deshabilitarla y editar su
etiqueta. El flujo de escaneo/reconexion sigue viviendo en el panel de
vinculacion por QR embebido en esa pagina; la salud (semaforo GREEN/YELLOW/RED)
solo aplica a las conexiones Cloud API. La resolucion de "por que numero se
responde" (incluida la caida al numero por defecto si una conexion QR queda
deshabilitada) la centraliza `accountGateway` — ver
[WHATSAPP.md](WHATSAPP.md#gestion-multi-numero).

## Operacion QR endurecida

### Requisitos de `.env`

El proveedor QR esta desactivado por defecto. Para usarlo:

```env
WHATSAPP_QR_ENABLED=true
CREDENTIALS_ENCRYPTION_KEY=<32+ caracteres>
```

Sin `WHATSAPP_QR_ENABLED=true`, "Iniciar conexion" devuelve el reasonCode
`WHATSAPP_QR_DISABLED`. Si el QR esta activado pero falta
`CREDENTIALS_ENCRYPTION_KEY`, el arranque loggea un warning
(`whatsapp_qr.config_invalid`) y `GET /health` lo expone en `whatsappQr`
(`enabled`, `credentialsKeyConfigured`, `ready`, `warning`).

### Errores operativos nunca enmascarados

El error handler de `app.js` enmascara los 5xx genericos en produccion, pero
**conserva** el mensaje de los errores con un reasonCode operativo conocido
(`server/src/core/operationalErrors.js`): `WHATSAPP_QR_DISABLED`,
`WHATSAPP_QR_SESSION_BUSY`, `WHATSAPP_QR_SESSION_LIMIT`, `MEDIA_TOO_LARGE`, etc.
El reasonCode viaja siempre en la respuesta; la UI del panel QR lo mapea a un
mensaje accionable (`whatsappQrErrors.js`), con detalle de `.env` solo para
SUPERADMIN.

### Numero QR y sesion: 1:1

Crear un numero QR (desde "Numeros de WhatsApp" o desde el panel) crea
**atomicamente** un `ChannelConfig` (`whatsapp_qr`) y su `WhatsAppSession`
vinculada; si algo falla, se revierte el `ChannelConfig`. Al listar sesiones,
`reconcileCompanyQr` autocura de forma idempotente: un `ChannelConfig` QR sin
sesion recibe una (disconnected), y una sesion cuyo `ChannelConfig` desaparecio
se marca huerfana (no se borra).

### Estados y desconexiones

`initializing -> qr_pending -> authenticating -> connected`, o `error` /
`logged_out`. El manejo del cierre distingue por el `statusCode` de Baileys:

- **loggedOut (401)**: cierre definitivo desde el telefono. Se **borra** el
  authState cifrado (`deleteMongoAuthState`), estado `logged_out` y se exige un
  QR nuevo (si no, la reconexion entraria en bucle con credenciales invalidas).
- **connectionReplaced (440)**: la sesion se abrio en otro dispositivo. Estado
  `error` con mensaje claro; no se reconecta en bucle.
- **resto**: reconexion con backoff exponencial y contador de intentos.

Al reiniciar el server, `restoreSessions` (con `WHATSAPP_QR_AUTO_RESTORE`)
restaura las sesiones con authState guardado sin pedir QR (Mongo se conecta
antes de restaurar).

### Limite conocido

Los mensajes `fromMe` (enviados desde el telefono vinculado) aun se descartan en
el inbound normalizer y no aparecen como salientes en la conversacion. El indice
unico de deduplicacion (`companyId + provider + channelConfigId +
externalMessageId`) ya permitiria ingerirlos sin duplicar los enviados desde la
app; queda pendiente cablear esa ingesta. No se simula: hoy simplemente no se
reflejan.

### Checklist manual con chip real (priorizado)

1. `.env` con `WHATSAPP_QR_ENABLED=true` + clave valida; `GET /health` muestra
   `whatsappQr.ready=true`.
2. Crear numero QR -> se crea sesion vinculada; "Iniciar conexion" muestra el QR
   (no "Error interno del servidor").
3. Escanear -> `authenticating -> connected`; el telefono real aparece en
   `connectedPhone`/tabla.
4. Enviar y recibir texto; verificar dedupe reenviando el mismo mensaje.
5. Imagen entrante se descarga y se ve; imagen saliente por URL entrega.
6. Cerrar sesion desde el telefono -> estado `logged_out`, pide QR nuevo (auth
   borrado).
7. Abrir la sesion en otro dispositivo -> estado `error` "abierta en otro
   dispositivo".
8. Matar y levantar el server con una sesion vinculada -> se restaura sin QR.

## Indices al actualizar una base existente

`Message` ahora deduplica por empresa, proveedor, `channelConfigId` e ID
externo. Despues de crear y verificar el indice nuevo, revise si Atlas conserva
el indice legado `companyId_1_provider_1_externalMessageId_1`. Ese indice es
mas restrictivo y puede impedir IDs iguales en dos conexiones del mismo
proveedor. Eliminelo de forma controlada solo despues de backup y verificacion
del indice nuevo; no automatice esa operacion durante el arranque.
