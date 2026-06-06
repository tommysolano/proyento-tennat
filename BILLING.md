# Billing

## Plataforma a distribuidor

La Fase 1 implementa el ciclo:

`PlatformPlan` -> `PlatformSubscription` -> `Invoice` -> `Payment`

El `SUPERADMIN` puede crear y actualizar planes, asignar suscripciones, emitir
facturas manuales y registrar pagos manuales. Un pago `succeeded` marca la
factura como `paid` cuando la suma de pagos exitosos cubre el total.

No existe pasarela real. Los campos `paymentProvider`, IDs externos y metadata
permiten integrar un proveedor despues sin cambiar el contrato principal.

## Distribuidor a empresa

La Fase 2 implementa:

`Plan` -> `Subscription` -> `Invoice` -> `Payment`

`Plan` y `Subscription` conservan sus nombres por compatibilidad, pero
representan conceptualmente `DistributorPlan` y `CompanySubscription`.

El distribuidor puede crear y editar planes propios, asignar una suscripcion
a una empresa propia, emitir facturas manuales y registrar pagos. El backend
recalcula cada `lineItem.total`, subtotal, impuesto y total; no confia en
totales enviados por el frontend.

Al crear una factura se reserva el siguiente numero de forma atomica:

```text
{invoicePrefix}-{invoiceNextNumber con 6 digitos}
FAC-000001
```

Un pago `succeeded` marca la factura `paid` cuando la suma de pagos exitosos
alcanza su total. No existe pasarela real.

## Aislamiento

Las rutas `/api/billing/my-*` no aceptan un `distributorId` del cliente.
Siempre filtran con `req.user.distributorId`. Solo `DISTRIBUTOR` con el permiso
`distributor_billing:read` puede usarlas.

Las rutas `/api/distributor/*` derivan `issuerId` y `distributorId` de la
sesion. Los `companyId`, `planId`, `subscriptionId` e `invoiceId` recibidos se
resuelven dentro del mismo distribuidor. Las rutas `/api/company/*` usan
exclusivamente `req.user.companyId` y son de solo lectura para facturas y
pagos.

## Estados

Suscripcion de plataforma:

- `trial`
- `active`
- `past_due`
- `cancelled`
- `suspended`

Suscripcion de empresa:

- `trial`
- `active`
- `past_due`
- `cancelled`
- `suspended`

Factura:

- `draft`
- `open`
- `paid`
- `overdue`
- `void`
- `uncollectible`

Pago:

- `pending`
- `succeeded`
- `failed`
- `refunded`

## Limites

Los limites `companies`, `users` y `contacts` se aplican antes de crear el
recurso. La fuente es la ultima `PlatformSubscription` y su `PlatformPlan`.
El conteo se realiza en MongoDB, por lo que no puede omitirse desde frontend.

Los planes comerciales tambien almacenan limites de usuarios, contactos,
mensajes, almacenamiento y modulos. En esta fase sirven como contrato
comercial y visual; el enforcement general de esos limites de empresa queda
para una fase posterior.
