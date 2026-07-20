import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import {
  MessageTemplate,
  TEMPLATE_BUTTON_TYPES,
  TEMPLATE_CHANNELS,
  TEMPLATE_HEADER_TYPES,
  TEMPLATE_MESSAGE_CATEGORIES,
  TEMPLATE_META_CATEGORIES,
  TEMPLATE_STATUSES,
  TEMPLATE_TYPES
} from '../models/MessageTemplate.js';
import { recordActivity } from '../utils/activity.js';
import { cleanString, isValidObjectId } from '../utils/validation.js';
import { hasUserPermission } from '../core/permissions/permissions.js';
import { TemplateSyncService } from '../modules/communications/TemplateSyncService.js';
import {
  getDefaultCloudAccount,
  cloudAccountMissingFields
} from '../modules/communications/accountGateway.js';

const router = Router();

// Campos que definen la estructura de la plantilla. Solo se editan en `draft`
// (una vez enviada a Meta el contenido queda bloqueado: hay que duplicar).
const STRUCTURAL_FIELDS = [
  'name', 'content', 'channel', 'type', 'language', 'category', 'metaCategory',
  'messageCategory', 'headerType', 'headerText', 'headerMediaUrl', 'footer',
  'buttons', 'variables', 'variableSamples'
];

function parseButtons(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 3)
    .map((button) => ({
      type: button?.type,
      text: cleanString(button?.text),
      url: cleanString(button?.url),
      phone: cleanString(button?.phone)
    }))
    .filter((button) => TEMPLATE_BUTTON_TYPES.includes(button.type) && button.text);
}

function parseSamples(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((sample) => ({ key: cleanString(sample?.key), example: cleanString(sample?.example) }))
    .filter((sample) => sample.key);
}

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(
  requireAnyPermission(
    'message_templates:manage',
    'message_templates:read',
    'message_templates:use'
  )
);
router.use(requireModule('conversations'));

router.param('id', (req, res, next, id) => {
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'id de plantilla invalido' });
  }
  next();
});

router.get('/', async (req, res, next) => {
  try {
    const filter = { companyId: req.user.companyId };
    if (req.user.role !== 'ADMIN') filter.status = 'active';
    if (req.query.channel) filter.channel = req.query.channel;
    if (req.query.type) {
      if (!TEMPLATE_TYPES.includes(req.query.type)) {
        return res.status(400).json({ message: 'type invalido' });
      }
      filter.type = req.query.type;
    }
    if (req.user.role === 'ADMIN' && req.query.status) {
      if (!TEMPLATE_STATUSES.includes(req.query.status)) {
        return res.status(400).json({ message: 'status invalido' });
      }
      filter.status = req.query.status;
    }
    res.json(await MessageTemplate.find(filter).populate('createdBy', 'name role').sort({ name: 1 }));
  } catch (error) {
    next(error);
  }
});

