export const IMPERSONATION_ROLE_RANK = {
  SUPERADMIN: 0,
  DISTRIBUTOR: 1,
  ADMIN: 2,
  SUPERVISOR: 3,
  CALLCENTER: 4
};

export const IMPERSONATOR_ROLES = ['SUPERADMIN', 'DISTRIBUTOR', 'ADMIN'];
export const COMPANY_SCOPED_ROLES = ['ADMIN', 'SUPERVISOR', 'CALLCENTER'];

const ACTIVE_TENANT_STATUSES = ['active', 'trial'];

function sameId(left, right) {
  return Boolean(left) && Boolean(right) && String(left) === String(right);
}

function rank(role) {
  const value = IMPERSONATION_ROLE_RANK[role];
  return value === undefined ? Number.POSITIVE_INFINITY : value;
}

function deny(status, message) {
  return { ok: false, status, message };
}

export function canRoleImpersonate(role) {
  return IMPERSONATOR_ROLES.includes(role);
}

/**
 * Roles que un actor raiz puede asumir. La jerarquia es estricta: solo se
 * desciende, nunca se alcanza el propio rol ni uno superior.
 */
export function impersonableRoles(actorRole) {
  if (!canRoleImpersonate(actorRole)) return [];
  return Object.keys(IMPERSONATION_ROLE_RANK).filter(
    (role) => rank(role) > rank(actorRole)
  );
}

/**
 * Decide si `actor` (siempre el ACTOR RAIZ de la cadena, nunca el usuario
 * impersonado en curso) puede asumir la identidad de `target`.
 *
 * Devuelve `{ ok: true }` o `{ ok: false, status, message }` para que la ruta
 * y el middleware compartan exactamente las mismas reglas.
 */
export function evaluateImpersonation({
  actor,
  target,
  company = null,
  distributor = null,
  allowInactiveCompany = false
} = {}) {
  if (!actor || actor.status === 'inactive') {
    return deny(401, 'La sesion delegada ya no es valida');
  }
  if (!canRoleImpersonate(actor.role)) {
    return deny(403, 'Tu rol no puede iniciar una impersonacion');
  }
  if (!target || target.status !== 'active') {
    return deny(404, 'Usuario objetivo activo no encontrado');
  }
  if (sameId(actor._id, target._id)) {
    return deny(403, 'No puedes impersonarte a ti mismo');
  }
  if (rank(target.role) <= rank(actor.role)) {
    return deny(403, 'Alcance de impersonacion invalido');
  }

  if (actor.role === 'DISTRIBUTOR') {
    if (!sameId(actor.distributorId, target.distributorId)) {
      return deny(403, 'La empresa no pertenece al distribuidor delegado');
    }
  }

  if (actor.role === 'ADMIN') {
    if (!sameId(actor.distributorId, target.distributorId)) {
      return deny(403, 'La empresa no pertenece al distribuidor delegado');
    }
    if (!sameId(actor.companyId, target.companyId)) {
      return deny(403, 'El usuario objetivo no pertenece a tu empresa');
    }
  }

  if (COMPANY_SCOPED_ROLES.includes(target.role)) {
    if (!target.companyId) {
      return deny(403, 'El usuario objetivo no tiene empresa asignada');
    }
    if (!company || !sameId(company._id, target.companyId)) {
      return deny(403, 'La empresa delegada ya no esta disponible');
    }
    if (
      actor.role !== 'SUPERADMIN' &&
      !sameId(company.distributorId, actor.distributorId)
    ) {
      return deny(403, 'La empresa no pertenece al distribuidor delegado');
    }
    if (!allowInactiveCompany && !ACTIVE_TENANT_STATUSES.includes(company.status)) {
      return deny(403, 'La empresa esta suspendida. Contacta a tu distribuidor.');
    }
  }

  if (target.distributorId && distributor) {
    if (!sameId(distributor._id, target.distributorId)) {
      return deny(403, 'El distribuidor delegado ya no esta disponible');
    }
    if (!ACTIVE_TENANT_STATUSES.includes(distributor.status)) {
      return deny(403, `El distribuidor esta ${distributor.status || 'no disponible'}`);
    }
  }

  return { ok: true, status: 200, message: '' };
}

/**
 * Filtro Mongo con el universo de usuarios que el actor raiz puede asumir.
 * Devuelve `null` cuando el rol no puede impersonar.
 */
export function impersonationTargetScope(actor) {
  if (!actor || !canRoleImpersonate(actor.role)) return null;

  const base = {
    status: 'active',
    _id: { $ne: actor._id },
    role: { $in: impersonableRoles(actor.role) }
  };

  if (actor.role === 'SUPERADMIN') return base;
  if (actor.role === 'DISTRIBUTOR') {
    return { ...base, distributorId: actor.distributorId };
  }
  return { ...base, distributorId: actor.distributorId, companyId: actor.companyId };
}
