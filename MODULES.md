# Modulos

## Registro

`server/src/core/modules/moduleRegistry.js` contiene:

- `core`
- `crm`
- `contacts`
- `opportunities`
- `tasks`
- `conversations`
- `inbox`
- `whatsapp`
- `realtime`
- `notifications`
- `media`
- `calendar`
- `bookings`
- `billing`
- `reporting`
- `automations`
- `workflows`
- `forms`
- `surveys`
- `landing_pages`
- `funnels`
- `reputation`
- `integrations`

Cada entrada define `key`, nombre, descripcion, version, estado,
`enabledByDefault`, permisos y features requeridas.

Los modulos no implementados permanecen con estado `planned` y desactivados
por defecto.

## Entitlements

`ModuleEntitlement` soporta:

- `platform_plan`
- `distributor`
- `company`
- `company_subscription`
- `platform_subscription`

En la UI de plataforma se gestionan overrides para plan de plataforma y
distribuidor. Los planes comerciales pueden declarar `includedModules`. Las
rutas comerciales usan `requireModule('billing')`, por lo que desactivar el
modulo bloquea billing en backend aunque la navegacion siga siendo visible.

Las rutas de Fase 3 requieren `crm` y, segun el recurso, `contacts`,
`opportunities` o `tasks`. Estos modulos estan activos y
`enabledByDefault` para conservar compatibilidad con tenants existentes. Un
`ModuleEntitlement` explicito puede bloquearlos con HTTP 403.

Las rutas de conversaciones y mensajes requieren `conversations` e `inbox`.
La administracion de `ChannelConfig` requiere ademas `whatsapp`. Los tres
modulos estan activos y `enabledByDefault` para el MVP; un entitlement
explicito en plan, distribuidor, empresa o suscripcion puede bloquearlos.
Los webhooks publicos resuelven el mismo entitlement `whatsapp` desde el
tenant del `ChannelConfig`; ademas ignoran configuraciones desactivadas.

SSE requiere `realtime`; las APIs de avisos requieren `notifications`. Ambos
estan activos y `enabledByDefault` para conservar tenants existentes.

Lectura, upload y descarga de adjuntos requieren `media`, ademas de
`conversations` e `inbox`. El diagnostico de WhatsApp requiere `whatsapp`.
`media` esta activo por defecto para no romper empresas existentes, pero un
entitlement explicito puede bloquearlo con HTTP 403.

Branding, configuracion y onboarding no dependen del modulo billing, lo que
permite recuperar o configurar el tenant aun si billing esta desactivado.

## Calendar y bookings

`calendar` y `bookings` estan activos en version `1.0.0`. El primero protege
calendarios, disponibilidad, citas y metricas. El segundo protege la
administracion y resolucion publica de enlaces. Ambos pueden desactivarse con
`ModuleEntitlement`.

Activar estos modulos no implica integraciones externas. Google Calendar,
Outlook, Zoom y Meet no forman parte del registro ni del runtime actual.

## Automations y workflows

Ambos modulos estan activos en version `1.0.0` y habilitados por defecto para
el MVP. Las rutas privadas exigen los dos modulos. Pueden bloquearse por plan,
suscripcion, distribuidor o empresa con `ModuleEntitlement`.

La activacion no habilita canales externos: email, SMS, WhatsApp, webhooks e
IA permanecen planned.

## Forms, surveys, landing pages y funnels

Los cuatro modulos estan activos en `1.0.0` y `enabledByDefault` para el MVP.
Las rutas privadas y publicas vuelven a resolver los entitlements en backend.
`surveys` se comprueba adicionalmente cuando un `Form.type` es `survey`.

Desactivar un modulo no elimina datos: bloquea administracion, publicacion y
resolucion publica hasta restaurar el entitlement.
