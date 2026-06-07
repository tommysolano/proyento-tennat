# Landing Pages

## Modelo y builder

`LandingPage` usa slug global, estados de publicacion, SEO basico, colores,
tracking y secciones ordenadas. El builder MVP soporta hero, text, image,
button, form embed, booking embed, FAQ y HTML limitado. No existe drag and
drop ni layout libre.

Las referencias a Form y BookingLink se validan contra `companyId` tanto al
guardar como al publicar.

## API

Privada:

- `GET/POST /api/landing-pages`
- `GET/PATCH /api/landing-pages/:id`
- `PATCH /api/landing-pages/:id/publish|pause|archive`
- `GET /api/landing-pages/:id/analytics`

Publica:

- `GET /api/public/pages/:slug`
- `POST /api/public/pages/:slug/events`

El GET registra una vista cuando `trackingEnabled=true`. Events solo acepta
`button_click`. Los IDs de embeds se convierten a slugs publicos.

## Seguridad y analytics

HTML limitado elimina scripts, estilos, handlers y protocolos JavaScript.
URLs solo aceptan HTTP, HTTPS o rutas relativas. La ruta publica verifica
empresa activa, modulo y estado publicado.

Analytics devuelve visitas, conversiones, formularios enviados y conversion
rate. Los limites usan `landingPages` y `pageViewsPerMonth`.
