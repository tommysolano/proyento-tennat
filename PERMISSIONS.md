# Permisos

La matriz vive en
`server/src/core/permissions/permissions.js`. Las rutas nuevas usan
`requirePermission(permission)` ademas de autenticacion y rol.

## SUPERADMIN

- `platform:manage`
- `distributors:manage`
- `platform_plans:manage`
- `platform_subscriptions:manage`
- `platform_billing:manage`
- `modules:manage`
- `impersonation:manage`
- `audit:read_all`

## DISTRIBUTOR

- `companies:manage`
- `companies:suspend`
- `distributor_plans:manage`
- `company_subscriptions:manage`
- `distributor_billing:read`
- `distributor_billing:manage`
- `company_invoices:manage`
- `company_payments:manage`
- `distributor_settings:manage`
- `distributor_branding:manage`
- `modules:read`
- `impersonation:start_admin`

## ADMIN

- `users:manage`
- `crm:manage`
- `contacts:manage`
- `contacts:assign`
- `contacts:import`
- `contacts:export`
- `tags:manage`
- `custom_fields:manage`
- `segments:manage`
- `pipelines:manage`
- `opportunities:manage`
- `tasks:manage`
- `notes:manage`
- `conversations:manage`
- `conversations:read`
- `conversations:assign`
- `conversations:send`
- `conversations:close`
- `channel_configs:manage`
- `message_templates:manage`
- `activity:read`
- `company_billing:read`
- `company_settings:read`
- `company_onboarding:update`
- `notifications:read`
- `routing_rules:manage`
- `ops:read_company`
- `jobs:read_company`
- `jobs:replay_company`
- `alerts:read_company`
- `alerts:ack_company`
- `media:read`
- `media:upload`
- `channel_diagnostics:read`
- `channel_secrets:rotate`

## SUPERVISOR

- `crm:read_team`
- `contacts:read_team`
- `contacts:update_team`
- `contacts:assign_team`
- `opportunities:read_team`
- `opportunities:update_team`
- `opportunities:assign_team`
- `tasks:create_team`
- `tasks:update_team`
- `notes:create_team`
- `activity:read_team`
- `conversations:read_team`
- `conversations:assign_team`
- `conversations:send_team`
- `conversations:close_team`
- `message_templates:read`
- `notifications:read`
- `routing_rules:read`
- `media:read_team`
- `media:upload_team`

## CALLCENTER

- `contacts:read_assigned`
- `contacts:update_assigned`
- `contacts:notes`
- `contacts:followup`
- `opportunities:read_assigned`
- `opportunities:update_assigned`
- `tasks:read_assigned`
- `tasks:update_assigned`
- `notes:create_assigned`
- `followups:manage_assigned`
- `conversations:read_assigned`
- `conversations:send_assigned`
- `conversations:internal_notes`
- `message_templates:use`
- `notifications:read`
- `media:read_assigned`
- `media:upload_assigned`

## SUPERADMIN Fase 5

- `ops:read_all`
- `jobs:read_all`
- `jobs:replay_all`
- `alerts:read_all`
- `alerts:ack_all`

## Criterio de migracion

Las rutas existentes mantienen sus comprobaciones de rol para evitar una
reescritura riesgosa. Las rutas nuevas de plataforma usan permisos
centralizados. Las rutas comerciales combinan rol, permiso, modulo y filtro
tenant en backend. `SUPERVISOR` y `CALLCENTER` no reciben permisos de billing
ni configuracion comercial.

Las APIs CRM combinan `roleMiddleware`, `requireAnyPermission`,
`requireModule` y filtros tenant. Un permiso nunca elimina el filtro de
empresa, equipo o asignacion.

Las APIs de inbox aplican la misma combinacion. CALLCENTER no puede cerrar,
archivar, reasignar ni configurar canales. SUPERVISOR solo opera
conversaciones propias o de sus agentes. ADMIN no puede salir de su
`companyId`. DISTRIBUTOR no tiene permisos de lectura operativa y solo puede
entrar mediante la impersonacion existente.

`SUPERADMIN` conserva acceso global en sus rutas. La consulta global de
facturas y pagos requiere `scope=all`; sin ese parametro las vistas existentes
mantienen el alcance de plataforma.

Los endpoints de media vuelven a comprobar el scope de la conversacion aunque
el usuario tenga permiso. Replay y alertas aplican `companyId` para ADMIN;
CALLCENTER y SUPERVISOR no acceden a `/api/ops`.
