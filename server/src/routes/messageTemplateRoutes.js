import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import {
  MessageTemplate,
  TEMPLATE_CHANNELS,
  TEMPLATE_STATUSES,
  TEMPLATE_TYPES
} from '../models/MessageTemplate.js';
import { recordActivity } from '../utils/activity.js';
import { cleanString, isValidObjectId } from '../utils/validation.js';

const router = Router();

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
    const template = await MessageTemplate.create({
      companyId: req.user.companyId,
      distributorId: req.user.distributorId || null,
      name,
      channel: req.body.channel,
      type: req.body.type,
      language: cleanString(req.body.language) || 'es',
      category: cleanString(req.body.category) || 'utility',
      content,
      variables: Array.isArray(req.body.variables) ? req.body.variables.map(cleanString).filter(Boolean) : [],
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
    for (const field of [
      'name',
      'language',
      'category',
      'content',
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
    if ('status' in req.body) {
      if (!TEMPLATE_STATUSES.includes(req.body.status)) return res.status(400).json({ message: 'status invalido' });
      template.status = req.body.status;
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

export default router;
