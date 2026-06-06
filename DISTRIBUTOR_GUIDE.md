# Guia del distribuidor

## Preparacion inicial

1. Abra `Branding` y configure nombre, logo, colores y soporte.
2. Abra `Configuracion` y defina moneda, impuesto, prefijo, instrucciones de
   pago y dias de gracia.
3. Revise `Onboarding` para confirmar los pasos pendientes.

## Crear plan comercial

En `Planes`, indique nombre, codigo unico dentro del distribuidor, precio,
moneda, ciclo mensual o anual, limites y modulos incluidos. El plan puede
quedar `active`, `inactive` o archivarse. Ningun distribuidor puede consultar
o asignar planes de otro tenant.

## Crear empresa y suscripcion

1. Cree la empresa desde el panel y su administrador principal.
2. Abra `Empresas` y asigne un plan.
3. Defina estado, inicio, periodo actual y vencimiento.

Solo puede existir una suscripcion vigente (`trial`, `active`, `past_due` o
`suspended`) por empresa. La operacion de cambio actualiza la vigente.

## Emitir factura manual

En `Facturas`, elija empresa, estado inicial, vencimiento y agregue conceptos
con descripcion, cantidad y precio unitario. El servidor calcula subtotal,
impuesto y total y genera el numero con la configuracion comercial.

## Registrar pago manual

En `Pagos`, seleccione empresa y factura, indique importe, moneda, estado,
metodo y fecha. Si los pagos `succeeded` acumulados cubren el total, la
factura pasa a `paid`.

## Suspender o reactivar

Desde `Empresas` o su detalle se puede suspender o reactivar una empresa
propia. Una empresa suspendida bloquea en backend la operacion de sus usuarios
`ADMIN`, `SUPERVISOR` y `CALLCENTER`. La reactivacion restablece el acceso.

## Panel financiero

`Finanzas` muestra ingreso mensual esperado, empresas y suscripciones por
estado, facturas pendientes/pagadas, pagos recientes y planes mas usados.
Todos los valores proceden de la API y estan limitados al distribuidor
autenticado.

## Vista de la empresa

El `ADMIN` puede consultar sus facturas, pagos asociados, configuracion y
onboarding. No puede emitir facturas, registrar pagos, cambiar plan, modificar
el estado comercial ni consultar otra empresa.
