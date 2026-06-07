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
- `calendar`
- `billing`
- `reporting`
- `automations`
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

Branding, configuracion y onboarding no dependen del modulo billing, lo que
permite recuperar o configurar el tenant aun si billing esta desactivado.

## Agregar calendar

1. Cambiar `calendar` a `active` cuando exista una implementacion real.
2. Crear sus modelos, servicios y rutas dentro de un modulo delimitado.
3. Proteger rutas con `requireModule('calendar')`.
4. Agregar permisos especificos en `permissions.js`.
5. Incluir `calendar` en planes o crear un `ModuleEntitlement`.
6. Agregar rutas y navegacion frontend condicionadas por acceso.
7. Probar acceso permitido, acceso 403 y aislamiento tenant.

No se debe interpretar una entrada del registro como una integracion
implementada.
