import jwt from 'jsonwebtoken';
import { Company } from '../models/Company.js';
import { Distributor } from '../models/Distributor.js';
import { User } from '../models/User.js';

async function validateImpersonation(payload, targetUser, { allowInactiveCompany = false } = {}) {
  if (!payload.impersonatedBy?.id) return null;

  const actor = await User.findOne({
    _id: payload.impersonatedBy.id,
    status: 'active'
  });
  if (!actor || actor.role !== payload.impersonatedBy.role) {
    throw Object.assign(new Error('La sesion delegada ya no es valida'), { status: 401 });
  }

  if (actor.role === 'SUPERADMIN') {
    if (targetUser.role !== 'DISTRIBUTOR') {
      throw Object.assign(new Error('Alcance de impersonacion invalido'), { status: 403 });
    }
    return actor;
  }

  if (actor.role !== 'DISTRIBUTOR' || targetUser.role !== 'ADMIN') {
    throw Object.assign(new Error('Alcance de impersonacion invalido'), { status: 403 });
  }
  if (
    !actor.distributorId ||
    String(actor.distributorId) !== String(targetUser.distributorId)
  ) {
    throw Object.assign(new Error('La empresa no pertenece al distribuidor delegado'), {
      status: 403
    });
  }

  const company = await Company.exists({
    _id: targetUser.companyId,
    distributorId: actor.distributorId,
    ...(allowInactiveCompany ? {} : { status: { $in: ['active', 'trial'] } })
  });
  if (!company) {
    throw Object.assign(new Error('La empresa delegada ya no esta disponible'), { status: 403 });
  }
  return actor;
}

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token requerido' });
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    const endingImpersonation = req.originalUrl.endsWith('/auth/impersonation/end');

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
      if (
        !endingImpersonation &&
        (!company || ['suspended', 'cancelled', 'inactive'].includes(company.status))
      ) {
        return res.status(403).json({
          message: 'La empresa esta suspendida. Contacta a tu distribuidor.'
        });
      }
    }

    const impersonator = await validateImpersonation(payload, user, {
      allowInactiveCompany: endingImpersonation
    });
    req.auth = payload;
    req.impersonation = payload.impersonatedBy || null;
    req.impersonator = impersonator;
    req.user = user;
    next();
  } catch (error) {
    return res.status(error.status || 401).json({
      message: error.status ? error.message : 'Token invalido o expirado'
    });
  }
}
