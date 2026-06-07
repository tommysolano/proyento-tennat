# Automations

`automations` y `workflows` estan activos y `enabledByDefault` en el MVP. Un
`ModuleEntitlement` explicito puede desactivarlos y las rutas responden 403.

## Componentes

- `Workflow`: definicion versionada por empresa.
- `WorkflowEvent`: evento durable, normalizado e idempotente.
- `WorkflowRun`: condiciones, cursor, acciones, estado y error.
- `WorkflowEventEmitter`: puente desde ActivityLog y servicios.
- `WorkflowService`: matching, limites, cola y ejecucion.
- `WorkflowActionExecutor`: acciones internas con filtros tenant.
- `workflow.run`: job durable y transporte de delays.

## Permisos

- ADMIN: lectura, gestion, test y runs.
- SUPERVISOR: lectura de workflows y runs de su empresa.
- CALLCENTER y DISTRIBUTOR: sin acceso directo.
- SUPERADMIN: auditoria global; escritura con una empresa valida.

## Limites

Los planes incluyen `workflows`, `workflowRunsPerMonth` y
`workflowActionsPerMonth`. Los medidores son `workflows`, `workflow_runs` y
`workflow_actions`. Cero mantiene la convencion de limite no configurado.

## Alertas y realtime

Un run fallido crea `workflow_failure`, notifica al actor y publica
`workflow.run_failed`. Un run completado publica `workflow.run_completed` y
puede notificar si `notifyOnComplete` esta activo. Un job dead emite
`job.dead`.

## Alcance

No hay drag and drop, campanas, canales externos, webhooks reales, IA,
funnels, landing pages ni pagos automaticos. Los schedulers de vencimientos
marcados `planned` quedan pendientes.
