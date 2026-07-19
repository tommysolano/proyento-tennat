import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import {
  evaluateImpersonation,
  impersonationTargetScope
} from '../core/permissions/impersonationScope.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { Company } from '../models/Company.js';
import { Distributor } from '../models/Distributor.js';
import { User } from '../models/User.js';
import { recordActivity } from '../utils/activity.js';
import { getDashboardPath } from '../utils/dashboardPath.js';
import { buildSessionAccess, buildSessionTenant } from '../utils/sessionContext.js';
import { isValidObjectId } from '../utils/validation.js';

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    message: 'Demasiados intentos de inicio de sesion. Intenta nuevamente en 15 minutos.'
  }
});

function signToken(user, extraPayload = {}, expiresIn = process.env.JWT_EXPIRES_IN || '7d') {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      ...extraPayload
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y password son requeridos' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Credenciales invalidas' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Usuario inactivo' });
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
      if (!company || ['suspended', 'cancelled', 'inactive'].includes(company.status)) {
        return res.status(403).json({
          message: 'La empresa esta suspendida. Contacta a tu distribuidor.'
        });
      }
    }

    const token = signToken(user);
    res.json({
      token,
      user: user.toJSON(),
      tenant: await buildSessionTenant(user),
      access: await buildSessionAccess(user),
      redirectPath: getDashboardPath(user.role)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  res.json({
    user: req.user,
    tenant: await buildSessionTenant(req.user),
    access: await buildSessionAccess(req.user),
    redirectPath: getDashboardPath(req.user.role),
    impersonation: req.impersonation
  });
});

/**
 * Resuelve el usuario objetivo desde el cuerpo de la peticion.
 *
 * `targetUserId` es la forma directa. `companyId` y `distributorId` se
 * mantienen por compatibilidad con los flujos existentes y resuelven,
 * respectivamente, al ADMIN de la empresa y al DISTRIBUTOR de la cartera.
 */
async function resolveImpersonationTarget(rootActor, body) {
  if (body.targetUserId !== undefined) {
    if (!isValidObjectId(body.targetUserId)) {
      throw Object.assign(new Error('targetUserId valido es requerido'), { status: 400 });
    }
    return { targetUser: await User.findById(body.targetUserId), company: null };
  }

  if (body.companyId !== undefined) {
    if (!isValidObjectId(body.companyId)) {
      throw Object.assign(new Error('companyId valido es requerido'), { status: 400 });
    }

    const company = await Company.findOne({
      _id: body.companyId,
      ...(rootActor.role === 'SUPERADMIN'
        ? {}
        : { distributorId: rootActor.distributorId }),
      status: { $in: ['active', 'trial'] }
    });
    if (!company) {
      throw Object.assign(new Error('Empresa no encontrada para este distribuidor'), {
        status: 404
      });
    }

    const adminScope = {
      companyId: company._id,
      distributorId: company.distributorId,
      role: 'ADMIN',
      status: 'active'
    };
    let targetUser = company.adminId
      ? await User.findOne({ _id: company.adminId, ...adminScope })
      : null;
    if (!targetUser) {
      targetUser = await User.findOne(adminScope).sort({ createdAt: 1 });
    }
    if (targetUser && String(company.adminId || '') !== String(targetUser._id)) {
      await Company.updateOne(
        { _id: company._id, distributorId: company.distributorId },
        { $set: { adminId: targetUser._id } }
      );
    }
    return { targetUser, company };
  }

  if (body.distributorId !== undefined) {
    if (!isValidObjectId(body.distributorId)) {
      throw Object.assign(new Error('distributorId valido es requerido'), { status: 400 });
    }

    const distributor = await Distributor.findOne({
      _id: body.distributorId,
      status: { $in: ['active', 'trial'] }
    });
    if (!distributor) {
      throw Object.assign(new Error('Distribuidor activo no encontrado'), { status: 404 });
    }

    const targetUser = await User.findOne({
      distributorId: distributor._id,
      role: 'DISTRIBUTOR',
      status: 'active'
    }).sort({ createdAt: 1 });
    return { targetUser, company: null };
  }

  throw Object.assign(
    new Error('Debes enviar targetUserId, companyId o distributorId'),
    { status: 400 }
  );
}

