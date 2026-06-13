import { Router } from 'express';
import { hasUserPermission } from '../core/permissions/permissions.js';
import { getUserAuthorizedModules } from '../core/modules/moduleAccess.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import {
  COMMERCIAL_RELATION_TYPES,
  CommercialRelation
} from '../models/CommercialRelation.js';
import { Contact, CONTACT_STATUSES } from '../models/Contact.js';
import { CustomField } from '../models/CustomField.js';
import { CrmList, CRM_LIST_ENTITY_TYPES } from '../models/CrmList.js';
import { Opportunity, OPPORTUNITY_STATUSES } from '../models/Opportunity.js';
import { Tag } from '../models/Tag.js';
import { UserViewPreference } from '../models/UserViewPreference.js';
import { recordActivity } from '../utils/activity.js';
import {
  normalizeObjectIdArray,
  sanitizeVisibleColumns,
  tagScopeFilter
} from '../utils/crmOrganization.js';
import {
  assignedResourceScope,
  tenantFields,
  validateCrmAssignee
} from '../utils/crmScope.js';
import { cleanString, isValidObjectId } from '../utils/validation.js';
import { CommunicationPolicyService } from '../modules/communications/CommunicationPolicyService.js';

const router = Router();
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const forbidden = (message) => Object.assign(new Error(message), { status: 403 });

const entityConfig = {
  contact: {
    Model: Contact,
    scope: 'contact',
    statuses: CONTACT_STATUSES,
    readPermissions: ['contacts:manage', 'contacts:read_team', 'contacts:read_assigned'],
    updatePermissions: ['contacts:manage', 'contacts:update_team', 'contacts:update_assigned']
  },
  opportunity: {
    Model: Opportunity,
    scope: 'opportunity',
    statuses: OPPORTUNITY_STATUSES,
    readPermissions: [
      'opportunities:manage',
      'opportunities:read_team',
      'opportunities:read_assigned'
    ],
    updatePermissions: [
      'opportunities:manage',
      'opportunities:update_team',
      'opportunities:update_assigned'
    ]
  }
};

function configFor(entityType) {
  const config = entityConfig[entityType];
  if (!config) throw badRequest('entityType invalido');
  return config;
}

function requireEntityPermission(user, entityType, mode = 'read') {
  const config = configFor(entityType);
  const permissions = mode === 'update' ? config.updatePermissions : config.readPermissions;
  if (!permissions.some((permission) => hasUserPermission(user, permission))) {
    throw forbidden(`No tienes permiso para ${mode === 'update' ? 'modificar' : 'ver'} ${entityType}`);
  }
  return config;
}

async function assertEntityModule(user, entityType) {
  const moduleKey = entityType === 'contact' ? 'contacts' : 'opportunities';
  if (!(await getUserAuthorizedModules(user)).includes(moduleKey)) {
    throw forbidden(`El modulo ${moduleKey} no esta autorizado para esta cuenta`);
  }
}

async function validateList(user, listId, entityType) {
  if (!isValidObjectId(listId)) throw badRequest('listId invalido');
  const list = await CrmList.findOne({
    _id: listId,
    companyId: user.companyId,
    entityType,
    status: 'active'
  });
  if (!list) throw badRequest('La lista no existe, esta inactiva o pertenece a otra base');
  return list;
}

async function validateTag(user, tagId, scope) {
  if (!isValidObjectId(tagId)) throw badRequest('tagId invalido');
  const tag = await Tag.findOne({
    _id: tagId,
    companyId: user.companyId,
    status: 'active',
    ...tagScopeFilter(scope)
  }).select('_id');
  if (!tag) throw badRequest(`El tag no pertenece a la base ${scope}`);
  return tag._id;
}

async function validateScopedResources(user, entityType, ids) {
  await assertEntityModule(user, entityType);
  const config = requireEntityPermission(user, entityType, 'update');
  const normalized = normalizeObjectIdArray(ids);
  const resourceScope = await assignedResourceScope(user);
  const resources = await config.Model.find({
    _id: { $in: normalized },
    ...resourceScope,
    ...(entityType === 'contact' ? { archivedAt: null } : {})
  }).select('_id');
  if (resources.length !== normalized.length) {
    throw badRequest('Uno o mas elementos no existen o estan fuera de tu alcance');
  }
  return { ...config, ids: normalized, resourceScope };
}

