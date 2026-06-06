import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { Company } from '../models/Company.js';
import { Distributor } from '../models/Distributor.js';
import { User } from '../models/User.js';
import { recordActivity } from '../utils/activity.js';
import { getDashboardPath } from '../utils/dashboardPath.js';
import { buildSessionTenant } from '../utils/sessionContext.js';

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

function signToken(user, extraPayload = {}) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      ...extraPayload
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
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
    redirectPath: getDashboardPath(req.user.role),
    impersonation: req.impersonation
  });
});

router.post('/impersonate', authMiddleware, async (req, res, next) => {
  try {
    if (req.impersonation) {
      return res.status(409).json({ message: 'No se permite impersonacion anidada' });
    }

    let targetUser;
    let companyId = null;
    let distributorId = null;

    if (req.user.role === 'SUPERADMIN') {
      distributorId = req.body.distributorId;
      if (!distributorId) {
        return res.status(400).json({ message: 'distributorId es requerido' });
      }

      const distributor = await Distributor.findOne({
        _id: distributorId,
        status: { $in: ['active', 'trial'] }
      });
      if (!distributor) {
        return res.status(404).json({ message: 'Distribuidor activo no encontrado' });
      }

      targetUser = await User.findOne({
        distributorId,
        role: 'DISTRIBUTOR',
        status: 'active'
      }).sort({ createdAt: 1 });
    } else if (req.user.role === 'DISTRIBUTOR') {
      companyId = req.body.companyId;
      if (!companyId) {
        return res.status(400).json({ message: 'companyId es requerido' });
      }

      const company = await Company.findOne({
        _id: companyId,
        distributorId: req.user.distributorId,
        status: { $in: ['active', 'trial'] }
      });
      if (!company) {
        return res.status(404).json({ message: 'Empresa no encontrada para este distribuidor' });
      }

      distributorId = req.user.distributorId;
      targetUser = await User.findOne({
        _id: company.adminId,
        companyId: company._id,
        distributorId,
        role: 'ADMIN',
        status: 'active'
      });
    } else {
      return res.status(403).json({
        message: 'Solo SUPERADMIN o DISTRIBUTOR pueden iniciar impersonacion'
      });
    }

    if (!targetUser) {
      return res.status(404).json({ message: 'Usuario objetivo activo no encontrado' });
    }

    await recordActivity({
      user: req.user,
      type: 'impersonation_started',
      companyId,
      distributorId,
      summary: `Impersonacion iniciada como ${targetUser.email}`,
      metadata: {
        targetUserId: targetUser._id,
        targetRole: targetUser.role,
        companyId,
        distributorId
      }
    });

    const impersonatedBy = {
      id: req.user._id.toString(),
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    };
    const token = signToken(targetUser, { impersonatedBy });
    res.json({
      token,
      user: targetUser,
      tenant: await buildSessionTenant(targetUser),
      redirectPath: getDashboardPath(targetUser.role),
      impersonatedBy
    });
  } catch (error) {
    next(error);
  }
});

router.post('/impersonation/end', authMiddleware, async (req, res, next) => {
  try {
    if (!req.impersonation?.id) {
      return res.status(400).json({ message: 'No hay una impersonacion activa' });
    }

    const actor = await User.findById(req.impersonation.id);
    if (actor) {
      await recordActivity({
        user: actor,
        type: 'impersonation_ended',
        companyId: req.user.companyId,
        distributorId: req.user.distributorId,
        summary: `Impersonacion finalizada sobre ${req.user.email}`,
        metadata: { targetUserId: req.user._id, targetRole: req.user.role }
      });
    }

    res.json({ message: 'Impersonacion finalizada' });
  } catch (error) {
    next(error);
  }
});

export default router;
