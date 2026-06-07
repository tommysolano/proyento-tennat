# WhatsApp Cloud API

## Estado de la integracion

La Fase 5 agrega cifrado, firma HMAC, cola durable, reintentos y media a la
integracion preparada en Fase 4. El seed crea un canal `pending` sin
credenciales y nunca simula un envio exitoso.

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

## Flujo inbound

1. Express conserva el raw body.
2. Se carga `ChannelConfig` y se valida `x-hub-signature-256`.
3. El POST crea un `Job` durable y responde HTTP 200.
4. El worker normaliza mensajes y estados.
5. `WebhookEvent` reserva el evento con indice unico.
6. Se busca o crea contacto y conversacion dentro de la empresa.
7. Se aplica routing, se crea `Message` y se emiten SSE/notificaciones.

Para mensajes se usa `message.id`. Para estados se usa
`status.id + status + timestamp`. Sin ID se usa SHA-256 del payload.

## Seguridad

`accessToken`, `appSecret`, `verifyToken` y secretos legados se cifran con
AES-256-GCM. No se seleccionan por defecto ni se devuelven. `providerPayload`
tampoco se devuelve. Logs, errores, jobs ops y ActivityLog pasan por redaccion.

En produccion use un secret manager, rote tokens, fije una version soportada
de Graph API y active `REQUIRE_WEBHOOK_SIGNATURE=true`.

## Limites

No se aprovisionan cuentas, numeros, permisos ni templates. La media inbound
consulta metadata real, pero no descarga binarios porque no existe S3/R2/local
configurado. La UI la muestra `pending`. Quedan pendientes antivirus,
expiracion de URLs y limites por plan. Facebook Messenger, Instagram, email y
SMS siguen sin integracion real.
