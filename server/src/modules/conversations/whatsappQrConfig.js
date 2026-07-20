import { credentialsKeyStatus } from '../../utils/credentialCrypto.js';
import { logger } from '../../utils/logger.js';

/** true si el proveedor QR esta activado por env. */
export function whatsappQrEnabled() {
  return process.env.WHATSAPP_QR_ENABLED === 'true';
}

/**
 * Estado de configuracion del proveedor QR para health/diagnostico. `ready` es
 * true solo si esta activado Y la clave de cifrado esta configurada (sin ella no
 * se puede persistir el authState cifrado). `warning` describe el problema.
 */
export function whatsappQrConfigStatus() {
  const enabled = whatsappQrEnabled();
  const key = credentialsKeyStatus();
  let warning = '';
  if (enabled && !key.configured) {
    warning = 'WHATSAPP_QR_ENABLED=true pero falta CREDENTIALS_ENCRYPTION_KEY: no se puede cifrar el authState.';
  } else if (enabled && !key.meetsRecommendedLength) {
    warning = 'CREDENTIALS_ENCRYPTION_KEY es mas corta que la longitud recomendada (32+ caracteres).';
  } else if (!enabled) {
    warning = 'WHATSAPP_QR_ENABLED no esta en true: el proveedor QR esta desactivado.';
  }
  return {
    enabled,
    credentialsKeyConfigured: key.configured,
    credentialsKeyMeetsRecommended: key.meetsRecommendedLength,
    ready: enabled && key.configured,
    warning
  };
}

/**
 * Loggea un warning claro al arrancar si el QR esta activado pero la clave de
 * cifrado falta o es debil. No lanza: el server arranca igual, pero el problema
 * queda visible en logs y en /health.
 */
export function warnWhatsAppQrConfig() {
  const status = whatsappQrConfigStatus();
  if (status.enabled && !status.credentialsKeyConfigured) {
    logger.warn('whatsapp_qr.config_invalid', {
      message: 'WHATSAPP_QR_ENABLED=true pero CREDENTIALS_ENCRYPTION_KEY no esta configurada. Las sesiones QR fallaran al cifrar el authState.'
    });
  } else if (status.enabled && !status.credentialsKeyMeetsRecommended) {
    logger.warn('whatsapp_qr.config_weak_key', {
      message: 'CREDENTIALS_ENCRYPTION_KEY tiene menos de 32 caracteres. Usa una clave mas larga en produccion.'
    });
  }
  return status;
}
