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

export function validateEnv() {
  const requiredVariables = ['MONGODB_URI', 'JWT_SECRET'];
  if (process.env.NODE_ENV === 'production') {
    requiredVariables.push('CREDENTIALS_ENCRYPTION_KEY');
  }
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

  for (const [name, fallback] of [
    ['JOB_WORKER_CONCURRENCY', 2],
    ['JOB_MAX_ATTEMPTS', 5]
  ]) {
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} debe ser un entero mayor que cero`);
    }
  }
}
