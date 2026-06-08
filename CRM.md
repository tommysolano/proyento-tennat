# CRM Fase 3

## Alcance

La Fase 3 incorpora un CRM operativo por empresa:

- contactos avanzados, tags y campos personalizados;
- segmentos y filtros guardados;
- importacion JSON/CSV pegado y exportacion CSV;
- pipelines, etapas, oportunidades y Kanban por selector;
- tareas, notas, seguimientos, timelines y metricas por rol.

La Fase 4 integra el CRM con un inbox omnicanal y deja WhatsApp Cloud
preparado. La Fase 7 agrega citas y reservas. La Fase 9 agrega captura desde
formularios, landing pages y funnels. Pagos y checkout reales siguen fuera.

## Modelos

- `Contact`: conserva campos y notas heredadas; agrega ciclo de vida,
  prioridad, tags, `customFields`, ubicacion, metadata y archivado.
- `Tag`: etiqueta unica por empresa y nombre normalizado.
- `CustomField`: definicion por empresa, entidad y key.
- `Segment`: filtros guardados sin almacenar resultados.
- `Pipeline` y `PipelineStage`: embudo y etapas ordenadas.
- `Opportunity`: deal vinculado a contacto, pipeline, etapa y responsable.
- `Task`: tarea vinculada a contacto, oportunidad o empresa.
- `Note`: nota evolucionada para contactos y oportunidades.
- `Appointment`: cita vinculada opcionalmente a contacto y oportunidad.

## Seguridad

`companyId` y `distributorId` siempre salen del usuario autenticado. ADMIN ve
su empresa; SUPERVISOR ve recursos propios y de sus agentes; CALLCENTER ve
solo recursos asignados. Los filtros HTTP no reemplazan ese alcance.

Tags, contactos, responsables, pipelines, etapas y relaciones se validan
contra la empresa antes de guardar.

## APIs

- `/api/contacts`: CRUD, filtros, importacion, exportacion y timeline.
- `/api/crm/tags`, `/api/crm/custom-fields`, `/api/crm/segments`.
- `/api/crm/dashboard`: metricas segun alcance.
- `/api/pipelines`: pipelines, etapas y reordenamiento.
- `/api/opportunities`: CRUD, movimiento, ganado/perdido y timeline.
- `/api/tasks`: CRUD, completado y archivado.
- `/api/notes`: notas relacionadas.

## Importacion

La UI acepta JSON o CSV pegado. El backend limita cada lote a 1000 contactos,
detecta duplicados por telefono/email y puede actualizarlos. En CSV, `tags`
usa nombres separados por `|`; `assignedTo` acepta ID, email o nombre.

La exportacion genera CSV en backend y aplica filtros y permisos.

## Evolucion

Los futuros canales deben producir actividad mediante estos contratos sin
aceptar tenants desde payloads externos. Automatizaciones podra reaccionar a
cambios de etapa, citas y eventos de `ActivityLog`.

## Integracion con conversaciones

La ficha de contacto consulta conversaciones por `contactId`, abre el inbox y
puede crear una conversacion interna. Su timeline incluye mensajes y notas
internas sin exponer `providerPayload`. La ficha de oportunidad enlaza al inbox
filtrado por el contacto relacionado.

Ambas fichas consultan citas de su alcance, permiten abrir el calendario con
la relacion preseleccionada y agregan eventos `appointment` al timeline. El
inbox muestra proximas citas del contacto seleccionado.

## Workflows

ActivityLog emite eventos de contacto, oportunidad y tarea al motor. Las
acciones repiten el scope tenant antes de actualizar status, lifecycle,
prioridad, asignacion, tags, notas, etapas o tareas. El metadata de origen
evita que el mismo workflow se dispare indefinidamente.

## Formularios y funnels

`FormsService` usa mappings declarativos hacia campos estandar o
`customFields` de Contact y Opportunity. Antes de guardar valida que usuarios,
tags, custom fields, pipeline y etapa pertenezcan a la empresa.

La estrategia de duplicados puede crear, actualizar o ignorar. Los contactos
nuevos reciben estado, lifecycle, responsable y tags configurados. Cada
submission conserva `contactId` y `opportunityId`, agrega ActivityLog y crea
conversiones sin incluir valores sensibles en WorkflowEvent.

## Reputacion y fidelizacion

La ficha del contacto carga reviews, solicitudes, cupones y referidos. Puede
solicitar una resena, emitir un cupon y, para ADMIN, crear un referido.

ActivityLog agrega al timeline solicitudes, reviews, cupones y referidos. El
alcance sigue las asignaciones CRM existentes.
