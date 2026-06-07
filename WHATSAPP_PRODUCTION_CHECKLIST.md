# Checklist de produccion WhatsApp

## Meta y credenciales

- [ ] Crear la Meta App en la cuenta empresarial correcta.
- [ ] Vincular o crear WhatsApp Business Account.
- [ ] Registrar y verificar el numero.
- [ ] Obtener `phoneNumberId`.
- [ ] Generar un access token con permisos minimos y expiracion conocida.
- [ ] Registrar `appSecret`.
- [ ] Generar un `verifyToken` propio, largo y aleatorio.
- [ ] Configurar `CREDENTIALS_ENCRYPTION_KEY` en secret manager.
- [ ] Guardar el canal desde `/inbox/channels` sin compartir secretos.
- [ ] Confirmar si el canal esta en sandbox o produccion.

## Webhook

- [ ] Publicar API por HTTPS con certificado valido.
- [ ] Configurar la URL exacta mostrada por Channel Settings.
- [ ] Activar `REQUIRE_WEBHOOK_SIGNATURE=true`.
- [ ] Validar el challenge GET con Meta.
- [ ] Enviar payload test firmado.
- [ ] Confirmar `lastWebhookAt`.
- [ ] Verificar que una firma invalida devuelve 403 y crea alerta sanitizada.

## Pruebas funcionales

- [ ] Ejecutar Diagnostico y resolver todos los errores.
- [ ] Probar `Probar con Meta`; no aceptar una validacion solo local.
- [ ] Enviar un mensaje outbound real a numero autorizado.
- [ ] Recibir un mensaje inbound real.
- [ ] Recibir imagen/documento y confirmar media `available`.
- [ ] Probar retry de media fallida.
- [ ] Confirmar status `sent`.
- [ ] Confirmar status `delivered`.
- [ ] Confirmar status `read`.
- [ ] Forzar un status `failed` y revisar error/alerta.
- [ ] Repetir webhook y confirmar idempotencia.

## Operacion y limites

- [ ] Revisar `/ops`, jobs pending/failed/dead y worker activo.
- [ ] Probar replay de un job controlado.
- [ ] Reconocer una alerta de prueba.
- [ ] Configurar limites de mensajes, media, archivos y conversaciones.
- [ ] Probar bloqueo al alcanzar cuota.
- [ ] Confirmar que empresas suspendidas no operan.
- [ ] Validar realtime y fallback manual.

## Seguridad y rollback

- [ ] Revisar logs sin tokens, secretos, payloads ni storage keys.
- [ ] Confirmar que uploads no se sirven como static.
- [ ] Probar acceso autorizado y denegado a media.
- [ ] Configurar backup de MongoDB y storage.
- [ ] Rotar un token de prueba desde Channel Settings.
- [ ] Ejecutar dry-run del script de master key en una copia.
- [ ] Definir responsable, ventana y rollback de credenciales.
- [ ] Mantener la clave anterior durante la ventana de rollback.
- [ ] Documentar como desactivar canal, worker o firma ante incidente.
- [ ] Antes de trafico abierto, agregar antivirus, retencion y storage cloud.
