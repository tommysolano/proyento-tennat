# Deploy: Render, Vercel y MongoDB Atlas

## Requisitos

- Node.js 20 o superior.
- Un cluster MongoDB Atlas con usuario y allowlist de red configurados.
- Un servicio Web en Render para `server`.
- Un proyecto Vercel para `client`.

No versionar archivos `.env`. Los ejemplos contienen placeholders, no
credenciales operativas.

## MongoDB Atlas

1. Cree cluster, database user y password.
2. Configure Network Access para Render.
3. Copie el connection string en `MONGODB_URI`.
4. No agregue el URI a Git, Vercel ni al frontend.

## Backend en Render

Configuracion recomendada:

- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Tambien existe `render.yaml` en la raiz. El backend no requiere build porque
ejecuta JavaScript ESM directamente con Node.

Variables:

```env
NODE_ENV=production
PORT=4000
MONGODB_URI=
JWT_SECRET=
CLIENT_URL=https://tu-frontend.vercel.app
SERVER_URL=https://tu-backend.onrender.com
CORS_ORIGINS=https://tu-frontend.vercel.app,https://app.tudominio.com
SUPERADMIN_NAME=Programador
SUPERADMIN_EMAIL=
SUPERADMIN_PASSWORD=
CREDENTIALS_ENCRYPTION_KEY=
REQUIRE_WEBHOOK_SIGNATURE=true
JOB_WORKER_ENABLED=true
JOB_WORKER_CONCURRENCY=2
JOB_MAX_ATTEMPTS=5
REALTIME_ENABLED=true
WHATSAPP_GRAPH_API_VERSION=v20.0
WHATSAPP_GRAPH_API_BASE_URL=https://graph.facebook.com
MEDIA_STORAGE_PROVIDER=local
MEDIA_LOCAL_DIR=uploads
MEDIA_MAX_SIZE_MB=25
MEDIA_SIGNED_URL_TTL_SECONDS=300
MEDIA_ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,video/mp4,application/pdf
WHATSAPP_SANDBOX_MODE=true
ALERTS_ENABLED=true
PUBLIC_TRACKING_SALT=
```

Use secretos aleatorios largos para `JWT_SECRET`,
`CREDENTIALS_ENCRYPTION_KEY` y `PUBLIC_TRACKING_SALT`.

## SUPERADMIN inicial

Configure `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD` antes de desplegar. En
cada arranque, despues de conectar MongoDB y antes de aceptar trafico, el
backend crea el usuario `SUPERADMIN` si todavia no existe.

El log de Render debe incluir `superadmin.bootstrap_complete`; el campo
`created` indica si el usuario fue creado en ese arranque. Como alternativa
manual, desde Render Shell o un entorno con acceso a Atlas:

```bash
npm run seed:superadmin
```

Tanto el arranque como el script son idempotentes, no duplican por email y no
sobrescriben el password de un usuario existente. El primer login usa esas
credenciales.

## Frontend en Vercel

Configuracion:

- Root Directory: `client`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

Variables:

```env
VITE_API_URL=https://tu-backend.onrender.com/api
VITE_APP_NAME=TenantDesk
VITE_PUBLIC_BASE_URL=https://tu-frontend.vercel.app
```

`client/vercel.json` reescribe todas las rutas a `/`, necesario para rutas SPA
como `/forms/:slug`, `/p/:slug`, `/f/:funnelSlug`, `/book/:slug`,
`/r/:token`, `/surveys/:slug` y `/ref/:programSlug/:code`.

## Opciones de monorepo

Opcion A: importe el mismo repositorio dos veces y use Root Directory
`server` en Render y `client` en Vercel.

Opcion B: mantenga la raiz completa en ambas plataformas y configure el Root
Directory desde el panel de cada servicio. No ejecute backend y frontend en
el mismo proceso.

## Verificacion

1. Abra `https://tu-backend.onrender.com/health`.
2. Abra `https://tu-backend.onrender.com/api/health`.
3. Confirme `superadmin.bootstrap_complete` en los logs de Render.
4. Abra el frontend y pruebe login.
5. Confirme que requests desde Vercel no generan errores CORS.

## CORS y cambios de dominio

`CLIENT_URL` define el frontend principal. `CORS_ORIGINS` acepta una lista
separada por comas para Vercel, previews controlados y dominio personalizado.
Al cambiar el dominio actualice ambas variables y redespliegue el backend.
Produccion no agrega localhost ni usa `*`.

## Uploads y storage

El filesystem de Render es efimero. `MEDIA_STORAGE_PROVIDER=local` sirve para
pruebas y puede perder archivos en deploy, restart o reemplazo de instancia.
Use un provider cloud persistente antes de depender de media en produccion.

## Workers y jobs

`JOB_WORKER_ENABLED=false` desactiva el worker en el proceso web.
Si el volumen crece, ejecute un worker separado con acceso a la misma base.
Controle concurrencia y reintentos con `JOB_WORKER_CONCURRENCY` y
`JOB_MAX_ATTEMPTS`.

## WhatsApp webhooks

Configure la URL publica de Render, active firma en produccion y use secretos
de Meta solo en variables de entorno. Reputacion no envia WhatsApp, email o
SMS; esos canales estan marcados como planned.

## Troubleshooting

- `Variables de entorno requeridas`: falta una variable validada al inicio.
- Error CORS: agregue el origin exacto, sin path, a `CORS_ORIGINS`.
- Login falla tras deploy: verifique `SUPERADMIN_EMAIL`,
  `SUPERADMIN_PASSWORD`, el log `superadmin.bootstrap_complete` y la conexion a
  Atlas; despues redespliegue el backend.
- Health `degraded`: revise MongoDB, jobs y storage en el payload.
- Links publicos apuntan mal: corrija `CLIENT_URL` y `VITE_PUBLIC_BASE_URL`.
- Media desaparece: cambie de storage local a un provider persistente.
