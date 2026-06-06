# Arquitectura

## Capas de tenancy

La plataforma usa tres niveles:

1. Plataforma: gobernada por `SUPERADMIN`.
2. Distribuidor: identificado por `distributorId`.
3. Empresa: identificada por `companyId` y perteneciente a un distribuidor.

Los filtros tenant se construyen en backend a partir del usuario autenticado.
El frontend nunca decide el tenant efectivo.

## Roles

- `SUPERADMIN`: distribuidores, planes internos, suscripciones, billing,
  modulos, auditoria e impersonacion.
- `DISTRIBUTOR`: empresas, planes y suscripciones comerciales, facturas,
  pagos, configuracion comercial, branding y lectura de su billing de
  plataforma.
- `ADMIN`: usuarios, contactos, onboarding y lectura del billing de su empresa.
- `SUPERVISOR`: agentes y contactos de su equipo.
- `CALLCENTER`: contactos asignados.

## Core y modulos

El core contiene autenticacion, usuarios, tenants, permisos, auditoria,
entitlements y configuracion. `ModuleRegistry` describe capacidades
instalables. `ModuleEntitlement` aplica overrides por plan, distribuidor,
empresa o suscripcion.

`requireModule(moduleKey)` resuelve en este orden:

1. Override del distribuidor.
2. Override de la suscripcion de plataforma.
3. Override del plan de plataforma.
4. `includedModules` del plan.
5. `enabledByDefault` del registro.

`SUPERADMIN` omite esta validacion para poder recuperar configuraciones.

## Modelos comerciales

- `Plan` (`DistributorPlan` conceptualmente) y `Subscription`
  (`CompanySubscription` conceptualmente): distribuidor cobra a empresa.
- `PlatformPlan` y `PlatformSubscription`: plataforma cobra a distribuidor.
- `Invoice`: funciona en ambos sentidos mediante `issuerType`, `issuerId`,
  `customerType`, `customerId` y `subscriptionType`.
- `Payment`: pago manual, vinculado opcionalmente a factura.
- `UsageRecord`: consumo historico por distribuidor o empresa.

La numeracion de facturas es unica por emisor. Para distribuidores se obtiene
de `billingSettings.invoicePrefix` e `invoiceNextNumber`, incrementado
atomicamente en MongoDB.

## Aislamiento y estado

- Los IDs de distribuidor efectivos siempre salen del JWT autenticado.
- Una empresa, plan, suscripcion, factura o pago se valida contra ese tenant.
- `ADMIN` solo consulta documentos cuyo `customerId` o `payerId` es su
  `companyId`.
- Una empresa `suspended`, `cancelled` o legada `inactive` bloquea a
  `ADMIN`, `SUPERVISOR` y `CALLCENTER` en backend.
- `SUPERADMIN` y `DISTRIBUTOR` conservan acceso a sus paneles de gestion.
- El cierre de una impersonacion queda disponible aun si la empresa se
  suspende durante la sesion.

## Configuracion y marca

- `GlobalSettings`: moneda, impuestos, soporte y numeracion global.
- `Distributor.branding`: logo, colores, nombre y soporte.
- `Distributor.customDomain`: dominio, estado, token y verificacion futura.
- `Distributor.settings` y `billingSettings`: locale, timezone, moneda,
  impuestos, prefijo, numeracion y condiciones comerciales.
- `Company.settings`: timezone, locale, modulos e informacion comercial.

El contexto de sesion devuelve marca y configuracion tenant segura. El
frontend aplica nombre, logo y variables CSS con fallbacks. No existe
provisionamiento real de dominios.

## Onboarding

`Distributor.onboarding` y `Company.onboarding` almacenan pasos booleanos. Los
helpers recalculan los pasos derivados despues de crear planes, empresas,
usuarios, suscripciones, contactos o asignaciones. El paso de perfil de
empresa tambien puede marcarse desde el panel `ADMIN`.

## Impersonacion

Se permite un solo nivel:

- `SUPERADMIN` a `DISTRIBUTOR`.
- `DISTRIBUTOR` a `ADMIN` de una empresa propia.

El JWT impersonado incluye el actor original. El frontend conserva la sesion
original, muestra un indicador persistente y llama al endpoint de cierre antes
de restaurarla. Inicio y fin quedan en `ActivityLog`.
