# Superficie publica

## URLs

- Formulario: `/forms/:slug`
- Landing page: `/p/:slug`
- Funnel: `/f/:funnelSlug/:stepSlug`
- Booking existente: `/book/:slug`

Los slugs solo admiten minusculas, numeros y guiones. Form, LandingPage y
Funnel usan unicidad global; FunnelStep es unico dentro del funnel.

## Resolucion tenant

Las rutas no requieren JWT y no aceptan tenant desde el cliente. El backend
resuelve `companyId` y `distributorId` por slug, exige empresa activa o trial,
modulo habilitado y recurso publicado.

Los slugs de origen enviados por forms o bookings se vuelven a consultar y
deben referenciar el recurso exacto del mismo tenant. IDs arbitrarios del
cliente no se usan para tracking.

## Datos y privacidad

- IP guardada como SHA-256 con salt.
- User agent truncado a 300 caracteres.
- Referrer limitado a HTTP/HTTPS.
- UTM, session y visitor IDs sanitizados.
- Sin integraciones, metadata interna, mappings ni secretos en respuestas.
- Payload de form maximo 64 KB y 50 campos.

## Rate limit y contenido

Forms aplican limites separados de lectura y submit por slug/IP. Landings y
funnels aplican limite de lectura/eventos. El HTML publico usa una lista
limitada de etiquetas y elimina scripts, estilos, handlers y URLs
`javascript:`.

## Alcance pendiente

No hay CAPTCHA, CDN, SSR, custom domains reales, cookies de atribucion
avanzada ni A/B testing. Visitor y session IDs son identificadores tecnicos,
no autenticacion.

## Rutas publicas Fase 10

- `/r/:token`: formulario de review individual.
- `/widgets/reviews/:slug`: reviews y testimonios publicados.
- `/surveys/:slug`: encuesta NPS, CSAT o custom.
- `/ref/:programSlug/:code`: captura basica de referido.

Todas aplican rate limit y resuelven empresa desde identificadores publicos.
Una landing puede incluir `review_widget_embed`; el payload reemplaza el
ObjectId por el slug publicado.
