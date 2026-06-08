# Fidelizacion

## Cupones

`Coupon` define codigo unico por empresa, vigencia, tipo de descuento y
limites. `CouponRedemption` registra emision, redencion o cancelacion manual.
No aplica descuentos a pagos ni ejecuta checkout.

## Metricas y limites

Se miden cupones creados y redenciones mensuales. El overview muestra
emisiones, redenciones y tasa de redencion.

## Seguridad

Emitir o redimir exige que el contacto pertenezca al alcance CRM del usuario.
El backend vuelve a validar tenant, estado, vigencia y limite por contacto.

No existe sistema avanzado de puntos, wallet, saldo ni recompensa automatica.
