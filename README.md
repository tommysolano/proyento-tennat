# TenantDesk MERN Multi-Tenant

Base SaaS multi-tenant con React, Vite, Tailwind, Node.js, Express, MongoDB,
Mongoose y JWT. Incluye gobierno de plataforma, capa comercial del distribuidor
y CRM operativo avanzado para las empresas.
La Fase 4 agrega inbox omnicanal y WhatsApp Cloud. La Fase 5 endurece esa
base con cifrado AES-256-GCM, firma de webhooks, cola durable MongoDB,
reintentos, media, SSE, notificaciones, routing y observabilidad.
La Fase 6 prepara una beta controlada con storage desacoplado, descarga y
upload seguro de media, limites comerciales, diagnostico de canal, replay de
jobs, alertas operativas y rotacion manual de secretos.
La Fase 7 incorpora calendarios multiusuario, disponibilidad con zonas
horarias, citas CRM, recordatorios internos y reservas publicas.
La Fase 8 agrega workflows internos por empresa con eventos durables,
condiciones seguras, acciones auditables, delays sobre jobs e historial.
La Fase 9 incorpora formularios, encuestas, landing pages y funnels publicos
con captura CRM, booking links, workflows, anti-spam y analytics basicos.
La Fase 10 agrega solicitudes de resena, moderacion, testimonios, widgets,
encuestas NPS/CSAT, cupones y referidos. Tambien elimina el seed demo y deja
el monorepo listo para Render, Vercel y MongoDB Atlas.

## Requisitos

- Node.js 20+
- MongoDB local o MongoDB Atlas

## Instalacion

```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run seed:superadmin
npm run dev
```

En PowerShell:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Los `.env` reales estan ignorados y no deben versionarse. La precedencia de
configuracion es: variables del proceso, `server/.env`, `.env` raiz.

## Primer acceso

No se crean distribuidores, empresas, planes ni datos operativos demo.
Configure `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD` (minimo 12 caracteres)
y arranque el servidor. Despues de conectar MongoDB, el backend crea el usuario
`SUPERADMIN` si todavia no existe. El proceso es idempotente y no cambia su
password si ya existe. `npm run seed:superadmin` queda disponible como opcion
manual.

## Scripts

```bash
npm run dev
npm run seed:superadmin
npm test
npm run build
npm run start:server
npm run rotate-credentials-key --workspace server
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
- `/distributor/admins`
- `/distributor/plans`
- `/distributor/subscriptions`
- `/distributor/modules`
- `/distributor/platform`
- `/distributor/finance`
- `/distributor/invoices`
- `/distributor/payments`
- `/distributor/branding`
- `/distributor/settings`
- `/distributor/onboarding`

Las secciones que antes vivian como anclas dentro de `/distributor/dashboard`
(`#planes`, `#suscripciones`, `#modulos-autorizados`, `#plataforma`, `#admins`,
`#empresas`) ahora son rutas propias. Los enlaces antiguos con hash siguen
funcionando: `HashRedirect` los reenvia a la ruta equivalente.
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
- `/ops`
- `/workflows`
- `/workflows/new`
- `/workflow-runs`
- `/marketing/forms`
- `/marketing/submissions`
- `/marketing/analytics`
- `/marketing/landing-pages`
- `/marketing/funnels`
- `/forms/:slug`
- `/p/:slug`
- `/f/:funnelSlug/:stepSlug`
- `/r/:token`
- `/widgets/reviews/:slug`
- `/surveys/:slug`
- `/ref/:programSlug/:code`

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
- `/api/conversations/:id/messages/media`
- `/api/messages/:id/retry`
- `/api/messages/:id/media`
- `/api/messages/:id/media/content`
- `/api/channel-configs`
- `/api/channel-configs/:id/diagnostics`
- `/api/channel-configs/:id/rotate-secret`
- `/api/message-templates`
- `/api/webhooks/whatsapp/:channelConfigId`
- `/api/realtime/events`
- `/api/notifications`
- `/api/routing-rules`
- `/api/ops/jobs`
- `/api/ops/alerts`
- `/api/health`
- `/api/calendars`
- `/api/appointments`
- `/api/booking-links`
- `/api/public/bookings/:slug`
- `/api/workflows`
- `/api/workflows/catalog`
- `/api/workflow-runs`
- `/api/forms`
- `/api/public/forms/:slug`
- `/api/landing-pages`
- `/api/public/pages/:slug`
- `/api/funnels`
- `/api/funnel-steps`
- `/api/public/funnels/:funnelSlug/:stepSlug`
- `/api/reputation/overview`
- `/api/review-requests`
- `/api/reviews`
- `/api/testimonials`
- `/api/review-widgets`
- `/api/satisfaction-surveys`
- `/api/coupons`
- `/api/coupon-redemptions`
- `/api/referral-programs`
- `/api/referrals`
- `/api/public/reviews/request/:token`
- `/api/public/review-widgets/:slug`
- `/api/public/surveys/:slug`
- `/api/public/referrals/:programSlug/:code`

