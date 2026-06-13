import { Router } from 'express';
import {
  PERMISSION_TEMPLATES,
  filterPermissionsByModules,
  getPermissionTemplate,
  permissionsAllowedForRole
} from '../core/permissions/permissionTemplates.js';
import { ROLE_PERMISSIONS } from '../core/permissions/permissions.js';
import { getCompanyAuthorizedModules } from '../core/modules/moduleAccess.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Company } from '../models/Company.js';
import { User } from '../models/User.js';
import { recordActivity } from '../utils/activity.js';
import { checkPlatformLimit } from '../utils/platformLimits.js';
import {
  refreshCompanyOnboarding,
  refreshDistributorOnboarding
} from '../utils/onboarding.js';
import {
  cleanString,
  EMAIL_PATTERN,
  isValidObjectId
} from '../utils/validation.js';

const router = Router();
const USER_STATUSES = ['active', 'inactive', 'pending'];
const INTERNAL_ROLES = ['SUPERVISOR', 'CALLCENTER'];

function userScope(user) {
  if (user.role === 'DISTRIBUTOR') return { distributorId: user.distributorId };
  if (user.role === 'ADMIN') return { companyId: user.companyId };
  return {
    companyId: user.companyId,
    role: 'CALLCENTER',
    supervisorId: user._id
  };
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

function permissionsForRoleAndModules(role, permissions, modules) {
  return filterPermissionsByModules(
    permissionsAllowedForRole(role, permissions),
    modules
  );
}

function permissionTemplateResponse(template, modules) {
  return {
    key: template.key,
    name: template.name,
    description: template.description,
    targetRoles: template.targetRoles,
    permissionsByRole: Object.fromEntries(
      template.targetRoles.map((role) => [
        role,
        permissionsForRoleAndModules(role, template.permissions, modules)
      ])
    )
  };
}

async function buildPermissionUpdate(target, body, modules) {
  const templateKey = cleanString(body.templateKey);
  const template = templateKey ? getPermissionTemplate(templateKey) : null;
  if (templateKey && (!template || !template.targetRoles.includes(target.role))) {
    throw Object.assign(new Error('La plantilla no aplica al rol seleccionado'), { status: 400 });
  }
  if ('permissions' in body && !Array.isArray(body.permissions)) {
    throw Object.assign(new Error('permissions debe ser una lista'), { status: 400 });
  }

  const customPermissions = 'permissions' in body;
  const requestedPermissions = customPermissions
    ? body.permissions.map(cleanString).filter(Boolean)
    : template
      ? permissionsAllowedForRole(target.role, template.permissions)
      : null;
  if (!requestedPermissions) {
    throw Object.assign(new Error('Debes enviar permissions o templateKey'), { status: 400 });
  }

  const rolePermissions = permissionsAllowedForRole(target.role, requestedPermissions);
  if (customPermissions && new Set(requestedPermissions).size !== rolePermissions.length) {
    throw Object.assign(
      new Error(`La seleccion contiene permisos no permitidos para ${target.role}`),
      { status: 403 }
    );
  }

  const permissions = filterPermissionsByModules(rolePermissions, modules);
  return {
    permissions,
    permissionTemplate: templateKey,
    removedPermissions: rolePermissions.filter(
      (permission) => !permissions.includes(permission)
    )
  };
}

router.get(
  '/permissions/templates',
  roleMiddleware('ADMIN'),
  async (req, res, next) => {
    try {
      const modules = await getCompanyAuthorizedModules(req.user.companyId);
      res.json({
        modules,
        templates: PERMISSION_TEMPLATES.map((template) =>
          permissionTemplateResponse(template, modules)
        ),
        availablePermissions: Object.fromEntries(
          ['ADMIN', ...INTERNAL_ROLES].map((role) => [
            role,
            permissionsForRoleAndModules(role, ROLE_PERMISSIONS[role] || [], modules)
          ])
        )
      });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/permissions/roles/:role',
  roleMiddleware('ADMIN'),
  async (req, res, next) => {
    try {
      const role = cleanString(req.params.role).toUpperCase();
      if (!INTERNAL_ROLES.includes(role)) {
        return res.status(400).json({ message: 'Solo se permiten roles internos' });
      }
      const users = await User.find({
        companyId: req.user.companyId,
        distributorId: req.user.distributorId,
        role
      });
      const modules = await getCompanyAuthorizedModules(req.user.companyId);
      const previewTarget = { role };
      const update = await buildPermissionUpdate(previewTarget, req.body, modules);

      for (const user of users) {
        user.permissions = update.permissions;
        user.permissionTemplate = update.permissionTemplate;
        await user.save();
      }

      await recordActivity({
        user: req.user,
        type: update.permissionTemplate
          ? 'permission_template_applied'
          : 'permissions_updated',
        summary: `Permisos actualizados para el rol ${role}`,
        metadata: {
          role,
          usersUpdated: users.length,
          templateKey: update.permissionTemplate,
          permissions: update.permissions,
          removedPermissions: update.removedPermissions
        }
      });
      res.json({
        message: `Permisos aplicados a ${users.length} usuario(s) ${role}`,
        usersUpdated: users.length,
        ...update
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/',
  requireAnyPermission('companies:manage', 'users:manage', 'users:read_team'),
  async (req, res, next) => {
    try {
      if (req.user.role === 'CALLCENTER') {
        return res.status(403).json({ message: 'CALLCENTER no puede listar usuarios' });
      }

      const users = await User.find(userScope(req.user))
        .populate('distributorId', 'name')
        .populate('companyId', 'name')
        .populate('supervisorId', 'name email')
        .sort({ createdAt: -1 });
      res.json(users);
    } catch (error) {
      next(error);
    }
  }
);

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
      if (
        company.adminId &&
        (await User.exists({ _id: company.adminId, role: 'ADMIN', status: 'active' }))
      ) {
        return res.status(409).json({ message: 'La empresa ya tiene un ADMIN activo' });
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

    await checkPlatformLimit(distributorId, 'users');
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

    await recordActivity({
      user: req.user,
      type: 'user_created',
      companyId,
      distributorId,
      summary: `${role} creado: ${user.name}`,
      metadata: { createdUserId: user._id, role, email: user.email }
    });
    await refreshDistributorOnboarding(distributorId);
    await refreshCompanyOnboarding(companyId);

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
    if ('role' in req.body || 'permissions' in req.body || 'permissionTemplate' in req.body) {
      return res.status(400).json({
        message: 'Usa la ruta de permisos; el rol no puede cambiarse desde esta operacion'
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

router.put(
  '/:id/permissions',
  roleMiddleware('ADMIN'),
  async (req, res, next) => {
    try {
      if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: 'userId invalido' });
      }
      const target = await User.findOne({
        _id: req.params.id,
        distributorId: req.user.distributorId,
        companyId: req.user.companyId,
        role: { $in: INTERNAL_ROLES }
      });
      if (!target) return res.status(404).json({ message: 'Usuario interno no encontrado' });
      if (String(target._id) === String(req.user._id)) {
        return res.status(403).json({ message: 'No puedes editar tus propios permisos' });
      }

      const modules = await getCompanyAuthorizedModules(req.user.companyId);
      const update = await buildPermissionUpdate(target, req.body, modules);
      target.permissions = update.permissions;
      target.permissionTemplate = update.permissionTemplate;
      await target.save();
      await recordActivity({
        user: req.user,
        type: update.permissionTemplate
          ? 'permission_template_applied'
          : 'permissions_updated',
        summary: `Permisos actualizados para ${target.email}`,
        metadata: {
          targetUserId: target._id,
          targetRole: target.role,
          templateKey: update.permissionTemplate,
          permissions: update.permissions,
          removedPermissions: update.removedPermissions
        }
      });
      res.json({
        message: 'Permisos actualizados correctamente',
        user: target,
        removedPermissions: update.removedPermissions
      });
    } catch (error) {
      next(error);
    }
  }
);

router.patch('/:id', roleMiddleware('DISTRIBUTOR', 'ADMIN'), updateUser);
router.put('/:id', roleMiddleware('DISTRIBUTOR', 'ADMIN'), updateUser);

export default router;
