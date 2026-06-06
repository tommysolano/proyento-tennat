import jwt from 'jsonwebtoken';
import { Company } from '../models/Company.js';
import { Distributor } from '../models/Distributor.js';
import { User } from '../models/User.js';

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token requerido' });
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);

    if (!user || user.status !== 'active') {
      return res.status(401).json({ message: 'Usuario no autorizado' });
    }

    if (user.role !== 'SUPERADMIN' && user.distributorId) {
      const distributor = await Distributor.findById(user.distributorId).select('status');
      if (!distributor || !['active', 'trial'].includes(distributor.status)) {
        return res.status(403).json({
          message: `El distribuidor esta ${distributor?.status || 'no disponible'}`
        });
      }
    }

    if (['ADMIN', 'SUPERVISOR', 'CALLCENTER'].includes(user.role)) {
      const company = await Company.findById(user.companyId).select('status');
      const endingImpersonation = req.originalUrl.endsWith('/auth/impersonation/end');
      if (
        !endingImpersonation &&
        (!company || ['suspended', 'cancelled', 'inactive'].includes(company.status))
      ) {
        return res.status(403).json({
          message: 'La empresa esta suspendida. Contacta a tu distribuidor.'
        });
      }
    }

    req.auth = payload;
    req.impersonation = payload.impersonatedBy || null;
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalido o expirado' });
  }
}
