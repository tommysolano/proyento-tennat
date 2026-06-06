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
- `contacts:manage`
- `contacts:assign`
- `activity:read`
- `company_billing:read`
- `company_settings:read`
- `company_onboarding:update`

## SUPERVISOR

- `contacts:read_team`
- `contacts:update_team`
- `contacts:assign_team`
- `activity:read_team`

## CALLCENTER

- `contacts:read_assigned`
- `contacts:update_assigned`
- `contacts:notes`
- `contacts:followup`

## Criterio de migracion

Las rutas existentes mantienen sus comprobaciones de rol para evitar una
reescritura riesgosa. Las rutas nuevas de plataforma usan permisos
centralizados. Las rutas comerciales combinan rol, permiso, modulo y filtro
tenant en backend. `SUPERVISOR` y `CALLCENTER` no reciben permisos de billing
ni configuracion comercial.

`SUPERADMIN` conserva acceso global en sus rutas. La consulta global de
facturas y pagos requiere `scope=all`; sin ese parametro las vistas existentes
mantienen el alcance de plataforma.
