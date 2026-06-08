# Referidos

## Modelos

`ReferralProgram` usa slug global y estados draft/active/paused/archived.
`Referral` vincula referente, contacto referido, codigo, conversion y
recompensa manual.

## Flujo publico

`/ref/:programSlug/:code` carga solo descripcion publica. El submit crea o
reutiliza un contacto dentro de la empresa resuelta por el programa, sin
aceptar IDs de tenant desde el navegador.

## Rutas

- `GET /api/public/referrals/:programSlug/:code`
- `POST /api/public/referrals/:programSlug/:code/submit`

La recompensa puede marcarse approved, paid_manually o cancelled. No realiza
pagos ni transferencias.
