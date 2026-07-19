# Permisos

La matriz vive en
`server/src/core/permissions/permissions.js`. Las rutas nuevas usan
`requirePermission(permission)` ademas de autenticacion y rol.

## Permisos efectivos y plantillas

`User.permissions` es una reduccion opcional de los permisos del rol. Nunca
puede ampliar `ROLE_PERMISSIONS`, y el backend vuelve a filtrar la seleccion
por los modulos efectivos de la empresa.

Las plantillas viven en
`server/src/core/permissions/permissionTemplates.js`:

- `admin_full`: referencia del ADMIN, limitada por plan.
- `supervisor_commercial`: CRM, inbox, tareas, calendario y reportes basicos.
- `callcenter`: recursos asignados, notas, inbox y citas.
- `support_service`: atencion por inbox, notas y agenda disponible.

ADMIN puede consultar plantillas, aplicarlas a un usuario interno o copiarlas
a todos los usuarios SUPERVISOR/CALLCENTER de su empresa. Cada cambio exige
scope de empresa en backend y registra auditoria.

## Acceso delegado

El alcance vive en `server/src/core/permissions/impersonationScope.js` y se
aplica igual en `POST /api/auth/impersonate` y en el `authMiddleware`.

| Actor raiz | Puede entrar como | Limite de tenant |
| --- | --- | --- |
| SUPERADMIN | DISTRIBUTOR, ADMIN, SUPERVISOR, CALLCENTER | Ninguno |
| DISTRIBUTOR | ADMIN, SUPERVISOR, CALLCENTER | Empresas de su cartera |
| ADMIN | SUPERVISOR, CALLCENTER | Su propia empresa |
| SUPERVISOR | - | - |
| CALLCENTER | - | - |

Reglas invariantes:

- Solo se desciende: nunca un rol igual o superior al del actor raiz.
- Nunca a uno mismo ni a usuarios `inactive` o `pending` (404).
- La empresa objetivo debe estar `active` o `trial` para iniciar el acceso.
- El token delegado expira en 30 minutos.

Desde una sesion delegada se puede cambiar de objetivo o seguir bajando
(`SUPERADMIN -> ADMIN -> CALLCENTER`). No se anidan tokens: el nuevo conserva
el mismo `impersonatedBy` raiz y `POST /api/auth/impersonation/end` siempre
devuelve al actor original. Cada salto se autoriza contra el rol y el tenant
del actor raiz, nunca contra el usuario impersonado en curso, de modo que
impersonar no puede usarse para escalar privilegios.

`GET /api/auth/impersonation/targets` devuelve los candidatos visibles para el
actor raiz; el frontend solo muestra la accion "Entrar como" cuando ese
alcance existe, y el backend vuelve a validarlo.

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
- `activity:read_distributor`

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
- `calendars:manage`
- `appointments:manage`
- `booking_links:manage`
- `availability:manage`
- `workflows:manage`
- `workflows:read`
- `workflows:test`
- `workflow_runs:read`
- `forms:manage`
- `forms:read`
- `forms:submissions`
- `forms:analytics`
- `landing_pages:manage`
- `landing_pages:analytics`
- `funnels:manage`
- `funnels:analytics`

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
- `users:read_team`
- `conversations:read_team`
- `conversations:assign_team`
- `conversations:send_team`
- `conversations:close_team`
- `message_templates:read`
- `notifications:read`
- `routing_rules:read`
- `media:read_team`
- `media:upload_team`
- `calendars:read_team`
- `appointments:manage_team`
- `appointments:read_team`
- `appointments:update_team`
- `availability:read_team`
- `workflows:read_team`
- `workflow_runs:read_team`
- `forms:read_team`
- `forms:submissions_read`
- `funnels:read_team`

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
- `calendars:read_assigned`
- `appointments:manage_assigned`
- `appointments:read_assigned`
- `appointments:update_assigned`
- `activity:read_self`

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

Las APIs de calendario siguen la misma regla: ADMIN configura; SUPERVISOR
consulta calendarios compartidos con su equipo y gestiona citas de su alcance;
CALLCENTER solo ve calendarios donde participa y citas asignadas a si mismo.
Los enlaces publicos solo los administra ADMIN.

Las APIs de workflows permiten gestion solo a ADMIN. SUPERVISOR tiene lectura
de definiciones y runs de su empresa; CALLCENTER y DISTRIBUTOR no entran.
SUPERADMIN dispone de `workflows:read_all`, `workflows:manage_all` y
`workflow_runs:read_all`; una escritura global exige empresa valida.

Las APIs de marketing permiten gestion a ADMIN. SUPERVISOR solo lista forms,
submissions y funnels de su empresa; no publica ni modifica. CALLCENTER y
DISTRIBUTOR no tienen acceso operativo. SUPERADMIN posee `forms:read_all`,
`landing_pages:read_all` y `funnels:read_all`; la escritura sigue requiriendo
una sesion ADMIN de empresa.

## Fase 10

- ADMIN: `reputation:manage`, `reviews:manage`,
  `review_requests:manage`, `testimonials:manage`,
  `review_widgets:manage`, `surveys:manage`, `coupons:manage`,
  `referrals:manage`, `reputation:analytics`.
- SUPERVISOR: `reviews:read_team`, `review_requests:create_team`,
  `coupons:issue_team`, `referrals:read_team`.
- CALLCENTER: `review_requests:create_assigned`,
  `coupons:issue_assigned`, `reviews:read_assigned`.
- SUPERADMIN: `reputation:read_all`.
- DISTRIBUTOR: sin operacion directa salvo impersonacion.

Los alcances de equipo y asignados se traducen a contactos de la misma
empresa antes de consultar recursos.
