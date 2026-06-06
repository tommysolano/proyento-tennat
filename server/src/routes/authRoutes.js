import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { Company } from '../models/Company.js';
import { User } from '../models/User.js';
import { recordActivity } from '../utils/activity.js';
import { getDashboardPath } from '../utils/dashboardPath.js';

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

function signToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role
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

    const token = signToken(user);
    res.json({
      token,
      user: user.toJSON(),
      redirectPath: getDashboardPath(user.role)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  res.json({
    user: req.user,
    redirectPath: getDashboardPath(req.user.role)
  });
});

router.post('/impersonate', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.role !== 'DISTRIBUTOR') {
      return res.status(403).json({ message: 'Solo el distribuidor puede entrar como admin' });
    }

    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({ message: 'companyId es requerido' });
    }

    const company = await Company.findOne({
      _id: companyId,
      distributorId: req.user.distributorId,
      status: { $ne: 'inactive' }
    });
    if (!company) {
      return res.status(404).json({ message: 'Empresa no encontrada para este distribuidor' });
    }

    const targetUser = await User.findOne({
      _id: company.adminId,
      companyId: company._id,
      distributorId: req.user.distributorId,
      role: 'ADMIN',
      status: 'active'
    });

    if (!targetUser) {
      return res.status(404).json({ message: 'La empresa no tiene un admin activo' });
    }

    await recordActivity({
      user: req.user,
      type: 'impersonation_started',
      companyId: company._id,
      summary: `Impersonacion iniciada como ${targetUser.email}`,
      metadata: { targetUserId: targetUser._id, companyId: company._id }
    });

    const token = signToken(targetUser);
    res.json({
      token,
      user: targetUser,
      redirectPath: getDashboardPath(targetUser.role),
      impersonatedBy: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