function relationPayload(body) {
  if (!COMMERCIAL_RELATION_TYPES.includes(body.relationType || 'participant')) {
    throw badRequest('relationType invalido');
  }
  const relatedAt = body.relatedAt ? new Date(body.relatedAt) : new Date();
  if (Number.isNaN(relatedAt.getTime())) throw badRequest('relatedAt debe ser una fecha valida');
  return {
    relationType: body.relationType || 'participant',
    channel: cleanString(body.channel),
    campaign: cleanString(body.campaign),
    consultedProduct: cleanString(body.consultedProduct),
    purchasedProduct: cleanString(body.purchasedProduct),
    notes: cleanString(body.notes),
    relatedAt
  };
}

async function customColumnKeys(user, module) {
  const entityType = module === 'contacts' ? 'contact' : 'opportunity';
  const keys = await CustomField.find({
    companyId: user.companyId,
    entityType,
    status: 'active'
  }).distinct('key');
  return keys.map((key) => `custom:${key}`);
}

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requireAnyPermission(
  'crm:manage',
  'crm:read_team',
  'contacts:manage',
  'contacts:read_team',
  'contacts:read_assigned',
  'opportunities:manage',
  'opportunities:read_team',
  'opportunities:read_assigned'
));
router.use(requireModule('crm'));

router.get('/lists', async (req, res, next) => {
  try {
    const entityType = cleanString(req.query.entityType);
    const authorizedModules = await getUserAuthorizedModules(req.user);
    const readableEntityTypes = CRM_LIST_ENTITY_TYPES.filter((type) => {
      const moduleKey = type === 'contact' ? 'contacts' : 'opportunities';
      return authorizedModules.includes(moduleKey) &&
        configFor(type).readPermissions.some((permission) =>
          hasUserPermission(req.user, permission)
        );
    });
    if (entityType) {
      requireEntityPermission(req.user, entityType);
      await assertEntityModule(req.user, entityType);
    }
    const filter = { companyId: req.user.companyId, status: 'active' };
    if (entityType) filter.entityType = entityType;
    else {
      filter.entityType = {
        $in: [
          ...(authorizedModules.includes('contacts') ? ['contact'] : []),
          ...(authorizedModules.includes('opportunities') ? ['opportunity'] : [])
        ]
      };
      filter.entityType.$in = filter.entityType.$in.filter((type) =>
        readableEntityTypes.includes(type)
      );
    }
    const lists = await CrmList.find(filter)
      .populate('createdBy updatedBy', 'name role')
      .sort({ name: 1 })
      .lean();
    const resourceScope = await assignedResourceScope(req.user);
    res.json(await Promise.all(lists.map(async (list) => ({
      ...list,
      memberCount: await configFor(list.entityType).Model.countDocuments({
        ...resourceScope,
        lists: list._id,
        ...(list.entityType === 'contact' ? { archivedAt: null } : {})
      })
    }))));
  } catch (error) { next(error); }
});

router.post('/lists', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const entityType = cleanString(req.body.entityType);
    if (!CRM_LIST_ENTITY_TYPES.includes(entityType)) throw badRequest('entityType invalido');
    await assertEntityModule(req.user, entityType);
    requireEntityPermission(req.user, entityType, 'update');
    const name = cleanString(req.body.name);
    if (!name) throw badRequest('name es requerido');
    const list = await CrmList.create({
      ...tenantFields(req.user),
      name,
      description: cleanString(req.body.description),
      entityType,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });
    await recordActivity({
      user: req.user,
      type: 'crm_list_created',
      summary: `Lista creada: ${list.name}`,
      metadata: { listId: list._id, entityType }
    });
    res.status(201).json({ ...list.toJSON(), memberCount: 0 });
  } catch (error) { next(error); }
});

