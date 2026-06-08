# Formularios y encuestas

## Modelos

`Form` pertenece a una empresa, usa slug global y estados `draft`,
`published`, `paused` y `archived`. Admite hasta 50 campos de texto, email,
telefono, numero, fecha, select, multiselect, checkbox, radio, boolean,
hidden y consent.

`FormSubmission` conserva valores sanitizados, origen, relaciones CRM,
consentimiento, IP hasheada, user agent truncado, UTM, spam y error
sanitizado. `normalizedValues` no se selecciona por defecto.

## API

Privada:

- `GET/POST /api/forms`
- `GET/PATCH /api/forms/:id`
- `PATCH /api/forms/:id/publish|pause|archive`
- `GET /api/forms/:id/submissions`
- `GET /api/forms/:id/analytics`

Publica:

- `GET /api/public/forms/:slug`
- `POST /api/public/forms/:slug/submit`

La respuesta publica omite IDs internos, mappings, usuarios, tags,
integraciones y metadata.

## Validacion y anti-spam

El backend limita el payload a 64 KB, valida required, email, telefono,
numero, fecha, opciones y consentimiento. Las keys peligrosas y secretos se
descartan. El HTML se convierte en texto.

Cada GET genera un token HMAC con timestamp. El POST aplica rate limit por
slug/IP, honeypot, token firmado y `minimumSubmitTimeMs`. Un fallo se guarda
como `spam` y no toca CRM. CAPTCHA queda pendiente.

## CRM y workflows

`settings.fieldMappings` apunta a campos estandar o custom fields de Contact
y Opportunity. Se validan tenant y compatibilidad basica de tipos. Las
submissions pueden crear/actualizar contacto, aplicar tags, asignar usuario y
crear oportunidad.

Eventos: `form.created`, `form.published`, `form.submitted`,
`form.submission_processed`, `form.spam_detected`, `form.contact_created`,
`form.opportunity_created` y `survey.submitted`.

## Analytics y limites

Metricas: vistas, submissions, procesados, spam, ignorados, fallidos,
contactos, oportunidades y conversion rate. Medidores: `forms`,
`form_submissions` y `conversions`.

## Integracion Fase 10

Una submission puede disparar workflows existentes. La accion futura
`coupon.issue` esta catalogada como planned; forms no emite cupones
directamente ni acepta configuracion de pagos.
