import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(currentDir, '../..');
const projectRoot = resolve(serverRoot, '..');

export function loadEnv() {
  dotenv.config({ path: resolve(serverRoot, '.env') });
  dotenv.config({ path: resolve(projectRoot, '.env') });
}

export function validateEnv({ requireSuperAdmin = false } = {}) {
  const requiredVariables = ['MONGODB_URI', 'JWT_SECRET'];
  if (process.env.NODE_ENV === 'production') {
    requiredVariables.push(
      'CREDENTIALS_ENCRYPTION_KEY',
      'CLIENT_URL',
      'SUPERADMIN_EMAIL',
      'SUPERADMIN_PASSWORD'
    );
  }
  if (requireSuperAdmin) requiredVariables.push('SUPERADMIN_EMAIL', 'SUPERADMIN_PASSWORD');
  const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim());

  if (missingVariables.length) {
    throw new Error(`Variables de entorno requeridas: ${missingVariables.join(', ')}`);
  }
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.CREDENTIALS_ENCRYPTION_KEY.trim().length < 32
  ) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY debe tener al menos 32 caracteres');
  }
  if (
    (process.env.NODE_ENV === 'production' || requireSuperAdmin) &&
    process.env.SUPERADMIN_PASSWORD?.length < 12
  ) {
    throw new Error('SUPERADMIN_PASSWORD debe tener al menos 12 caracteres');
  }

  for (const [name, fallback] of [
    ['JOB_WORKER_CONCURRENCY', 2],
    ['JOB_MAX_ATTEMPTS', 5],
    ['WHATSAPP_QR_MAX_SESSIONS_PER_COMPANY', 5],
    ['WHATSAPP_QR_MAX_ACTIVE_SESSIONS', 20],
    ['WHATSAPP_QR_RESTORE_LIMIT', 10],
    ['WHATSAPP_QR_QR_TTL_SECONDS', 60],
    ['WHATSAPP_QR_SESSION_LEASE_SECONDS', 90],
    ['WHATSAPP_QR_MAX_RECONNECT_ATTEMPTS', 5],
    ['WHATSAPP_QR_RECONNECT_BASE_MS', 2000],
    ['WHATSAPP_QR_RECONNECT_MAX_MS', 60000]
  ]) {
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} debe ser un entero mayor que cero`);
    }
  }
}
