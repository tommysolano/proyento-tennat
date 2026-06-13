import { Router } from 'express';
import { getUserAuthorizedModules } from '../core/modules/moduleAccess.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { CustomField, CUSTOM_FIELD_TYPES } from '../models/CustomField.js';
import { Segment } from '../models/Segment.js';
import { Tag } from '../models/Tag.js';
import { recordActivity } from '../utils/activity.js';
import { tagScopeFilter } from '../utils/crmOrganization.js';
import { tenantFields } from '../utils/crmScope.js';
import { cleanString } from '../utils/validation.js';

const router = Router();
const allowedFilterKeys = new Set([
  'status', 'lifecycleStage', 'assignedTo', 'tag', 'source', 'priority', 'city',
  'createdFrom', 'createdTo', 'followUpFrom', 'followUpTo', 'followUp', 'search'
]);

const normalizeName = (value) => cleanString(value).toLocaleLowerCase('es');
const metadata = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const tagScopes = ['contact', 'opportunity', 'appointment', 'workflow'];
const tagScopeModules = {
  contact: 'contacts',
  opportunity: 'opportunities',
  appointment: 'calendar',
  workflow: 'workflows'
};

async function authorizedTagScopes(user) {
  const modules = new Set(await getUserAuthorizedModules(user));
  return tagScopes.filter((scope) => modules.has(tagScopeModules[scope]));
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
  'opportunities:read_assigned',
  'tags:manage'
));
router.use(requireModule('crm'));

router.get('/tags', async (req, res, next) => {
  try {
    const scope = cleanString(req.query.scope);
    if (scope && !tagScopes.includes(scope)) {
      return res.status(400).json({ message: 'scope de tag invalido' });
    }
    const scopes = await authorizedTagScopes(req.user);
    if (scope && !scopes.includes(scope)) {
      return res.status(403).json({ message: `El modulo para tags de ${scope} no esta autorizado` });
    }
    if (!scope && !scopes.length) return res.json([]);
    const scopeFilter = scope
      ? tagScopeFilter(scope)
      : {
          $or: [
            ...scopes.filter((value) => value !== 'contact').map((value) => ({ scope: value })),
            ...(scopes.includes('contact') ? tagScopeFilter('contact').$or : [])
          ]
        };
    res.json(await Tag.find({ companyId: req.user.companyId, ...scopeFilter }).sort({ scope: 1, name: 1 }));
  } catch (error) { next(error); }
});

router.post('/tags', roleMiddleware('ADMIN'), requireAnyPermission('tags:manage'), async (req, res, next) => {
  try {
    const name = cleanString(req.body.name);
    if (!name) return res.status(400).json({ message: 'name es requerido' });
    const scope = cleanString(req.body.scope) || 'contact';
    if (!tagScopes.includes(scope)) {
      return res.status(400).json({ message: 'scope de tag invalido' });
    }
    if (!(await authorizedTagScopes(req.user)).includes(scope)) {
      return res.status(403).json({ message: `El modulo para tags de ${scope} no esta autorizado` });
    }
    const tag = await Tag.create({
      ...tenantFields(req.user),
      name,
      normalizedName: normalizeName(name),
      color: req.body.color || '#0e7490',
      description: cleanString(req.body.description),
      scope,
      createdBy: req.user._id,
      metadata: metadata(req.body.metadata)
    });
    await recordActivity({ user: req.user, type: 'tag_created', summary: `Tag creado: ${tag.name}`, metadata: { tagId: tag._id } });
    res.status(201).json(tag);
  } catch (error) { next(error); }
});

router.patch('/tags/:id', roleMiddleware('ADMIN'), requireAnyPermission('tags:manage'), async (req, res, next) => {
  try {
    const tag = await Tag.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!tag) return res.status(404).json({ message: 'Tag no encontrado' });
    if ('name' in req.body) {
      const name = cleanString(req.body.name);
      if (!name) return res.status(400).json({ message: 'name es requerido' });
      tag.name = name; tag.normalizedName = normalizeName(name);
    }
    for (const field of ['color', 'description', 'status']) if (field in req.body) tag[field] = req.body[field];
    if ('metadata' in req.body) tag.metadata = metadata(req.body.metadata);
    await tag.save();
    await recordActivity({ user: req.user, type: 'tag_updated', summary: `Tag actualizado: ${tag.name}`, metadata: { tagId: tag._id } });
    res.json(tag);
  } catch (error) { next(error); }
});

router.delete('/tags/:id', roleMiddleware('ADMIN'), requireAnyPermission('tags:manage'), async (req, res, next) => {
  try {
    const tag = await Tag.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      { status: 'inactive' },
      { new: true }
    );
    if (!tag) return res.status(404).json({ message: 'Tag no encontrado' });
    await recordActivity({ user: req.user, type: 'tag_deleted', summary: `Tag desactivado: ${tag.name}`, metadata: { tagId: tag._id } });
    res.json(tag);
  } catch (error) { next(error); }
});

