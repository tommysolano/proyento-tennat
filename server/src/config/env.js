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
  const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim());

  if (missingVariables.length) {
    throw new Error(`Variables de entorno requeridas: ${missingVariables.join(', ')}`);
  }
}
