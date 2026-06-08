# Resenas y testimonios

## Flujo

1. Un usuario con permiso crea `ReviewRequest`.
2. El contacto abre `/r/:token`.
3. La respuesta crea `Review` en estado `new`.
4. ADMIN aprueba, rechaza, publica, archiva o responde.
5. Una review aprobada puede convertirse en `Testimonial`.
6. `ReviewWidget` publica solo reviews y testimonios aprobados.

Estados y campos estan definidos en `ReviewRequest`, `Review`,
`Testimonial` y `ReviewWidget`.

## Rutas publicas

- `GET /api/public/reviews/request/:token`
- `POST /api/public/reviews/request/:token/submit`
- `GET /api/public/review-widgets/:slug`

Los canales `whatsapp_planned`, `email_planned` y `sms_planned` no envian
mensajes. Solo registran la intencion y el link manual.
