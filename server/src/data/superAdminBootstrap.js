import { User } from '../models/User.js';
import { EMAIL_PATTERN } from '../utils/validation.js';

function configurationError(message) {
  return Object.assign(new Error(message), { code: 'SUPERADMIN_CONFIGURATION_ERROR' });
}

export async function ensureSuperAdmin() {
  const name = String(process.env.SUPERADMIN_NAME || 'Programador').trim();
  const email = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.SUPERADMIN_PASSWORD || '');

  if (!email || !password) {
    throw configurationError(
      'SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD son requeridos para crear el usuario inicial'
    );
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw configurationError('SUPERADMIN_EMAIL debe ser un email valido');
  }
  if (password.length < 12) {
    throw configurationError('SUPERADMIN_PASSWORD debe tener al menos 12 caracteres');
  }

  const existing = await User.findOne({ email }).select('+password');
  if (existing) {
    if (existing.role !== 'SUPERADMIN') {
      throw configurationError(
        'SUPERADMIN_EMAIL ya pertenece a un usuario que no es SUPERADMIN'
      );
    }
    return { user: existing, created: false };
  }

  const user = await User.create({
    name: name || 'Programador',
    email,
    password,
    role: 'SUPERADMIN',
    status: 'active'
  });
  return { user, created: true };
}