router.patch('/lists/:id', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) throw badRequest('listId invalido');
    const list = await CrmList.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!list) return res.status(404).json({ message: 'Lista no encontrada' });
    await assertEntityModule(req.user, list.entityType);
    requireEntityPermission(req.user, list.entityType, 'update');
    if ('name' in req.body) {
      list.name = cleanString(req.body.name);
      if (!list.name) throw badRequest('name es requerido');
    }
    if ('description' in req.body) list.description = cleanString(req.body.description);
    if ('status' in req.body) {
      if (!['active', 'inactive'].includes(req.body.status)) throw badRequest('status invalido');
      list.status = req.body.status;
    }
    list.updatedBy = req.user._id;
    await list.save();
    res.json(list);
  } catch (error) { next(error); }
});

router.delete('/lists/:id', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) throw badRequest('listId invalido');
    const list = await CrmList.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!list) return res.status(404).json({ message: 'Lista no encontrada' });
    await assertEntityModule(req.user, list.entityType);
    requireEntityPermission(req.user, list.entityType, 'update');
    list.status = 'inactive';
    list.updatedBy = req.user._id;
    await list.save();
    res.json(list);
  } catch (error) { next(error); }
});

router.get('/lists/:id/members', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) throw badRequest('listId invalido');
    const list = await CrmList.findOne({
      _id: req.params.id,
      companyId: req.user.companyId,
      status: 'active'
    });
    if (!list) return res.status(404).json({ message: 'Lista no encontrada' });
    await assertEntityModule(req.user, list.entityType);
    const config = requireEntityPermission(req.user, list.entityType);
    const members = await config.Model.find({
      lists: list._id,
      ...(await assignedResourceScope(req.user)),
      ...(list.entityType === 'contact' ? { archivedAt: null } : {})
    }).sort({ updatedAt: -1 });
    res.json(members);
  } catch (error) { next(error); }
});

router.post('/bulk/:entityType', async (req, res, next) => {
  try {
    const entityType = req.params.entityType === 'contacts'
      ? 'contact'
      : req.params.entityType === 'opportunities'
        ? 'opportunity'
        : '';
    const { Model, scope, statuses, ids, resourceScope } = await validateScopedResources(
      req.user,
      entityType,
      req.body.ids
    );
    const action = cleanString(req.body.action);
    let update = null;
    let handled = false;

    if (['add_to_list', 'remove_from_list'].includes(action)) {
      const list = await validateList(req.user, req.body.listId, entityType);
      update = action === 'add_to_list'
        ? { $addToSet: { lists: list._id }, $set: { updatedBy: req.user._id } }
        : { $pull: { lists: list._id }, $set: { updatedBy: req.user._id } };
    } else if (['add_tag', 'remove_tag'].includes(action)) {
      const tagId = await validateTag(req.user, req.body.tagId, scope);
      update = action === 'add_tag'
        ? { $addToSet: { tags: tagId }, $set: { updatedBy: req.user._id } }
        : { $pull: { tags: tagId }, $set: { updatedBy: req.user._id } };
    } else if (action === 'assign') {
      const assignPermissions = entityType === 'contact'
        ? ['contacts:manage', 'contacts:assign', 'contacts:assign_team']
        : ['opportunities:manage', 'opportunities:assign_team'];
      if (!assignPermissions.some((permission) => hasUserPermission(req.user, permission))) {
        throw forbidden('No tienes permiso para reasignar estos registros');
      }
      const assignedTo = await validateCrmAssignee(req.user, req.body.userId, {
        allowNull: false
      });
      update = { $set: { assignedTo, updatedBy: req.user._id } };
    } else if (action === 'change_status') {
      if (!statuses.includes(req.body.status)) throw badRequest('status invalido');
      if (req.user.role === 'CALLCENTER' && req.body.status === 'archived') {
        throw forbidden('CALLCENTER no puede archivar registros');
      }
      update = {
        $set: {
          status: req.body.status,
          updatedBy: req.user._id,
          ...(entityType === 'contact' && req.body.status !== 'nuevo'
            ? { lastContactAt: new Date() }
            : {})
        }
      };
    } else if (action === 'set_dnd') {
      if (entityType !== 'contact') throw badRequest('DND solo aplica a contactos');
      if (
        !['dnd:manage', 'dnd:manage_team'].some((permission) =>
          hasUserPermission(req.user, permission)
        )
      ) {
        throw forbidden('No tienes permiso para modificar DND en masa');
      }
      if (typeof req.body.active !== 'boolean') throw badRequest('active debe ser boolean');
      for (const contactId of ids) {
        await CommunicationPolicyService.setGlobalDnd({
          companyId: req.user.companyId,
          contactId,
          active: req.body.active,
          reason: req.body.reason,
          recordedBy: req.user._id,
          source: 'crm_bulk_action'
        });
      }
      handled = true;
    } else {
      throw badRequest('Accion masiva invalida');
    }

    if (update && !handled) {
      const result = await Model.updateMany(
        { _id: { $in: ids }, ...resourceScope },
        update
      );
      if (result.matchedCount !== ids.length) {
        throw badRequest('No fue posible actualizar todos los elementos seleccionados');
      }
    }

    await recordActivity({
      user: req.user,
      type: 'crm_bulk_action',
      summary: `Accion masiva ${action} aplicada a ${ids.length} ${entityType}`,
      metadata: { entityType, action, count: ids.length }
    });
    res.json({ message: 'Accion masiva completada', affected: ids.length });
  } catch (error) { next(error); }
});

