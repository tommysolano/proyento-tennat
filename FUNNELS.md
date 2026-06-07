# Funnels

## Dominio

`Funnel` usa slug global, tracking, redirect por defecto y step de entrada.
`FunnelStep` usa slug unico dentro del funnel, orden, estado y tipos landing,
form, survey, booking, thank_you y redirect.

Todas las referencias se validan contra la misma empresa. Un step no puede
publicarse sin la landing, form, survey, booking o URL requerida por su tipo.

## API

Privada:

- `GET/POST /api/funnels`
- `GET/PATCH /api/funnels/:id`
- `PATCH /api/funnels/:id/publish|pause|archive`
- `GET/POST /api/funnels/:id/steps`
- `GET/PATCH /api/funnel-steps/:id`
- `PATCH /api/funnel-steps/:id/publish|archive`
- `GET /api/funnels/:id/analytics`

Publica:

- `GET /api/public/funnels/:funnelSlug`
- `GET /api/public/funnels/:funnelSlug/:stepSlug`
- `POST /api/public/funnels/:funnelSlug/:stepSlug/events`

## Conversiones

Cada vista identifica funnel y step. Forms reciben los slugs de origen y
BookingLink los verifica al crear cita. Se registran `page_view`,
`form_submission`, `booking_created`, `contact_created`,
`opportunity_created` y `button_click`.

Analytics agrega vistas, conversiones, submissions, contactos,
oportunidades, conversion rate y abandono por step.

## Pendiente

No hay checkout, pagos, dominios reales, A/B testing, editor visual avanzado,
webhooks externos ni acciones de mensajes.
