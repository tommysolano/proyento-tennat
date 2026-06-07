# Media segura

## Providers

`StorageProvider` define `uploadBuffer`, `uploadStream`, `getSignedUrl`,
`deleteObject`, `getObjectMetadata` y `createReadStream`.

- `local`: implementado para beta/dev.
- `s3`, `r2`, `digitalocean_spaces`: placeholders que fallan con mensaje
  explicito hasta configurar una implementacion real.

El provider local resuelve `MEDIA_LOCAL_DIR` respecto al repositorio o al
servidor, crea nombres UUID por empresa, usa permisos de archivo `0600` y
guarda metadata en un sidecar. `server/uploads` y `uploads` estan ignorados.
No configure esta carpeta dentro de `client/public`.

## Validacion

Tipos permitidos por defecto:

- `image/jpeg`
- `image/png`
- `image/webp`
- `audio/mpeg`
- `audio/ogg`
- `video/mp4`
- `application/pdf`

`MEDIA_MAX_SIZE_MB` limita upload y descarga. Se rechazan MIME vacio,
ejecutables, scripts, HTML, SVG y extensiones que no coinciden con el MIME.
El nombre se normaliza y nunca decide la ruta final.

Esta validacion es basica. Antes de una produccion abierta se requiere
inspeccion por magic bytes, antivirus, cuarentena y politica de retencion.

## Inbound WhatsApp

1. El webhook crea el mensaje con `media.status=pending`.
2. Se encola `media.whatsapp.download`.
3. El worker consulta metadata en Graph API.
4. Descarga con el `accessToken` cifrado y corta el stream al superar el
   limite.
5. Valida, comprueba cuota, almacena y actualiza el mensaje a `available`.
6. Un fallo deja error sanitizado y estado `failed`; el endpoint de retry crea
   un job nuevo.

Sin credenciales reales no se simula contenido: el job falla con un error
claro.

## API y acceso

- `GET /api/messages/:id/media`: metadata segura.
- `GET /api/messages/:id/media/content`: stream autenticado.
- `POST /api/messages/:id/media/retry-download`: retry inbound.
- `POST /api/conversations/:id/messages/media`: upload multipart, campo
  `file`, caption opcional.

Todas las rutas validan empresa y scope ADMIN/equipo/asignacion. El JSON no
expone `storageKey` ni `providerMediaId`.

Un archivo local funciona inmediatamente en conversaciones internas. Para
WhatsApp real, Meta necesita una URL publica o un media ID obtenido tras subir
el binario a Graph API; esa subida aun no se implementa.

## Variables

```env
MEDIA_STORAGE_PROVIDER=local
MEDIA_LOCAL_DIR=server/uploads
MEDIA_MAX_SIZE_MB=25
MEDIA_SIGNED_URL_TTL_SECONDS=300
MEDIA_ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,video/mp4,application/pdf
```

El TTL queda reservado para providers cloud. El provider local desactiva
signed URLs directas para no poner `storageKey` en la URL y usa siempre el
stream autenticado por mensaje.
