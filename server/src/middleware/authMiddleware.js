import jwt from 'jsonwebtoken';
import { evaluateImpersonation } from '../core/permissions/impersonationScope.js';
import { Company } from '../models/Company.js';
import { Distributor } from '../models/Distributor.js';
import { User } from '../models/User.js';

/**
 * Revalida la delegacion en cada request contra el actor RAIZ del token.
 * Comparte las reglas de alcance con POST /api/auth/impersonate.
 */
async function validateImpersonation(
  payload,
  targetUser,
  { allowInactiveCompany = false, company = null } = {}
) {
  if (!payload.impersonatedBy?.id) return null;

  const actor = await User.findOne({
    _id: payload.impersonatedBy.id,
    status: 'active'
  });
  if (!actor || actor.role !== payload.impersonatedBy.role) {
    throw Object.assign(new Error('La sesion delegada ya no es valida'), { status: 401 });
  }

  const scopedCompany =
    company ||
    (targetUser.companyId
      ? await Company.findById(targetUser.companyId).select('status distributorId')
      : null);

  const decision = evaluateImpersonation({
    actor,
    target: targetUser,
    company: scopedCompany,
    allowInactiveCompany
  });
  if (!decision.ok) {
    throw Object.assign(new Error(decision.message), {
      status: decision.status === 404 ? 403 : decision.status
    });
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

    let company = null;
    if (['ADMIN', 'SUPERVISOR', 'CALLCENTER'].includes(user.role)) {
      company = await Company.findById(user.companyId).select('status distributorId');
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
      allowInactiveCompany: endingImpersonation,
      company
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
