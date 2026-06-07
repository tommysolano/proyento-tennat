# Seguridad WhatsApp

## Cifrado

Cada secreto de `ChannelConfig` se cifra con AES-256-GCM. El envelope guarda
version, algoritmo, IV, auth tag y ciphertext. La clave se deriva con SHA-256
desde `CREDENTIALS_ENCRYPTION_KEY`; no se guarda en MongoDB ni en el codigo.

En `production` la variable es obligatoria y debe tener al menos 32
caracteres. Perderla impide descifrar credenciales existentes. Una rotacion
requiere descifrar con la clave anterior y volver a guardar con la nueva.

## Firma y raw body

Meta envia `x-hub-signature-256`. La API calcula HMAC SHA-256 sobre
`req.rawBody` usando `appSecret` y compara en tiempo constante.

- Con `appSecret`, una firma ausente o invalida devuelve 403.
- Con `REQUIRE_WEBHOOK_SIGNATURE=true`, no se acepta un POST no validable.
- En development sin app secret se permite solo si la variable no obliga
  firma y se registra un warning sanitizado.
- El GET `hub.challenge` no cambia.

`express.json({ verify })` copia el buffer solo para
`/api/webhooks/whatsapp/*`; despues `req.body` sigue disponible como JSON.

## Redaccion

El helper recursivo oculta tokens, secretos, credentials, provider payload,
Authorization, cookies, JWT y URI de MongoDB. Se aplica a logs, errores,
ActivityLog, respuestas de configuracion y vistas ops.

Pendientes: secret manager, rotacion automatizada, KMS/HSM, antivirus para
media y politicas formales de retencion.
