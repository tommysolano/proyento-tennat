import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Broadcast } from '../models/Broadcast.js';
import { BroadcastService } from '../modules/marketing/BroadcastService.js';
import { recordActivity } from '../utils/activity.js';
import { cleanString, isValidObjectId } from '../utils/validation.js';

const router = Router();
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

const launchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user._id)
});

function parseAudience(raw = {}) {
  const contactIds = Array.isArray(raw.contactIds)
    ? raw.contactIds.filter((id) => isValidObjectId(id))
    : [];
  const tagId = raw.tagId && isValidObjectId(raw.tagId) ? raw.tagId : null;
  return { contactIds, tagId };
}

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR'));
router.use(requirePermission('whatsapp_messages:send'));
router.use(requireModule('whatsapp'));

router.param('id', (req, res, next, id) => {
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'id de difusion invalido' });
  next();
});

// Listar difusiones de la empresa.
router.get('/', async (req, res, next) => {
  try {
    const list = await Broadcast.find({ companyId: req.user.companyId })
      .populate('templateId', 'name status')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(list);
  } catch (error) {
    next(error);
  }
});

// Crear una difusion en borrador.
router.post('/', async (req, res, next) => {
  try {
    const name = cleanString(req.body.name).slice(0, 160);
    if (!name) throw badRequest('name es requerido');
    if (!isValidObjectId(req.body.templateId)) throw badRequest('templateId es requerido');
    const audience = parseAudience(req.body.audience);
    if (!audience.contactIds.length && !audience.tagId) {
      throw badRequest('La audiencia requiere contactIds o tagId');
    }
    const variables =
      req.body.variables && typeof req.body.variables === 'object' && !Array.isArray(req.body.variables)
        ? req.body.variables
        : {};
    const throttlePerMinute = Math.min(Math.max(Number(req.body.throttlePerMinute) || 60, 1), 600);

    const broadcast = await Broadcast.create({
      companyId: req.user.companyId,
      distributorId: req.user.distributorId || null,
      name,
      channel: 'whatsapp_cloud',
      templateId: req.body.templateId,
      variables,
      audience,
      throttlePerMinute,
      status: 'draft',
      createdBy: req.user._id
    });
    await recordActivity({
      user: req.user,
      companyId: req.user.companyId,
      distributorId: req.user.distributorId,
      type: 'broadcast_created',
      summary: `Difusion creada: ${name}`,
      metadata: { broadcastId: broadcast._id, templateId: broadcast.templateId }
    }).catch(() => {});
    res.status(201).json(broadcast);
  } catch (error) {
    next(error);
  }
});

// Detalle (con estadisticas en vivo).
router.get('/:id', async (req, res, next) => {
  try {
    const broadcast = await Broadcast.findOne({ _id: req.params.id, companyId: req.user.companyId })
      .populate('templateId', 'name status')
      .populate('createdBy cancelledBy', 'name');
    if (!broadcast) return res.status(404).json({ message: 'Difusion no encontrada' });
    res.json(broadcast);
  } catch (error) {
    next(error);
  }
});

// Previsualizar cuantos contactos alcanzaria (sin enviar).
router.post('/preview', async (req, res, next) => {
  try {
    const audience = parseAudience(req.body.audience);
    if (!audience.contactIds.length && !audience.tagId) {
      throw badRequest('La audiencia requiere contactIds o tagId');
    }
    const count = await BroadcastService.previewRecipients(req.user.companyId, audience);
    res.json({ recipients: count });
  } catch (error) {
    next(error);
  }
});

// Lanzar (encola los envios con goteo).
router.post('/:id/launch', launchLimiter, async (req, res, next) => {
  try {
    const broadcast = await BroadcastService.launch(req.user.companyId, req.params.id, req.user);
    await recordActivity({
      user: req.user,
      companyId: req.user.companyId,
      distributorId: req.user.distributorId,
      type: 'broadcast_launched',
      summary: `Difusion lanzada: ${broadcast.name} (${broadcast.stats.total} destinatarios)`,
      metadata: { broadcastId: broadcast._id, recipients: broadcast.stats.total }
    }).catch(() => {});
    res.status(202).json(broadcast);
  } catch (error) {
    next(error);
  }
});

// Cancelar una difusion en curso.
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const broadcast = await BroadcastService.cancel(req.user.companyId, req.params.id, req.user);
    res.json(broadcast);
  } catch (error) {
    next(error);
  }
});

export default router;
