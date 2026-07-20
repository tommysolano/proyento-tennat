const FRIENDLY_PERMISSION_MESSAGE =
  'No tienes acceso a esta seccion. Si crees que deberias, pide a tu administrador que revise tus permisos.';
const FRIENDLY_MODULE_MESSAGE =
  'Esta funcion no esta incluida en el plan o la configuracion actual.';

// Firmas de mensajes tecnicos del backend que no deben mostrarse tal cual al
// usuario (exponen claves de permiso o de modulo).
const PERMISSION_PATTERNS = [
  /no tienes (ninguno de los )?permisos?/i,
  /no tienes el permiso requerido/i,
  /no tienes permisos para esta accion/i
];
const MODULE_PATTERN = /el modulo .* no esta (autorizado|habilitado)/i;

/**
 * Convierte el mensaje de error de una peticion en algo legible para una
 * persona. Los 403 de permisos/modulo del backend traen claves tecnicas
 * (`opportunities:read_team`, `El modulo calendar...`) que no aportan nada al
 * usuario final; se reemplazan por un texto humano. El resto de errores
 * (red, validacion) se conservan.
 *
 * Acepta un Error (con `.status`/`.message`) o un string.
 */
export function friendlyErrorMessage(input) {
  if (!input) return '';
  const status = typeof input === 'object' ? input.status : undefined;
  const message = typeof input === 'string' ? input : input.message || '';

  if (MODULE_PATTERN.test(message)) return FRIENDLY_MODULE_MESSAGE;
  if (status === 403 || PERMISSION_PATTERNS.some((pattern) => pattern.test(message))) {
    return FRIENDLY_PERMISSION_MESSAGE;
  }
  return message;
}
