# Modulos

## Registro

`server/src/core/modules/moduleRegistry.js` contiene:

- `core`
- `crm`
- `contacts`
- `conversations`
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