router.get('/view-preferences/:module', async (req, res, next) => {
  try {
    const module = req.params.module;
    const entityType = module === 'contacts' ? 'contact' : module === 'opportunities' ? 'opportunity' : '';
    requireEntityPermission(req.user, entityType);
    await assertEntityModule(req.user, entityType);
    const preference = await UserViewPreference.findOne({
      companyId: req.user.companyId,
      userId: req.user._id,
      module,
      view: 'list'
    }).lean();
    if (!preference) return res.json({ module, view: 'list', visibleColumns: [] });
    res.json({
      ...preference,
      visibleColumns: sanitizeVisibleColumns(
        module,
        preference.visibleColumns,
        await customColumnKeys(req.user, module)
      )
    });
  } catch (error) { next(error); }
});

router.put('/view-preferences/:module', async (req, res, next) => {
  try {
    const module = req.params.module;
    const entityType = module === 'contacts' ? 'contact' : module === 'opportunities' ? 'opportunity' : '';
    requireEntityPermission(req.user, entityType);
    await assertEntityModule(req.user, entityType);
    const visibleColumns = sanitizeVisibleColumns(
      module,
      req.body.visibleColumns,
      await customColumnKeys(req.user, module)
    );
    const preference = await UserViewPreference.findOneAndUpdate(
      {
        companyId: req.user.companyId,
        userId: req.user._id,
        module,
        view: 'list'
      },
      { $set: { visibleColumns } },
      { upsert: true, new: true, runValidators: true }
    );
    res.json(preference);
  } catch (error) { next(error); }
});

router.get('/relations', requireModule('contacts'), requireModule('opportunities'), async (req, res, next) => {
  try {
    const contactId = cleanString(req.query.contactId);
    const opportunityId = cleanString(req.query.opportunityId);
    if ((!contactId && !opportunityId) || (contactId && opportunityId)) {
      throw badRequest('Debes indicar contactId u opportunityId');
    }
    const filter = { companyId: req.user.companyId };
    let relatedEntity;
    if (contactId) {
      if (!isValidObjectId(contactId)) throw badRequest('contactId invalido');
      requireEntityPermission(req.user, 'contact');
      requireEntityPermission(req.user, 'opportunity');
      const contact = await Contact.exists({
        _id: contactId,
        ...(await assignedResourceScope(req.user)),
        archivedAt: null
      });
      if (!contact) throw badRequest('Contacto fuera de alcance');
      filter.contactId = contactId;
      relatedEntity = 'opportunity';
    } else {
      if (!isValidObjectId(opportunityId)) throw badRequest('opportunityId invalido');
      requireEntityPermission(req.user, 'opportunity');
      requireEntityPermission(req.user, 'contact');
      const opportunity = await Opportunity.exists({
        _id: opportunityId,
        ...(await assignedResourceScope(req.user))
      });
      if (!opportunity) throw badRequest('Oportunidad fuera de alcance');
      filter.opportunityId = opportunityId;
      relatedEntity = 'contact';
    }
    const relations = await CommercialRelation.find(filter)
      .populate('contactId', 'name email phone status assignedTo')
      .populate('opportunityId', 'title value currency status assignedTo')
      .populate('createdBy', 'name role')
      .sort({ relatedAt: -1 })
      .lean();
    const accessibleIds = new Set((await entityConfig[relatedEntity].Model.find({
      _id: {
        $in: relations.map((relation) =>
          relation[relatedEntity === 'contact' ? 'contactId' : 'opportunityId']?._id
        ).filter(Boolean)
      },
      ...(await assignedResourceScope(req.user))
    }).distinct('_id')).map(String));
    res.json(relations.filter((relation) => accessibleIds.has(String(
      relation[relatedEntity === 'contact' ? 'contactId' : 'opportunityId']?._id
    ))));
  } catch (error) { next(error); }
});

