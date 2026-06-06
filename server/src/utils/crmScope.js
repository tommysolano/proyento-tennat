import { Contact } from '../models/Contact.js';
import { Opportunity } from '../models/Opportunity.js';
import { User } from '../models/User.js';
import { isValidObjectId } from './validation.js';

export async function teamMemberIds(user, { includeSelf = true } = {}) {
  const ids = await User.find({
    companyId: user.companyId,
    role: 'CALLCENTER',
    supervisorId: user._id,
    status: 'active'
  }).distinct('_id');
  return includeSelf ? [user._id, ...ids] : ids;
}

export async function assignedResourceScope(user, field = 'assignedTo') {
  if (user.role === 'ADMIN') return { companyId: user.companyId };
  if (user.role === 'SUPERVISOR') {
    return { companyId: user.companyId, [field]: { $in: await teamMemberIds(user) } };
  }
  if (user.role === 'CALLCENTER') return { companyId: user.companyId, [field]: user._id };
  return { _id: null };
}

export async function validateCrmAssignee(user, requestedId, { allowNull = true } = {}) {
  if (!requestedId) {
    if (allowNull) return null;
    throw Object.assign(new Error('assignedTo es requerido'), { status: 400 });
  }
  if (!isValidObjectId(requestedId)) {
    throw Object.assign(new Error('assignedTo invalido'), { status: 400 });
  }

  const filter = {
    _id: requestedId,
    companyId: user.companyId,
    role: { $in: user.role === 'ADMIN' ? ['ADMIN', 'SUPERVISOR', 'CALLCENTER'] : ['SUPERVISOR', 'CALLCENTER'] },
    status: 'active'
  };
  if (user.role === 'SUPERVISOR') {
    filter.$or = [{ _id: user._id }, { role: 'CALLCENTER', supervisorId: user._id }];
  }
  if (user.role === 'CALLCENTER') filter._id = user._id;

  const assignee = await User.findOne(filter).select('_id');
  if (!assignee) {
    throw Object.assign(new Error('El responsable debe pertenecer al alcance del usuario'), {
      status: 400
    });
  }
  return assignee._id;
}

export async function assertRelatedResource(user, relatedType, relatedId) {
  if (relatedType === 'company') {
    if (relatedId && relatedId.toString() !== user.companyId?.toString()) {
      throw Object.assign(new Error('La empresa relacionada no pertenece al tenant'), { status: 400 });
    }
    return user.companyId;
  }
  if (!isValidObjectId(relatedId)) {
    throw Object.assign(new Error('relatedId invalido'), { status: 400 });
  }

  const Model = relatedType === 'contact' ? Contact : Opportunity;
  const resource = await Model.findOne({
    _id: relatedId,
    ...(await assignedResourceScope(user))
  }).select('_id');
  if (!resource) {
    throw Object.assign(new Error('El recurso relacionado no existe o esta fuera de alcance'), {
      status: 400
    });
  }
  return resource._id;
}

export function tenantFields(user) {
  return {
    companyId: user.companyId,
    distributorId: user.distributorId || null
  };
}