router.post('/', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const name = cleanString(req.body.name);
    const content = cleanString(req.body.content);
    if (!name || !content) return res.status(400).json({ message: 'name y content son requeridos' });
    if (!TEMPLATE_CHANNELS.includes(req.body.channel)) return res.status(400).json({ message: 'channel invalido' });
    if (!TEMPLATE_TYPES.includes(req.body.type)) return res.status(400).json({ message: 'type invalido' });
    const messageCategory =
      req.body.messageCategory ||
      (req.body.type === 'quick_reply' ? 'reply' : 'commercial');
    if (!TEMPLATE_MESSAGE_CATEGORIES.includes(messageCategory)) {
      return res.status(400).json({ message: 'messageCategory invalida' });
    }
    if (
      ['transactional', 'operational'].includes(messageCategory) &&
      !hasUserPermission(req.user, 'messages:send_transactional')
    ) {
      return res.status(403).json({ message: 'No tienes permiso para clasificar plantillas transaccionales' });
    }
    const headerType = TEMPLATE_HEADER_TYPES.includes(req.body.headerType)
      ? req.body.headerType
      : 'none';
    const metaCategory = TEMPLATE_META_CATEGORIES.includes(req.body.metaCategory)
      ? req.body.metaCategory
      : undefined;
    const template = await MessageTemplate.create({
      companyId: req.user.companyId,
      distributorId: req.user.distributorId || null,
      name,
      channel: req.body.channel,
      type: req.body.type,
      language: cleanString(req.body.language) || 'es',
      category: cleanString(req.body.category) || 'utility',
      ...(metaCategory ? { metaCategory } : {}),
      messageCategory,
      content,
      headerType,
      headerText: headerType === 'text' ? cleanString(req.body.headerText) : '',
      headerMediaUrl: ['image', 'document', 'video'].includes(headerType)
        ? cleanString(req.body.headerMediaUrl)
        : '',
      footer: cleanString(req.body.footer),
      buttons: parseButtons(req.body.buttons),
      variables: Array.isArray(req.body.variables) ? req.body.variables.map(cleanString).filter(Boolean) : [],
      variableSamples: parseSamples(req.body.variableSamples),
      status: req.body.status || 'draft',
      providerTemplateId: cleanString(req.body.providerTemplateId),
      providerStatus: cleanString(req.body.providerStatus),
      createdBy: req.user._id,
      metadata: req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}
    });
    await recordActivity({
      user: req.user,
      type: 'message_template_created',
      summary: `Plantilla creada: ${template.name}`,
      metadata: { messageTemplateId: template._id, channel: template.channel }
    });
    res.status(201).json(template);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const template = await MessageTemplate.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!template) return res.status(404).json({ message: 'Plantilla no encontrada' });
    // Solo un borrador cambia su estructura. Ya enviada a Meta, el contenido
    // queda bloqueado: hay que duplicar como borrador (endpoint /duplicate).
    const editingStructure = STRUCTURAL_FIELDS.some((field) => field in req.body);
    if (editingStructure && template.status !== 'draft') {
      return res.status(409).json({
        message: 'Una plantilla enviada a Meta no se puede editar. Duplicala como borrador para cambiarla.'
      });
    }
    for (const field of [
      'name',
      'language',
      'category',
      'content',
      'headerText',
      'headerMediaUrl',
      'footer',
      'providerTemplateId',
      'providerStatus'
    ]) {
      if (field in req.body) template[field] = req.body[field];
    }
    if ('channel' in req.body) {
      if (!TEMPLATE_CHANNELS.includes(req.body.channel)) return res.status(400).json({ message: 'channel invalido' });
      template.channel = req.body.channel;
    }
    if ('type' in req.body) {
      if (!TEMPLATE_TYPES.includes(req.body.type)) return res.status(400).json({ message: 'type invalido' });
      template.type = req.body.type;
    }
    if ('headerType' in req.body) {
      if (!TEMPLATE_HEADER_TYPES.includes(req.body.headerType)) {
        return res.status(400).json({ message: 'headerType invalido' });
      }
      template.headerType = req.body.headerType;
      if (req.body.headerType !== 'text') template.headerText = '';
      if (!['image', 'document', 'video'].includes(req.body.headerType)) template.headerMediaUrl = '';
    }
    if ('metaCategory' in req.body) {
      if (!TEMPLATE_META_CATEGORIES.includes(req.body.metaCategory)) {
        return res.status(400).json({ message: 'metaCategory invalida' });
      }
      template.metaCategory = req.body.metaCategory;
    }
    if ('buttons' in req.body) {
      if (!Array.isArray(req.body.buttons)) return res.status(400).json({ message: 'buttons debe ser un arreglo' });
      template.buttons = parseButtons(req.body.buttons);
    }
    if ('variableSamples' in req.body) {
      if (!Array.isArray(req.body.variableSamples)) return res.status(400).json({ message: 'variableSamples debe ser un arreglo' });
      template.variableSamples = parseSamples(req.body.variableSamples);
    }
    if ('status' in req.body) {
      if (!TEMPLATE_STATUSES.includes(req.body.status)) return res.status(400).json({ message: 'status invalido' });
      template.status = req.body.status;
    }
    if ('messageCategory' in req.body) {
      if (!TEMPLATE_MESSAGE_CATEGORIES.includes(req.body.messageCategory)) {
        return res.status(400).json({ message: 'messageCategory invalida' });
      }
      if (
        ['transactional', 'operational'].includes(req.body.messageCategory) &&
        !hasUserPermission(req.user, 'messages:send_transactional')
      ) {
        return res.status(403).json({ message: 'No tienes permiso para clasificar plantillas transaccionales' });
      }
      template.messageCategory = req.body.messageCategory;
    }
    if ('variables' in req.body) {
      if (!Array.isArray(req.body.variables)) return res.status(400).json({ message: 'variables debe ser un arreglo' });
      template.variables = req.body.variables.map(cleanString).filter(Boolean);
    }
    await template.save();
    await recordActivity({
      user: req.user,
      type: template.status === 'inactive' ? 'message_template_disabled' : 'message_template_updated',
      summary: `Plantilla actualizada: ${template.name}`,
      metadata: { messageTemplateId: template._id, status: template.status }
    });
    res.json(template);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/disable', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const template = await MessageTemplate.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!template) return res.status(404).json({ message: 'Plantilla no encontrada' });
    template.status = 'inactive';
    await template.save();
    await recordActivity({
      user: req.user,
      type: 'message_template_disabled',
      summary: `Plantilla desactivada: ${template.name}`,
      metadata: { messageTemplateId: template._id }
    });
    res.json(template);
  } catch (error) {
    next(error);
  }
});

