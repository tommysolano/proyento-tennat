import { getRegisteredModule } from '../core/modules/moduleRegistry.js';
import { getUserAuthorizedModules } from '../core/modules/moduleAccess.js';

export async function checkModuleAccess(moduleKey, user) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({
          enabled: false,
          status: this.statusCode,
          message: payload?.message || `El modulo ${moduleKey} no esta habilitado`
        });
      }
    };
    const next = (error) => {
      if (error) reject(error);
      else resolve({ enabled: true, status: 200, message: '' });
    };
    requireModule(moduleKey)({ user }, response, next).catch(reject);
  });
}

export function requireModule(moduleKey) {
  return async (req, res, next) => {
    try {
      const normalizedModuleKey = String(moduleKey || '').trim().toLowerCase();
      const registeredModule = getRegisteredModule(normalizedModuleKey);
      if (!registeredModule) {
        return res.status(500).json({ message: `Modulo no registrado: ${normalizedModuleKey}` });
      }

      if (req.user?.role === 'SUPERADMIN') return next();
      const enabledModules = await getUserAuthorizedModules(req.user);
      if (enabledModules.includes(normalizedModuleKey)) return next();
      return res.status(403).json({
        message: `El modulo ${normalizedModuleKey} no esta autorizado para esta cuenta`
      });
    } catch (error) {
      next(error);
    }
  };
}
