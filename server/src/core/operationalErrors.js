// reasonCodes OPERATIVOS: errores cuyo mensaje es una instruccion accionable para
// el usuario (no una fuga interna). El error handler debe conservar su mensaje
// aunque el status sea 5xx (el mensaje ya nace sanitizado). Mantener en sync con
// los `code: '...'` que se lanzan en el codigo.
export const OPERATIONAL_REASON_CODES = new Set([
  // WhatsApp QR
  'WHATSAPP_QR_DISABLED',
  'WHATSAPP_QR_SESSION_BUSY',
  'WHATSAPP_QR_SESSION_LIMIT',
  'WHATSAPP_QR_NOT_CONNECTED',
  'WHATSAPP_QR_RUNTIME_UNAVAILABLE',
  'WHATSAPP_QR_SEND_FAILED',
  'WHATSAPP_QR_ALREADY_AUTHENTICATED',
  'WHATSAPP_QR_MEDIA_NOT_STORED',
  'WHATSAPP_QR_TEMPLATES_UNSUPPORTED',
  'WHATSAPP_QR_TYPE_UNSUPPORTED',
  // WhatsApp Cloud / credenciales
  'WHATSAPP_CREDENTIALS_MISSING',
  'WHATSAPP_PHONE_REQUIRED',
  'CREDENTIALS_ENCRYPTION_KEY_MISSING',
  // Media
  'MEDIA_TOO_LARGE',
  'MEDIA_EMPTY',
  'MEDIA_MIME_REQUIRED',
  'MEDIA_TYPE_NOT_ALLOWED',
  'MEDIA_EXTENSION_MISMATCH',
  'MEDIA_EXTENSION_NOT_ALLOWED',
  'LOCAL_SIGNED_URL_DISABLED',
  // Uso / suscripcion / perfil
  'USAGE_LIMIT_REACHED',
  'USAGE_SUBSCRIPTION_REQUIRED',
  'PROFILE_OVERWRITE_CONFIRMATION_REQUIRED'
]);

export function isOperationalReasonCode(code) {
  return typeof code === 'string' && OPERATIONAL_REASON_CODES.has(code);
}
