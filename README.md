# TenantDesk MERN Multi-Tenant

Base SaaS multi-tenant con React, Vite, Tailwind, Node.js, Express, MongoDB,
Mongoose y JWT. Incluye gobierno de plataforma, capa comercial del distribuidor
y CRM operativo avanzado para las empresas.
La Fase 4 agrega inbox omnicanal y WhatsApp Cloud. La Fase 5 endurece esa
base con cifrado AES-256-GCM, firma de webhooks, cola durable MongoDB,
reintentos, media, SSE, notificaciones, routing y observabilidad.

## Requisitos

- Node.js 20+
- MongoDB local o MongoDB Atlas

## Instalacion

```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run seed
npm run dev
```

En PowerShell:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Los `.env` reales estan ignorados y no deben versionarse. La precedencia de
configuracion es: variables del proceso, `server/.env`, `.env` raiz.

## Cuentas demo

El seed es exclusivamente para desarrollo.

| Rol | Email |
| --- | --- |
| SUPERADMIN | superadmin@example.com |
| DISTRIBUTOR | distributor@demo.com |
| ADMIN | admin@demo.com |
| SUPERVISOR | supervisor@demo.com |
| CALLCENTER | callcenter@demo.com |

El seed genera passwords aleatorios y los muestra una sola vez en consola.
Opcionalmente pueden definirse `DEMO_PASSWORD` y
`SUPERADMIN_DEMO_PASSWORD` antes de ejecutar `npm run seed`. No use cuentas
demo en produccion.

## Scripts

```bash
npm run dev
npm run seed
npm run build
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000/api`
- Health: `http://localhost:4000/health`
- Health API: `http://localhost:4000/api/health`

## Jerarquia

1. `SUPERADMIN`: propietario de la plataforma.
2. `DISTRIBUTOR`: administra su cartera de empresas.
3. `ADMIN`: administra una empresa.
4. `SUPERVISOR`: administra su equipo.
5. `CALLCENTER`: trabaja sus contactos asignados.

## Rutas principales

Frontend:

- `/superadmin`
- `/superadmin/distributors`
- `/superadmin/platform-plans`
- `/superadmin/subscriptions`
- `/superadmin/billing`
- `/superadmin/modules`
- `/superadmin/audit`
- `/distributor/dashboard`
- `/distributor/companies`
- `/distributor/finance`
- `/distributor/invoices`
- `/distributor/payments`
- `/distributor/branding`
- `/distributor/settings`
- `/distributor/onboarding`
- `/admin/dashboard`
- `/supervisor/dashboard`
- `/callcenter/dashboard`
- `/crm`
- `/crm/contacts`
- `/crm/opportunities`
- `/crm/pipeline`
- `/crm/tasks`
- `/crm/tags`
- `/crm/custom-fields`
- `/crm/segments`
- `/crm/import`
- `/inbox`
- `/inbox/channels`
- `/inbox/templates`
- `/inbox/routing`
- `/notifications`

API de plataforma:

- `/api/superadmin/overview`
- `/api/superadmin/distributors`
- `/api/superadmin/platform-plans`
- `/api/superadmin/platform-subscriptions`
- `/api/superadmin/invoices`
- `/api/superadmin/payments`
- `/api/superadmin/modules`
- `/api/superadmin/audit`

API del distribuidor:

- `/api/billing/my-platform-subscription`
- `/api/billing/my-platform-invoices`
- `/api/billing/my-platform-payments`
- `/api/billing/my-usage`
- `/api/distributor/billing/overview`
- `/api/distributor/companies`
- `/api/distributor/companies/:id/detail`
- `/api/distributor/companies/:id/subscription`
- `/api/distributor/invoices`
- `/api/distributor/payments`
- `/api/distributor/settings`
- `/api/distributor/branding`
- `/api/distributor/onboarding`

API de empresa:

- `/api/company/billing/invoices`
- `/api/company/billing/payments`
- `/api/company/settings`
- `/api/company/onboarding`

API CRM:

- `/api/contacts`
- `/api/contacts/import`
- `/api/contacts/export`
- `/api/crm/tags`
- `/api/crm/custom-fields`
- `/api/crm/segments`
- `/api/crm/dashboard`
- `/api/pipelines`
- `/api/opportunities`
- `/api/tasks`
- `/api/notes`

API de conversaciones:

- `/api/conversations`
- `/api/conversations/:id/messages`
- `/api/messages/:id/retry`
- `/api/channel-configs`
- `/api/message-templates`
- `/api/webhooks/whatsapp/:channelConfigId`
- `/api/realtime/events`
- `/api/notifications`
- `/api/routing-rules`
- `/api/ops/jobs`
- `/api/health`

## Variables de Fase 5

Antes de guardar credenciales configure `CREDENTIALS_ENCRYPTION_KEY`. En
produccion es obligatoria y debe tener al menos 32 caracteres. Tambien estan
disponibles `REQUIRE_WEBHOOK_SIGNATURE`, `JOB_WORKER_ENABLED`,
`JOB_WORKER_CONCURRENCY`, `JOB_MAX_ATTEMPTS`, `REALTIME_ENABLED`,
`WHATSAPP_GRAPH_API_VERSION` y `WHATSAPP_GRAPH_API_BASE_URL`.

Genere la clave fuera del repositorio:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Limites

`checkPlatformLimit()` valida en backend la creacion de empresas, usuarios y
contactos. En `production`, no tener `PlatformSubscription` bloquea la
operacion. En desarrollo se permite con warning para facilitar migraciones de
datos existentes. Una suscripcion `suspended` o `cancelled` bloquea siempre.

## Documentacion

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [BILLING.md](BILLING.md)
- [MODULES.md](MODULES.md)
- [PERMISSIONS.md](PERMISSIONS.md)
- [WHITE_LABEL.md](WHITE_LABEL.md)
- [DISTRIBUTOR_GUIDE.md](DISTRIBUTOR_GUIDE.md)
- [CRM.md](CRM.md)
- [CONVERSATIONS.md](CONVERSATIONS.md)
- [WHATSAPP.md](WHATSAPP.md)
- [SECURITY_WHATSAPP.md](SECURITY_WHATSAPP.md)
- [JOBS.md](JOBS.md)
- [REALTIME.md](REALTIME.md)

## Alcance

WhatsApp Cloud queda preparado para envio real solo cuando una empresa aporta
credenciales validas. `Probar con Meta` realiza una consulta real y no simula
exito. La media inbound conserva metadata y queda pendiente hasta configurar
almacenamiento. Facebook, Instagram, Messenger, SMS y email siguen como
adaptadores placeholder. Tampoco existen pasarelas de pago, funnels,
automatizaciones visuales, landing pages o calendario real.