## Variables de Fase 5 y 6

Antes de guardar credenciales configure `CREDENTIALS_ENCRYPTION_KEY`. En
produccion es obligatoria y debe tener al menos 32 caracteres. Tambien estan
disponibles `REQUIRE_WEBHOOK_SIGNATURE`, `JOB_WORKER_ENABLED`,
`JOB_WORKER_CONCURRENCY`, `JOB_MAX_ATTEMPTS`, `REALTIME_ENABLED`,
`WHATSAPP_GRAPH_API_VERSION` y `WHATSAPP_GRAPH_API_BASE_URL`.

Media y operacion usan `MEDIA_STORAGE_PROVIDER`, `MEDIA_LOCAL_DIR`,
`MEDIA_MAX_SIZE_MB`, `MEDIA_SIGNED_URL_TTL_SECONDS`,
`MEDIA_ALLOWED_MIME_TYPES`, `WHATSAPP_SANDBOX_MODE` y `ALERTS_ENABLED`.
Consulte `.env.example`; no use valores reales en archivos versionados.

Genere la clave fuera del repositorio:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Limites

`checkPlatformLimit()` valida en backend la creacion de empresas, usuarios y
contactos. En `production`, no tener `PlatformSubscription` bloquea la
operacion. En desarrollo se permite con warning para facilitar migraciones de
datos existentes. Una suscripcion `suspended` o `cancelled` bloquea siempre.

`checkUsageLimit()` y `trackUsage()` controlan por empresa
`whatsapp_messages`, `media_storage_mb`, `media_files`, `conversations`,
`calendars`, `appointments` y `booking_links`. En produccion, una empresa sin
suscripcion comercial activa no puede consumir estas operaciones.
Fase 8 agrega `workflows`, `workflow_runs` y `workflow_actions`, asociados a
los limites `workflows`, `workflowRunsPerMonth` y
`workflowActionsPerMonth`.
Fase 9 agrega `forms`, `form_submissions`, `landing_pages`, `funnels`,
`funnel_steps`, `page_views` y `conversions`. Sus limites configurables son
`forms`, `formSubmissionsPerMonth`, `landingPages`, `funnels`, `funnelSteps`
y `pageViewsPerMonth`.
Fase 10 agrega `review_requests`, `reviews`, `review_widgets`,
`satisfaction_surveys`, `survey_responses`, `coupons`,
`coupon_redemptions`, `referral_programs` y `referrals`.

## Deploy rapido

- Render: Root Directory `server`, Build Command `npm install`, Start Command
  `npm start`, health check `/health`.
- Vercel: Root Directory `client`, Build Command `npm run build`, output
  `dist`, con `VITE_API_URL` apuntando al backend Render.
- MongoDB: use Atlas y configure `MONGODB_URI` solo como secreto de entorno.
- CORS: configure `CLIENT_URL` y `CORS_ORIGINS` con los dominios frontend.

Consulte [DEPLOYMENT.md](DEPLOYMENT.md) antes de publicar.

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
- [MEDIA.md](MEDIA.md)
- [OPS.md](OPS.md)
- [CALENDAR.md](CALENDAR.md)
- [BOOKINGS.md](BOOKINGS.md)
- [WORKFLOWS.md](WORKFLOWS.md)
- [AUTOMATIONS.md](AUTOMATIONS.md)
- [FORMS.md](FORMS.md)
- [LANDING_PAGES.md](LANDING_PAGES.md)
- [FUNNELS.md](FUNNELS.md)
- [PUBLIC_PAGES.md](PUBLIC_PAGES.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
- [REPUTATION.md](REPUTATION.md)
- [REVIEWS.md](REVIEWS.md)
- [LOYALTY.md](LOYALTY.md)
- [REFERRALS.md](REFERRALS.md)
- [WHATSAPP_PRODUCTION_CHECKLIST.md](WHATSAPP_PRODUCTION_CHECKLIST.md)

## Alcance

WhatsApp Cloud queda preparado para envio real solo cuando una empresa aporta
credenciales validas. `Probar con Meta` realiza una consulta real y no simula
exito. La media inbound se descarga mediante un job real y falla claramente
si faltan credenciales. El provider local sirve contenido solo por endpoint
autenticado. Para enviar media local a WhatsApp aun se requiere una URL
publica o subir primero el archivo a Graph API. Facebook, Instagram,
Messenger, SMS y email siguen como placeholders. Tampoco existen pasarelas de
pago, checkout, A/B testing, editor drag and drop, dominios personalizados
reales o SSR. El calendario y las reservas son internos: no sincronizan
Google Calendar/Outlook ni crean enlaces de Zoom, Meet u otros proveedores.
Los workflows no envian WhatsApp, email o SMS, no llaman webhooks externos y
no ejecutan IA; esos tipos permanecen `planned`.
Reputacion no consulta Google, Facebook, Trustpilot ni otras APIs externas.
Los cupones y recompensas son registros manuales: no hay checkout, pagos ni
sistema avanzado de puntos.
