# White Label

## Datos configurables

Cada distribuidor puede guardar:

- nombre comercial, logo y favicon;
- colores principal, secundario y de acento;
- fondo futuro de login;
- email y telefono de soporte;
- moneda, idioma y zona horaria;
- URLs de terminos y privacidad;
- dominio personalizado.

La sesion autenticada incluye un contexto tenant seguro. El layout usa el
nombre y logo configurados y aplica colores mediante variables CSS. Si un dato
no existe, conserva los valores visuales actuales.

## Dominio personalizado

Registrar un dominio no modifica DNS ni crea certificados. Al cambiarlo, el
backend genera un token aleatorio y deja el estado en
`pending_verification`.

Flujo futuro recomendado:

1. Normalizar y validar que el host no este asignado a otro distribuidor.
2. Pedir un TXT con el token, o un CNAME hacia el host de la plataforma.
3. Consultar DNS desde un proceso asincrono con reintentos y expiracion.
4. Marcar `verified` y guardar `verifiedAt`.
5. Provisionar TLS y resolver el distribuidor por host en un proxy seguro.
6. Marcar `failed` ante una configuracion invalida sin revelar datos ajenos.

Estados disponibles:

- `not_configured`
- `pending_verification`
- `verified`
- `failed`

La verificacion DNS, el routing por host y TLS no estan implementados en esta
fase.