router.get('/impersonation/targets', authMiddleware, async (req, res, next) => {
  try {
    // El alcance se evalua SIEMPRE contra el actor raiz de la cadena.
    const rootActor = req.impersonator || req.user;
    const scope = impersonationTargetScope(rootActor);
    if (!scope) {
      return res.status(403).json({ message: 'Tu rol no puede iniciar una impersonacion' });
    }

    const filters = { ...scope };
    if (req.query.companyId) {
      if (!isValidObjectId(req.query.companyId)) {
        return res.status(400).json({ message: 'companyId invalido' });
      }
      filters.companyId = req.query.companyId;
    }
    if (req.query.distributorId) {
      if (!isValidObjectId(req.query.distributorId)) {
        return res.status(400).json({ message: 'distributorId invalido' });
      }
      filters.distributorId = req.query.distributorId;
    }
    if (req.query.role) {
      const role = String(req.query.role).toUpperCase();
      if (!scope.role.$in.includes(role)) {
        return res.status(400).json({ message: 'role fuera del alcance permitido' });
      }
      filters.role = role;
    }
    if (req.query.search) {
      const search = String(req.query.search).trim().slice(0, 80);
      if (search) {
        const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filters.$or = [{ name: pattern }, { email: pattern }];
      }
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const users = await User.find(filters)
      .select('name email role status companyId distributorId')
      .populate('companyId', 'name status')
      .populate('distributorId', 'name status')
      .sort({ role: 1, name: 1 })
      .limit(limit);

    res.json({
      actor: {
        id: rootActor._id.toString(),
        name: rootActor.name,
        email: rootActor.email,
        role: rootActor.role
      },
      users
    });
  } catch (error) {
    next(error);
  }
});

router.post('/impersonate', authMiddleware, async (req, res, next) => {
  try {
    // Desde una sesion ya impersonada no se anida: se cambia de objetivo
    // conservando el actor raiz, que es quien concede el alcance.
    const rootActor = req.impersonator || req.user;
    const chained = Boolean(req.impersonation?.id);

    const { targetUser, company: resolvedCompany } = await resolveImpersonationTarget(
      rootActor,
      req.body || {}
    );

    const company =
      resolvedCompany ||
      (targetUser?.companyId
        ? await Company.findById(targetUser.companyId).select('status distributorId')
        : null);
    const distributor = targetUser?.distributorId
      ? await Distributor.findById(targetUser.distributorId).select('status')
      : null;

    const decision = evaluateImpersonation({
      actor: rootActor,
      target: targetUser,
      company,
      distributor
    });
    if (!decision.ok) {
      return res.status(decision.status).json({ message: decision.message });
    }

    const companyId = targetUser.companyId || null;
    const distributorId = targetUser.distributorId || null;

    await recordActivity({
      user: rootActor,
      type: 'impersonation_started',
      companyId,
      distributorId,
      summary: `Impersonacion iniciada como ${targetUser.email}`,
      metadata: {
        targetUserId: targetUser._id,
        targetRole: targetUser.role,
        targetEmail: targetUser.email,
        companyId,
        distributorId,
        chained,
        previousUserId: chained ? req.user._id : null,
        previousRole: chained ? req.user.role : null,
        rootActorId: rootActor._id,
        rootActorRole: rootActor.role,
        rootActorEmail: rootActor.email
      }
    });

    // En una cadena se reutiliza el mismo `impersonatedBy` raiz para que
    // terminar la impersonacion siempre devuelva al actor original.
    const impersonatedBy = req.impersonation || {
      id: rootActor._id.toString(),
      name: rootActor.name,
      email: rootActor.email,
      role: rootActor.role,
      distributorId: rootActor.distributorId || null,
      companyId: rootActor.companyId || null
    };
    const token = signToken(targetUser, { impersonatedBy }, '30m');
    res.json({
      token,
      user: targetUser,
      tenant: await buildSessionTenant(targetUser),
      access: await buildSessionAccess(targetUser),
      redirectPath: getDashboardPath(targetUser.role),
      impersonatedBy,
      chained,
      expiresIn: '30m'
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    next(error);
  }
});

router.post('/impersonation/end', authMiddleware, async (req, res, next) => {
  try {
    if (!req.impersonation?.id) {
      return res.status(400).json({ message: 'No hay una impersonacion activa' });
    }

    const actor = req.impersonator || (await User.findById(req.impersonation.id));
    if (actor) {
      await recordActivity({
        user: actor,
        type: 'impersonation_ended',
        companyId: req.user.companyId,
        distributorId: req.user.distributorId,
        summary: `Impersonacion finalizada sobre ${req.user.email}`,
        metadata: {
          targetUserId: req.user._id,
          targetRole: req.user.role,
          targetEmail: req.user.email,
          rootActorId: actor._id,
          rootActorRole: actor.role,
          rootActorEmail: actor.email
        }
      });
    }

    res.json({
      message: 'Impersonacion finalizada',
      actor: actor
        ? {
            id: actor._id.toString(),
            name: actor.name,
            email: actor.email,
            role: actor.role
          }
        : null
    });
  } catch (error) {
    next(error);
  }
});

export default router;
