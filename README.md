# Plataforma Multi-Tenant MERN

Cascaron inicial de una web app SaaS multi-tenant con MongoDB, Express, React y Node.js.

## Estructura

```text
client/   Frontend React + Vite + Tailwind
server/   Backend Node.js + Express + MongoDB/Mongoose
```

## Requisitos

- Node.js 20+
- MongoDB local o una URI de MongoDB Atlas

## Instalacion

```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
```

En Windows PowerShell puedes crear los archivos locales asi:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Si PowerShell bloquea `npm` por politica de ejecucion, usa `npm.cmd` en los mismos comandos.

Edita `server/.env` para configurar `MONGODB_URI`, `PORT`, `JWT_SECRET` y `CLIENT_URL`.
Estos archivos estan ignorados por Git y nunca deben incluirse en el repositorio.

## Datos demo

Para cargar datos demo:

```bash
npm run seed
```

Tambien puedes poner `DEMO_SEED=true` en `server/.env` para recargar los datos al iniciar el backend.

Usuarios demo, todos con password `Demo1234!`:

| Rol | Email |
| --- | --- |
| Programador VPS | programador@demo.com |
| Distribuidor | distributor@demo.com |
| Administrador / Empresa | admin@demo.com |
| Administrador Altamar | admin.altamar@demo.com |
| Supervisor Call Center | supervisor@demo.com |
| Call Center | callcenter@demo.com |

El acceso separado de superadmin fue eliminado del cascaron. El programador entra como usuario distribuidor al mismo VPS/datos del distribuidor. Desde el dashboard del distribuidor puedes usar `Entrar` en una empresa para abrir la cuenta admin de ese tenant y luego volver al distribuidor.

## Ejecutar en desarrollo

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`
- Health check: `http://localhost:4000/health`

Si ves `EADDRINUSE` o Vite se mueve a `5174`, hay un proceso anterior ocupando los puertos. En PowerShell puedes liberarlos asi:

```powershell
$pids = netstat -ano | Select-String ':4000|:5173|:5174' | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
if ($pids) { Stop-Process -Id $pids -Force }
```

## Rutas principales

Frontend:

- `/login`
- `/distributor/dashboard`
- `/admin/dashboard`
- `/supervisor/dashboard`
- `/callcenter/dashboard`

API:

- `/api/auth/login`
- `/api/auth/me`
- `/api/users`
- `/api/distributors`
- `/api/companies`
- `/api/plans`
- `/api/subscriptions`
- `/api/contacts`
- `/api/conversations`
- `/api/activity-logs`
- `/api/channel-configs`

## Estado del proyecto

El dashboard del distribuidor usa empresas, planes, usuarios y suscripciones reales de la API. Los dashboards de administrador, supervisor y call center todavia conservan datos simulados. No incluye integraciones reales de WhatsApp/Facebook/Messenger ni pagos reales.
