import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import {
  requireAnyPermission,
  requirePermission
} from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import {
  ROUTING_STRATEGIES,
  RoutingRule
} from '../models/RoutingRule.js';
import { User } from '../models/User.js';
import { recordActivity } from '../utils/activity.js';
import { cleanString, isValidObjectId } from '../utils/validation.js';

const router = Router();
const allowedStrategies = ['unassigned', 'contact_owner', 'round_robin'];
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

async function validateTargetUsers(user, ids = []) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.some((id) => !isValidObjectId(id))) throw badRequest('targetUserIds invalido');
  const users = await User.find({
    _id: { $in: unique },
    companyId: user.companyId,
    role: { $in: ['SUPERVISOR', 'CALLCENTER'] },
    status: 'active'
  }).select('_id');
  if (users.length !== unique.length) {
    throw badRequest('Todos los agentes deben estar activos y pertenecer a la empresa');
  }
  return users.map((item) => item._id);
}

function populateRule(query) {
  return query
    .populate('targetUserIds', 'name email role supervisorId status')
    .populate('targetSupervisorId', 'name email')
    .populate('createdBy updatedBy', 'name email role');
}

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR'));
router.use(requireModule('conversations'));
router.use(requireModule('inbox'));

router.get(
  '/',
  requireAnyPermission('routing_rules:manage', 'routing_rules:read'),
  async (req, res, next) => {
    try {
      const rules = await populateRule(
        RoutingRule.find({ companyId: req.user.companyId }).sort({
          priority: -1,
          createdAt: 1
        })
      );
      res.json(rules);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  roleMiddleware('ADMIN'),
  requirePermission('routing_rules:manage'),
  async (req, res, next) => {
    try {
      const strategy = cleanString(req.body.strategy);
      if (!allowedStrategies.includes(strategy) || !ROUTING_STRATEGIES.includes(strategy)) {
        throw badRequest('strategy invalida');
      }
      const name = cleanString(req.body.name);
      if (!name) throw badRequest('name es requerido');
      const targetUserIds =
        strategy === 'round_robin'
          ? await validateTargetUsers(req.user, req.body.targetUserIds || [])
          : [];
      if (strategy === 'round_robin' && !targetUserIds.length) {
        throw badRequest('round_robin requiere al menos un agente');
      }
      const rule = await RoutingRule.create({
        companyId: req.user.companyId,
        distributorId: req.user.distributorId || null,
        name,
        channel: cleanString(req.body.channel) || 'whatsapp_cloud',
        enabled: req.body.enabled !== false,
        strategy,
        targetUserIds,
        priority: Number(req.body.priority || 0),
        createdBy: req.user._id,
        updatedBy: req.user._id
      });
      await recordActivity({
        user: req.user,
        type: 'routing_rule_created',
        summary: `Regla de routing creada: ${rule.name}`,
        metadata: { routingRuleId: rule._id, strategy: rule.strategy }
      });
      res.status(201).json(await populateRule(RoutingRule.findById(rule._id)));
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id',
  roleMiddleware('ADMIN'),
  requirePermission('routing_rules:manage'),
  async (req, res, next) => {
    try {
      const rule = await RoutingRule.findOne({
        _id: req.params.id,
        companyId: req.user.companyId
      });
      if (!rule) return res.status(404).json({ message: 'Regla no encontrada' });
      if ('name' in req.body) {
        rule.name = cleanString(req.body.name);
        if (!rule.name) throw badRequest('name no puede estar vacio');
      }
      if ('strategy' in req.body) {
        const strategy = cleanString(req.body.strategy);
        if (!allowedStrategies.includes(strategy)) throw badRequest('strategy invalida');
        rule.strategy = strategy;
      }
      if ('channel' in req.body) rule.channel = cleanString(req.body.channel);
      if ('priority' in req.body) rule.priority = Number(req.body.priority || 0);
      if ('enabled' in req.body) rule.enabled = Boolean(req.body.enabled);
      if ('targetUserIds' in req.body || rule.strategy !== 'round_robin') {
        rule.targetUserIds =
          rule.strategy === 'round_robin'
            ? await validateTargetUsers(req.user, req.body.targetUserIds || [])
            : [];
      }
      if (rule.strategy === 'round_robin' && !rule.targetUserIds.length) {
        throw badRequest('round_robin requiere al menos un agente');
      }
      rule.updatedBy = req.user._id;
      await rule.save();
      await recordActivity({
        user: req.user,
        type: 'routing_rule_updated',
        summary: `Regla de routing actualizada: ${rule.name}`,
        metadata: { routingRuleId: rule._id, strategy: rule.strategy }
      });
      res.json(await populateRule(RoutingRule.findById(rule._id)));
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id/toggle',
  roleMiddleware('ADMIN'),
  requirePermission('routing_rules:manage'),
  async (req, res, next) => {
    try {
      const rule = await RoutingRule.findOne({
        _id: req.params.id,
        companyId: req.user.companyId
      });
      if (!rule) return res.status(404).json({ message: 'Regla no encontrada' });
      rule.enabled = !rule.enabled;
      rule.updatedBy = req.user._id;
      await rule.save();
      await recordActivity({
        user: req.user,
        type: 'routing_rule_toggled',
        summary: `Regla ${rule.enabled ? 'activada' : 'desactivada'}: ${rule.name}`,
        metadata: { routingRuleId: rule._id, enabled: rule.enabled }
      });
      res.json(await populateRule(RoutingRule.findById(rule._id)));
    } catch (error) {
      next(error);
    }
  }
);

export default router;