router.post('/relations', requireModule('contacts'), requireModule('opportunities'), async (req, res, next) => {
  try {
    requireEntityPermission(req.user, 'contact', 'update');
    requireEntityPermission(req.user, 'opportunity', 'update');
    if (!isValidObjectId(req.body.contactId)) throw badRequest('contactId invalido');
    if (!isValidObjectId(req.body.opportunityId)) throw badRequest('opportunityId invalido');
    const [contact, opportunity] = await Promise.all([
      Contact.findOne({
        _id: req.body.contactId,
        ...(await assignedResourceScope(req.user)),
        archivedAt: null
      }).select('_id'),
      Opportunity.findOne({
        _id: req.body.opportunityId,
        ...(await assignedResourceScope(req.user))
      }).select('_id')
    ]);
    if (!contact || !opportunity) {
      throw badRequest('Contacto y oportunidad deben existir en el mismo tenant y alcance');
    }
    const normalizedRelation = relationPayload(req.body);
    const duplicate = await CommercialRelation.exists({
      companyId: req.user.companyId,
      contactId: contact._id,
      opportunityId: opportunity._id,
      relationType: normalizedRelation.relationType
    });
    if (duplicate) throw badRequest('Esta relacion comercial ya existe');
    const relation = await CommercialRelation.create({
      ...tenantFields(req.user),
      contactId: contact._id,
      opportunityId: opportunity._id,
      ...normalizedRelation,
      createdBy: req.user._id
    });
    await recordActivity({
      user: req.user,
      type: 'commercial_relation_created',
      summary: 'Relacion comercial creada',
      metadata: {
        relationId: relation._id,
        contactId: contact._id,
        opportunityId: opportunity._id,
        relationType: relation.relationType
      }
    });
    res.status(201).json(await relation.populate([
      { path: 'contactId', select: 'name email phone status assignedTo' },
      { path: 'opportunityId', select: 'title value currency status assignedTo' },
      { path: 'createdBy', select: 'name role' }
    ]));
  } catch (error) { next(error); }
});

router.delete('/relations/:id', requireModule('contacts'), requireModule('opportunities'), async (req, res, next) => {
  try {
    requireEntityPermission(req.user, 'contact', 'update');
    requireEntityPermission(req.user, 'opportunity', 'update');
    if (!isValidObjectId(req.params.id)) throw badRequest('relationId invalido');
    const relation = await CommercialRelation.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!relation) return res.status(404).json({ message: 'Relacion no encontrada' });
    const [contact, opportunity] = await Promise.all([
      Contact.exists({
        _id: relation.contactId,
        ...(await assignedResourceScope(req.user)),
        archivedAt: null
      }),
      Opportunity.exists({
        _id: relation.opportunityId,
        ...(await assignedResourceScope(req.user))
      })
    ]);
    if (!contact || !opportunity) throw forbidden('Relacion fuera de tu alcance');
    await relation.deleteOne();
    res.json({ message: 'Relacion comercial eliminada' });
  } catch (error) { next(error); }
});

export default router;