router.get('/custom-fields', async (req, res, next) => {
  try {
    const filter = { companyId: req.user.companyId };
    if (req.query.entityType) filter.entityType = req.query.entityType;
    res.json(await CustomField.find(filter).sort({ entityType: 1, order: 1, label: 1 }));
  } catch (error) { next(error); }
});

router.post('/custom-fields', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const key = cleanString(req.body.key).toLowerCase();
    const label = cleanString(req.body.label);
    if (!key || !label) return res.status(400).json({ message: 'key y label son requeridos' });
    if (!['contact', 'opportunity'].includes(req.body.entityType)) return res.status(400).json({ message: 'entityType invalido' });
    if (!CUSTOM_FIELD_TYPES.includes(req.body.type)) return res.status(400).json({ message: 'type invalido' });
    const field = await CustomField.create({
      ...tenantFields(req.user),
      entityType: req.body.entityType,
      key,
      label,
      type: req.body.type,
      required: Boolean(req.body.required),
      options: Array.isArray(req.body.options) ? req.body.options.map(cleanString).filter(Boolean) : [],
      defaultValue: req.body.defaultValue ?? null,
      order: Number(req.body.order) || 0,
      createdBy: req.user._id,
      metadata: metadata(req.body.metadata)
    });
    await recordActivity({ user: req.user, type: 'custom_field_created', summary: `Campo personalizado creado: ${field.label}`, metadata: { customFieldId: field._id } });
    res.status(201).json(field);
  } catch (error) { next(error); }
});

router.patch('/custom-fields/:id', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const field = await CustomField.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!field) return res.status(404).json({ message: 'Campo no encontrado' });
    for (const key of ['label', 'required', 'options', 'defaultValue', 'status', 'order']) {
      if (key in req.body) field[key] = req.body[key];
    }
    if ('type' in req.body) {
      if (!CUSTOM_FIELD_TYPES.includes(req.body.type)) return res.status(400).json({ message: 'type invalido' });
      field.type = req.body.type;
    }
    await field.save();
    await recordActivity({ user: req.user, type: 'custom_field_updated', summary: `Campo actualizado: ${field.label}`, metadata: { customFieldId: field._id } });
    res.json(field);
  } catch (error) { next(error); }
});

router.delete('/custom-fields/:id', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const field = await CustomField.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      { status: 'inactive' },
      { new: true }
    );
    if (!field) return res.status(404).json({ message: 'Campo no encontrado' });
    await recordActivity({ user: req.user, type: 'custom_field_deleted', summary: `Campo desactivado: ${field.label}`, metadata: { customFieldId: field._id } });
    res.json(field);
  } catch (error) { next(error); }
});

router.get('/segments', async (req, res, next) => {
  try {
    res.json(await Segment.find({ companyId: req.user.companyId, status: 'active' }).sort({ name: 1 }));
  } catch (error) { next(error); }
});

router.post('/segments', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const name = cleanString(req.body.name);
    if (!name) return res.status(400).json({ message: 'name es requerido' });
    const filters = metadata(req.body.filters);
    const invalidKeys = Object.keys(filters).filter((key) => !allowedFilterKeys.has(key));
    if (invalidKeys.length) return res.status(400).json({ message: `Filtros no permitidos: ${invalidKeys.join(', ')}` });
    const segment = await Segment.create({
      ...tenantFields(req.user),
      name,
      description: cleanString(req.body.description),
      filters,
      createdBy: req.user._id
    });
    await recordActivity({ user: req.user, type: 'segment_created', summary: `Segmento creado: ${segment.name}`, metadata: { segmentId: segment._id } });
    res.status(201).json(segment);
  } catch (error) { next(error); }
});

router.patch('/segments/:id', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const segment = await Segment.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!segment) return res.status(404).json({ message: 'Segmento no encontrado' });
    for (const field of ['name', 'description', 'status']) if (field in req.body) segment[field] = req.body[field];
    if ('filters' in req.body) {
      const filters = metadata(req.body.filters);
      if (Object.keys(filters).some((key) => !allowedFilterKeys.has(key))) return res.status(400).json({ message: 'El segmento contiene filtros no permitidos' });
      segment.filters = filters;
    }
    await segment.save();
    await recordActivity({ user: req.user, type: 'segment_updated', summary: `Segmento actualizado: ${segment.name}`, metadata: { segmentId: segment._id } });
    res.json(segment);
  } catch (error) { next(error); }
});

router.delete('/segments/:id', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const segment = await Segment.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      { status: 'inactive' },
      { new: true }
    );
    if (!segment) return res.status(404).json({ message: 'Segmento no encontrado' });
    res.json(segment);
  } catch (error) { next(error); }
});

export default router;
