// Mapea reasonCodes operativos del backend a mensajes accionables para la UI del
// QR. El detalle de configuracion (.env) solo se muestra a SUPERADMIN; a ADMIN se
// le da una version sin secretos de infraestructura.

const MESSAGES = {
  WHATSAPP_QR_DISABLED: {
    admin: 'La conexion por QR esta desactivada en el servidor. Pide a tu proveedor que la habilite.',
    superadmin:
      'El proveedor QR esta desactivado. Configura WHATSAPP_QR_ENABLED=true y CREDENTIALS_ENCRYPTION_KEY (32+ caracteres) en server/.env y reinicia el servidor.'
  },
  WHATSAPP_QR_SESSION_BUSY: {
    admin: 'La sesion esta ocupada o activa en otra instancia. Espera unos segundos y reintenta.',
    superadmin: 'La sesion tiene un lease vivo (otra instancia o proceso). Espera a que expire o revisa el runtime.'
  },
  WHATSAPP_QR_SESSION_LIMIT: {
    admin: 'Se alcanzo el limite de conexiones QR activas. Desconecta alguna antes de continuar.',
    superadmin: 'Limite WHATSAPP_QR_MAX_ACTIVE_SESSIONS alcanzado. Ajusta el limite o libera sesiones.'
  },
  WHATSAPP_QR_NOT_CONNECTED: {
    admin: 'El numero no esta conectado. Vinculalo escaneando el QR antes de enviar.',
    superadmin: 'La sesion no esta en estado connected. Reinicia la conexion y escanea el QR.'
  },
  WHATSAPP_QR_RUNTIME_UNAVAILABLE: {
    admin: 'La conexion no esta activa en este momento. Pulsa "Reconectar".',
    superadmin: 'No hay runtime del socket en esta instancia (posible lease de un proceso muerto). Reconecta.'
  },
  CREDENTIALS_ENCRYPTION_KEY_MISSING: {
    admin: 'Falta configuracion de seguridad en el servidor. Contacta a tu proveedor.',
    superadmin: 'Falta CREDENTIALS_ENCRYPTION_KEY en server/.env. Sin ella no se puede cifrar el authState del QR.'
  }
};

/**
 * Devuelve un mensaje accionable a partir de un error de la API. Si el reasonCode
 * es conocido, usa la guia; si no, cae al mensaje del backend.
 */
export function whatsappQrErrorMessage(error, { isSuperAdmin = false } = {}) {
  const entry = error?.reasonCode ? MESSAGES[error.reasonCode] : null;
  if (entry) return isSuperAdmin ? entry.superadmin : entry.admin;
  return error?.message || 'No se pudo completar la operacion.';
}
