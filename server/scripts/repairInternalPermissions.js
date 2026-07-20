import mongoose from 'mongoose';
import { loadEnv } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import {
  ROLE_MINIMUM_PERMISSIONS,
  defaultPermissionsForRole
} from '../src/core/permissions/permissions.js';

/**
 * Repara SUPERVISOR/CALLCENTER cuyo array de permisos persistido quedo vacio o
 * incompleto respecto al minimo operativo del rol (p.ej. sin
 * `opportunities:read_team`, lo que rompe el calendario y otras vistas).
 *
 * Reglas (idempotente, no destructivo):
 *   - permissions ausente (undefined): se deja tal cual. Un array ausente ya
 *     resuelve a los defaults completos del rol; no hace falta materializarlo.
 *   - permissions === []: se restaura a los defaults completos del rol.
 *   - permissions incompleto respecto al minimo: se AGREGAN los permisos minimos
 *     que falten, conservando el resto de la seleccion (no se quita nada).
 *   - permissions con todo el minimo: se deja intacto (respeta personalizaciones).
 *
 * Uso:  node scripts/repairInternalPermissions.js            (simulacion)
 *       node scripts/repairInternalPermissions.js --execute  (aplica cambios)
 */
loadEnv();

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI es requerida');
const execute = process.argv.includes('--execute');

export function planRepair(user) {
  const { role } = user;
  const minimum = ROLE_MINIMUM_PERMISSIONS[role];
  if (!minimum) return null; // rol sin minimo definido (ADMIN, etc.)
  if (!Array.isArray(user.permissions)) return null; // undefined = defaults dinamicos

  if (user.permissions.length === 0) {
    return { reason: 'array vacio -> defaults del rol', permissions: defaultPermissionsForRole(role) };
  }

  const missing = minimum.filter((permission) => !user.permissions.includes(permission));
  if (missing.length === 0) return null;

  return {
    reason: `faltan ${missing.length} permisos minimos`,
    missing,
    permissions: Array.from(new Set([...user.permissions, ...missing]))
  };
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({
    role: { $in: ['SUPERVISOR', 'CALLCENTER'] }
  }).select('email role permissions');

  let repaired = 0;
  let skipped = 0;
  for (const user of users) {
    const plan = planRepair(user);
    if (!plan) {
      skipped += 1;
      continue;
    }
    repaired += 1;
    console.log(
      `${execute ? 'REPARANDO' : 'SIMULA  '}  ${user.role.padEnd(10)} ${user.email}  (${plan.reason})`
    );
    if (execute) {
      user.permissions = plan.permissions;
      await user.save();
    }
  }

  console.log(
    `\n${execute ? 'Aplicado' : 'Simulacion'}: ${repaired} usuario(s) a reparar, ${skipped} sin cambios.`
  );
  if (!execute && repaired > 0) {
    console.log('Ejecuta con --execute para aplicar los cambios.');
  }
  await mongoose.disconnect();
}

// Solo corre si se invoca directamente (permite importar planRepair en tests).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('repairInternalPermissions.js')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
