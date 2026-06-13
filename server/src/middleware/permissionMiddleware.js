import { hasUserPermission } from '../core/permissions/permissions.js';

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    if (!hasUserPermission(req.user, permission)) {
      return res.status(403).json({
        message: `No tienes el permiso requerido: ${permission}`
      });
    }

    next();
  };
}

export function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Usuario no autenticado' });
    if (!permissions.some((permission) => hasUserPermission(req.user, permission))) {
      return res.status(403).json({
        message: `No tienes ninguno de los permisos requeridos: ${permissions.join(', ')}`
      });
    }
    next();
  };
}
