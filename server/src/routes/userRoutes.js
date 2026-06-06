import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Company } from '../models/Company.js';
import { User } from '../models/User.js';
import {
  cleanString,
  EMAIL_PATTERN,
  isValidObjectId
} from '../utils/validation.js';

const router = Router();
const USER_STATUSES = ['active', 'inactive', 'pending'];

function userScope(user) {
  if (user.role === 'DISTRIBUTOR') return { distributorId: user.distributorId };
  if (user.role === 'ADMIN' || user.role === 'SUPERVISOR') return { companyId: user.companyId };
  return { _id: user._id };
}

function editableUserScope(user) {
  if (user.role === 'DISTRIBUTOR') {
    return { distributorId: user.distributorId, role: 'ADMIN' };
  }

  return {
    distributorId: user.distributorId,
    companyId: user.companyId,
    role: { $in: ['SUPERVISOR', 'CALLCENTER'] }
  };
}

async function validateSupervisor(supervisorId, companyId) {
  if (!supervisorId) return null;
  if (!isValidObjectId(supervisorId)) {
    throw Object.assign(new Error('supervisorId invalido'), { status: 400 });
  }

  const supervisor = await User.findOne({
    _id: supervisorId,
    companyId,
    role: 'SUPERVISOR',
    status: 'active'
  });

  if (!supervisor) {
    throw Object.assign(new Error('El supervisor no pertenece a la empresa'), { status: 400 });
  }

  return supervisor._id;
}

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const users = await User.find(userScope(req.user))
      .populate('distributorId', 'name')
      .populate('companyId', 'name')
      .populate('supervisorId', 'name email')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

router.post('/', roleMiddleware('DISTRIBUTOR', 'ADMIN'), async (req, res, next) => {
  try {
    const name = cleanString(req.body.name);
    const email = cleanString(req.body.email).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const role = cleanString(req.body.role).toUpperCase();

    if (!name) return res.status(400).json({ message: 'name es requerido' });
    if (!email || !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ message: 'email valido es requerido' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'password debe tener al menos 8 caracteres' });
    }

    if (await User.exists({ email })) {
      return res.status(409).json({ message: 'El email ya esta registrado' });
    }

    let companyId;
    let distributorId = req.user.distributorId;
    let supervisorId = null;

    if (req.user.role === 'DISTRIBUTOR') {
      if (role !== 'ADMIN') {
        return res.status(403).json({ message: 'DISTRIBUTOR solo puede crear usuarios ADMIN' });
      }
      if (!isValidObjectId(req.body.companyId)) {
        return res.status(400).json({ message: 'companyId valido es requerido' });
      }

      const company = await Company.findOne({
        _id: req.body.companyId,
        distributorId: req.user.distributorId
      });

      if (!company) {
        return res.status(400).json({ message: 'La empresa no pertenece al distribuidor autenticado' });
      }

      companyId = company._id;
    } else {
      if (!['SUPERVISOR', 'CALLCENTER'].includes(role)) {
        return res.status(403).json({ message: 'ADMIN solo puede crear SUPERVISOR o CALLCENTER' });
      }
      if (!req.user.companyId || !req.user.distributorId) {
        return res.status(403).json({ message: 'El administrador no tiene un tenant valido' });
      }

      companyId = req.user.companyId;
      distributorId = req.user.distributorId;

      if (role === 'CALLCENTER') {
        supervisorId = await validateSupervisor(req.body.supervisorId, companyId);
      }
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      distributorId,
      companyId,
      supervisorId,
      status: 'active'
    });

    if (role === 'ADMIN') {
      await Company.updateOne(
        { _id: companyId, distributorId },
        { $set: { adminId: user._id } }
      );
    }

    await user.populate([
      { path: 'distributorId', select: 'name' },
      { path: 'companyId', select: 'name' },
      { path: 'supervisorId', select: 'name email' }
    ]);
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

async function updateUser(req, res, next) {
  try {
    if ('password' in req.body) {
      return res.status(400).json({
        message: 'El password solo puede cambiarse en PATCH /api/users/:id/password'
      });
    }

    const target = await User.findOne({
      _id: req.params.id,
      ...editableUserScope(req.user)
    });

    if (!target) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if ('name' in req.body) {
      const name = cleanString(req.body.name);
      if (!name) return res.status(400).json({ message: 'name no puede estar vacio' });
      target.name = name;
    }

    if ('email' in req.body) {
      const email = cleanString(req.body.email).toLowerCase();
      if (!EMAIL_PATTERN.test(email)) {
        return res.status(400).json({ message: 'email invalido' });
      }
      if (await User.exists({ email, _id: { $ne: target._id } })) {
        return res.status(409).json({ message: 'El email ya esta registrado' });
      }
      target.email = email;
    }

    if ('status' in req.body) {
      if (!USER_STATUSES.includes(req.body.status)) {
        return res.status(400).json({ message: 'status invalido' });
      }
      target.status = req.body.status;
    }

    if ('supervisorId' in req.body) {
      if (target.role !== 'CALLCENTER' || req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'No puedes modificar supervisorId' });
      }
      target.supervisorId = await validateSupervisor(req.body.supervisorId, target.companyId);
    }

    await target.save();
    res.json(target);
  } catch (error) {
    next(error);
  }
}

router.patch(
  '/:id/password',
  roleMiddleware('DISTRIBUTOR', 'ADMIN'),
  async (req, res, next) => {
    try {
      const password = typeof req.body.password === 'string' ? req.body.password : '';
      if (password.length < 8) {
        return res.status(400).json({ message: 'password debe tener al menos 8 caracteres' });
      }

      const user = await User.findOne({
        _id: req.params.id,
        ...editableUserScope(req.user)
      });

      if (!user) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }

      user.password = password;
      await user.save();
      res.json({ message: 'Password actualizado correctamente', user });
    } catch (error) {
      next(error);
    }
  }
);

router.patch('/:id', roleMiddleware('DISTRIBUTOR', 'ADMIN'), updateUser);
router.put('/:id', roleMiddleware('DISTRIBUTOR', 'ADMIN'), updateUser);

export default router;
