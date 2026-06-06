# TenantDesk MERN Multi-Tenant

Base SaaS multi-tenant con React, Vite, Tailwind, Node.js, Express, MongoDB,
Mongoose y JWT. Incluye gobierno de plataforma y la capa comercial completa
del distribuidor hacia sus empresas.

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

| Rol | Email | Password |
| --- | --- | --- |
| SUPERADMIN | superadmin@example.com | Admin123456 |
| DISTRIBUTOR | distributor@demo.com | Demo1234! |
| ADMIN | admin@demo.com | Demo1234! |
| SUPERVISOR | supervisor@demo.com | Demo1234! |
| CALLCENTER | callcenter@demo.com | Demo1234! |

No use estas credenciales en produccion.

## Scripts

```bash
npm run dev
npm run seed
npm run build
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000/api`
- Health: `http://localhost:4000/health`

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

## Alcance

No existen pasarelas de pago, DNS, certificados ni canales reales de WhatsApp,
Facebook, Instagram, Messenger, SMS o email. Tampoco se implementan funnels,
automatizaciones avanzadas, landing pages o calendario real. Facturas y pagos
son manuales; dominios e integraciones solo dejan contratos preparados.
