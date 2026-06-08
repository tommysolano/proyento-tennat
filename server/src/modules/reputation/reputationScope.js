import { Contact } from '../../models/Contact.js';
import { assignedResourceScope } from '../../utils/crmScope.js';

export async function assertContactAccess(user, contactId) {
  const contact = await Contact.findOne({
    _id: contactId,
    ...(await assignedResourceScope(user)),
    archivedAt: null
  });
  if (!contact) {
    throw Object.assign(new Error('Contacto no encontrado o fuera de alcance'), { status: 404 });
  }
  return contact;
}

export async function reputationScope(user, field = 'contactId', companyId = null) {
  if (user.role === 'SUPERADMIN') return companyId ? { companyId } : {};
  if (user.role === 'ADMIN') return { companyId: user.companyId };
  const contactIds = await Contact.find(await assignedResourceScope(user)).distinct('_id');
  return { companyId: user.companyId, [field]: { $in: contactIds } };
}

export function tenantScope(user) {
  return { companyId: user.companyId };
}