// Estado de la cuenta cloud (para decidir si se puede usar plantillas). Cualquier
// rol con acceso a la pagina puede consultarlo.
router.get('/meta/cloud-status', async (req, res, next) => {
  try {
    const account = await getDefaultCloudAccount(req.user.companyId);
    const missing = cloudAccountMissingFields(account);
    res.json({
      hasCloudAccount: Boolean(account),
      hasCompleteCloudAccount: Boolean(account) && missing.length === 0,
      missing
    });
  } catch (error) {
    next(error);
  }
});

// Registra la plantilla (draft) en el WABA via Graph API.
router.post('/:id/register', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const template = await TemplateSyncService.registerTemplate(
      req.user.companyId,
      req.params.id,
      { actorId: req.user._id }
    );
    res.json(template);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message, errors: error.errors, missing: error.missing });
    }
    next(error);
  }
});

// Sincroniza el estado de todas las plantillas cloud de la empresa contra Meta.
async function runSync(req, res, next) {
  try {
    const result = await TemplateSyncService.syncTemplates(req.user.companyId, {
      actorId: req.user._id
    });
    res.json({ ...result, message: `Sincronizadas: ${result.updated} actualizadas, ${result.imported} importadas.` });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, missing: error.missing });
    next(error);
  }
}
router.post('/sync', roleMiddleware('ADMIN'), runSync);
router.post('/:id/sync', roleMiddleware('ADMIN'), runSync);

// Duplica una plantilla como borrador editable (para plantillas ya aprobadas).
router.post('/:id/duplicate', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const source = await MessageTemplate.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    }).lean();
    if (!source) return res.status(404).json({ message: 'Plantilla no encontrada' });
    const {
      _id, createdAt, updatedAt, providerTemplateId, providerStatus, rejectionReason,
      syncedAt, usageCount, status, createdBy, ...rest
    } = source;
    const copy = await MessageTemplate.create({
      ...rest,
      name: `${source.name}_copia`,
      status: 'draft',
      providerTemplateId: '',
      providerStatus: '',
      rejectionReason: '',
      syncedAt: null,
      usageCount: 0,
      createdBy: req.user._id
    });
    await recordActivity({
      user: req.user,
      type: 'message_template_created',
      summary: `Plantilla duplicada como borrador: ${copy.name}`,
      metadata: { messageTemplateId: copy._id, sourceId: source._id }
    });
    res.status(201).json(copy);
  } catch (error) {
    next(error);
  }
});

// Elimina la plantilla localmente (no la borra de Meta).
router.delete('/:id', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const template = await MessageTemplate.findOneAndDelete({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!template) return res.status(404).json({ message: 'Plantilla no encontrada' });
    await recordActivity({
      user: req.user,
      type: 'message_template_disabled',
      summary: `Plantilla eliminada localmente: ${template.name}`,
      metadata: { messageTemplateId: template._id, providerTemplateId: template.providerTemplateId }
    });
    res.json({ deleted: true, message: 'Plantilla eliminada localmente. Si estaba en Meta, siguen existiendo alli.' });
  } catch (error) {
    next(error);
  }
});

export default router;
