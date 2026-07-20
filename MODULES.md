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
- `reviews`
- `testimonials`
- `coupons`
- `referrals`
- `loyalty`
- `integrations`

Cada entrada define `key`, nombre, descripcion, version, estado,
`enabledByDefault`, permisos y features requeridas.

Los modulos no implementados permanecen con estado `planned` y desactivados
por defecto.

## Dependencias entre modulos

El registro declara dependencias:

- `requires` (duras): `whatsapp -> [conversations]`, `inbox -> [conversations]`.
  Activar un modulo cuyo `requires` no esta cubierto ofrece activacion en
  cascada (previa confirmacion) en la UI; desactivar uno del que otros dependen
  avisa que se rompen (`modulesDependingOn`).
- `recommends` (suaves): `inbox -> [media, realtime]`. No bloquean; solo sugieren.

Helpers en `moduleRegistry.js`: `moduleRequires`, `moduleRecommends`,
`resolveRequiredModules` (cierre transitivo) y `modulesDependingOn`.

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

## Resolucion con traza (fuente unica de verdad)

`moduleAccess.js` resuelve los modulos efectivos y produce la **cadena de
resolucion** por modulo. `getDistributorAuthorizedModules` y
`getCompanyAuthorizedModules` (lo que consume `requireModule`) delegan en
`traceDistributorModules` / `traceCompanyModules`, por lo que el diagnostico es
exactamente la logica del backend, no una copia.

Orden real (de arriba hacia abajo):

- **Distribuidor**: `registry_default` (informativo, no se aplica) -> base
  (`core` + `platform_plan.includedModules` + `distributor.settings.enabledModules`)
  -> override `platform_plan` -> override `platform_subscription` -> override
  `distributor`.
- **Empresa**: sobre lo anterior, `company_plan` (`subscription.planId.includedModules`)
  ∩ autorizacion del distribuidor (`distributor_gate`) -> override
  `company_subscription` (solo resta) -> override `company` (solo resta).

`explainModuleForScope(scopeType, scopeId, moduleKey)` devuelve `{ enabled,
origin, blockedBy, chain }`, marcando el eslabon que habilita o bloquea.

### Endpoints

- SUPERADMIN: `GET /superadmin/modules/matrix?scopeType=&scopeId=` (estado
  efectivo por distribuidor o plan de plataforma) y
  `GET /superadmin/modules/diagnose?scopeType=&scopeId=&moduleKey=`. El toggle
  sigue usando `PUT /superadmin/modules/entitlements` (sin cambios).
- DISTRIBUTOR: `GET /distributor/modules/diagnose?moduleKey=` (por que un modulo
  esta o no autorizado a mi) y
  `GET /distributor/companies/:id/modules/diagnose?moduleKey=` (cadena completa
  a nivel empresa).

La UI de SUPERADMIN pinta la matriz con toggles (optimistic UI + revert) y un
icono de diagnostico por modulo; el editor de planes del distribuidor gestiona
`includedModules` con toggles (los no autorizados quedan deshabilitados con
tooltip) y expone el mismo diagnostico.

## Refresco de modulos sin re-login

El session access (`buildSessionAccess`) se reconstruye en `/auth/login`,
`/auth/me` y **siempre** al impersonar. `AuthContext.refreshSession()` llama a
`/auth/me` y actualiza `access.modules`, por lo que el sidebar se actualiza sin
cerrar sesion. Como no hay push SSE de cambios de entitlement, tras editar
plan/entitlement la UI avisa: "Los usuarios activos veran los cambios al
recargar su sesion".

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

## Reputacion y loyalty

`reputation`, `reviews`, `testimonials`, `coupons`, `referrals` y `loyalty`
estan activos en `1.0.0` y habilitados por defecto para el MVP. Las rutas
publicas vuelven a evaluar entitlements. Desactivar uno bloquea su superficie
privada y publica sin borrar datos.

No habilitan Google/Facebook Reviews, mensajes, pagos ni puntos.
