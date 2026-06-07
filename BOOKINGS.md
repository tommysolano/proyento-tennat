# Reservas publicas

## Enlaces

Un `BookingLink` pertenece a un calendario y define:

- slug global unico;
- titulo, descripcion y estado publico;
- campos permitidos: `name`, `email`, `phone`, `notes`;
- aprobacion requerida o confirmacion inmediata;
- mensaje final y redirect HTTP/HTTPS opcional.

ADMIN administra enlaces desde `/calendar/settings`. `calendar` y `bookings`
deben estar habilitados para que el enlace responda.

## API publica

- `GET /api/public/bookings/:slug`
- `GET /api/public/bookings/:slug/availability`
- `POST /api/public/bookings/:slug/appointments`

La variante singular `/api/public/booking/*` se conserva como alias.

La UI publica vive en `/book/:slug`. No requiere JWT y solo expone nombre de
empresa, datos publicos del calendario, campos permitidos y slots.

## Flujo

1. El backend resuelve enlace, empresa activa y calendario activo.
2. Calcula disponibilidad sin aceptar `companyId`, responsable o contacto del
   navegador.
3. Busca el contacto por email o telefono dentro de la empresa, o lo crea con
   origen `Reserva publica`.
4. Ignora campos no permitidos y usa la duracion configurada del calendario.
5. Comprueba nuevamente disponibilidad, solapamiento y limite de citas.
6. En calendarios de equipo selecciona internamente un responsable libre.
7. Crea la cita, notifica al responsable y programa el recordatorio.

Si `requireApproval=true`, la cita queda `scheduled`; de lo contrario queda
`confirmed`.

## Seguridad

- rate limit general y limite mas estricto para creacion;
- tenant derivado exclusivamente del slug persistido;
- URL de redirect restringida a HTTP/HTTPS;
- mensajes de error sin credenciales ni payloads internos;
- validacion de email, fechas, contacto y cuota en backend;
- dos contactos distintos para email y telefono producen conflicto en vez de
  fusionarse silenciosamente.

No se implementan Google/Outlook, Zoom/Meet, pagos, webhooks de terceros ni
confirmaciones por email/SMS/WhatsApp. Las notificaciones son internas.
