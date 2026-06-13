import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { ContactConsent } from '../models/ContactConsent.js';
import { Message } from '../models/Message.js';
import { SuppressionEntry } from '../models/SuppressionEntry.js';
import { Conversation } from '../models/Conversation.js';
import { CommunicationPolicyService } from '../modules/communications/CommunicationPolicyService.js';
import { MESSAGE_CATEGORIES } from '../modules/communications/communicationPolicyRules.js';
import { conversationScope } from '../modules/conversations/conversationScope.js';
import { assignedResourceScope } from '../utils/crmScope.js';
import { recordActivity } from '../utils/activity.js';
import { cleanString, isValidObjectId } from '../utils/validation.js';

const router = Router();
const readPermissions = ['consent:read', 'consent:read_team', 'consent:read_assigned'];
const managePermissions = ['consent:manage', 'consent:manage_team', 'consent:record_assigned'];
const dndReadPermissions = ['dnd:read', 'dnd:read_team', 'dnd:read_assigned'];
const dndManagePermissions = [
  'dnd:manage',
  'dnd:manage_team',
  'communication_preferences:update_assigned'
];

function badRequest(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function dateFilter(query, field = 'updatedAt') {
  const filter = {};
  if (query.from || query.to) {
    filter[field] = {};
    if (query.from) {
      const from = new Date(query.from);
      if (Number.isNaN(from.getTime())) throw badRequest('from debe ser fecha valida');
      filter[field].$gte = from;
    }
    if (query.to) {
      const to = new Date(query.to);
      if (Number.isNaN(to.getTime())) throw badRequest('to debe ser fecha valida');
      filter[field].$lte = to;
    }
  }
  return filter;
}

async function scopedContact(user, contactId) {
  if (!isValidObjectId(contactId)) throw badRequest('contactId invalido');
  const { Contact } = await import('../models/Contact.js');
  return Contact.findOne({
    _id: contactId,
    ...(await assignedResourceScope(user)),
    archivedAt: null
  });
}

function sanitizeSettingsInput(body) {
  const data = {};
  if ('timezone' in body) {
    const timezone = cleanString(body.timezone);
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
      throw badRequest('timezone invalida');
    }
    data.timezone = timezone;
  }
  if (body.quietHours && typeof body.quietHours === 'object') {
    const quiet = {};
    if ('enabled' in body.quietHours) quiet.enabled = Boolean(body.quietHours.enabled);
    for (const field of ['startTime', 'endTime']) {
      if (field in body.quietHours) {
        const value = cleanString(body.quietHours[field]);
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
          throw badRequest(`${field} debe usar HH:mm`);
        }
        quiet[field] = value;
      }
    }
    if ('days' in body.quietHours) {
      if (
        !Array.isArray(body.quietHours.days) ||
        body.quietHours.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
      ) throw badRequest('days contiene valores invalidos');
      quiet.days = [...new Set(body.quietHours.days)];
    }
    if ('channels' in body.quietHours) {
      if (!Array.isArray(body.quietHours.channels)) {
        throw badRequest('channels debe ser un arreglo');
      }
      quiet.channels = [...new Set(
        body.quietHours.channels.map(CommunicationPolicyService.normalizeChannel)
      )];
    }
    if ('allowTransactional' in body.quietHours) {
      quiet.allowTransactional = Boolean(body.quietHours.allowTransactional);
    }
    if ('action' in body.quietHours) {
      if (!['block', 'schedule'].includes(body.quietHours.action)) {
        throw badRequest('action de horario silencioso invalida');
      }
      quiet.action = body.quietHours.action;
    }
    data.quietHours = quiet;
  }
  for (const field of ['optOutKeywords', 'globalOptOutKeywords']) {
    if (field in body) {
      if (!Array.isArray(body[field]) || body[field].length > 50) {
        throw badRequest(`${field} debe ser un arreglo de hasta 50 palabras`);
      }
      data[field] = [...new Set(body[field].map(cleanString).filter(Boolean))].slice(0, 50);
    }
  }
  return data;
}

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requireModule('crm'));
router.use(requireModule('contacts'));

router.get(
  '/contacts/:contactId/status',
  requireAnyPermission(...readPermissions, ...dndReadPermissions),
  async (req, res, next) => {
    try {
      const contact = await scopedContact(req.user, req.params.contactId);
      if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });
      let conversation = null;
      if (req.query.conversationId) {
        if (!isValidObjectId(req.query.conversationId)) throw badRequest('conversationId invalido');
        conversation = await Conversation.findOne({
          _id: req.query.conversationId,
          contactId: contact._id,
          ...(await conversationScope(req.user)),
          archivedAt: null
        });
      }
      res.json(await CommunicationPolicyService.contactStatus({
        companyId: req.user.companyId,
        contactId: contact._id,
        channel: req.query.channel || null,
        conversation
      }));
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/contacts/:contactId/consents/:channel',
  requireAnyPermission(...managePermissions),
  async (req, res, next) => {
    try {
      const contact = await scopedContact(req.user, req.params.contactId);
      if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });
      const consent = await CommunicationPolicyService.recordConsent({
        companyId: req.user.companyId,
        distributorId: req.user.distributorId,
        contactId: contact._id,
        channel: req.params.channel,
        status: req.body.status,
        source: req.body.source || 'manual',
        legalBasis: req.body.legalBasis,
        consentText: req.body.consentText,
        consentVersion: req.body.consentVersion,
        sourceReference: req.body.sourceReference,
        reason: req.body.reason,
        expiresAt: req.body.expiresAt,
        recordedBy: req.user._id,
        metadata: req.body.metadata,
        evidence: req.body.evidence
      });
      res.json(consent);
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/contacts/:contactId/dnd',
  requireAnyPermission(...dndManagePermissions),
  async (req, res, next) => {
    try {
      const contact = await scopedContact(req.user, req.params.contactId);
      if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });
      if (typeof req.body.active !== 'boolean') throw badRequest('active debe ser boolean');
      const updated = await CommunicationPolicyService.setGlobalDnd({
        companyId: req.user.companyId,
        contactId: contact._id,
        active: req.body.active,
        reason: req.body.reason,
        recordedBy: req.user._id,
        source: 'manual'
      });
      res.json(updated.communicationPreferences);
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/contacts/:contactId/preferences',
  requireAnyPermission('consent:manage', 'consent:manage_team', 'communication_preferences:update_assigned'),
  async (req, res, next) => {
    try {
      const contact = await scopedContact(req.user, req.params.contactId);
      if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });
      const updated = await CommunicationPolicyService.updatePreferences({
        companyId: req.user.companyId,
        contactId: contact._id,
        preferences: req.body,
        recordedBy: req.user._id
      });
      res.json(updated.communicationPreferences);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/policy/evaluate',
  requireAnyPermission(...readPermissions),
  async (req, res, next) => {
    try {
      const contact = await scopedContact(req.user, req.query.contactId);
      if (!contact) return res.status(404).json({ message: 'Contacto no encontrado' });
      const category = req.query.category || 'reply';
      if (!MESSAGE_CATEGORIES.includes(category)) throw badRequest('category invalida');
      let conversation = null;
      if (req.query.conversationId) {
        if (!isValidObjectId(req.query.conversationId)) {
          throw badRequest('conversationId invalido');
        }
        conversation = await Conversation.findOne({
          _id: req.query.conversationId,
          contactId: contact._id,
          ...(await conversationScope(req.user)),
          archivedAt: null
        });
      }
      res.json(await CommunicationPolicyService.evaluate({
        companyId: req.user.companyId,
        contactId: contact._id,
        channel: req.query.channel,
        category,
        conversation,
        channelConfigId: conversation?.channelConfigId || null,
        user: req.user
      }));
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/settings',
  requireAnyPermission(...readPermissions, 'quiet_hours:manage'),
  async (req, res, next) => {
    try {
      res.json(await CommunicationPolicyService.settings(
        req.user.companyId,
        req.user.distributorId
      ));
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/settings',
  requireAnyPermission('quiet_hours:manage'),
  async (req, res, next) => {
    try {
      const settings = await CommunicationPolicyService.settings(
        req.user.companyId,
        req.user.distributorId
      );
      const data = sanitizeSettingsInput(req.body);
      if (data.timezone) settings.timezone = data.timezone;
      if (data.quietHours) {
        settings.quietHours = {
          ...(settings.quietHours?.toObject?.() || settings.quietHours || {}),
          ...data.quietHours
        };
      }
      if (data.optOutKeywords) settings.optOutKeywords = data.optOutKeywords;
      if (data.globalOptOutKeywords) {
        settings.globalOptOutKeywords = data.globalOptOutKeywords;
      }
      settings.updatedBy = req.user._id;
      await settings.save();
      await recordActivity({
        user: req.user,
        type: 'quiet_hours_updated',
        summary: 'Reglas de comunicacion actualizadas',
        metadata: { fields: Object.keys(data) }
      });
      res.json(settings);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/suppressions',
  requireAnyPermission('suppressions:manage'),
  async (req, res, next) => {
    try {
      const filter = { companyId: req.user.companyId };
      if (req.query.status) filter.status = req.query.status;
      if (req.query.channel) filter.channel = req.query.channel;
      res.json(await SuppressionEntry.find(filter)
        .select('-metadata')
        .populate('addedBy revokedBy', 'name role')
        .sort({ createdAt: -1 })
        .limit(1000));
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/suppressions',
  requireAnyPermission('suppressions:manage'),
  async (req, res, next) => {
    try {
      res.status(201).json(await CommunicationPolicyService.addSuppression({
        companyId: req.user.companyId,
        distributorId: req.user.distributorId,
        type: req.body.type,
        value: req.body.value,
        channel: req.body.channel,
        reason: req.body.reason,
        source: req.body.source,
        expiresAt: req.body.expiresAt,
        userId: req.user._id
      }));
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/suppressions/:id/revoke',
  requireAnyPermission('suppressions:manage'),
  async (req, res, next) => {
    try {
      if (!isValidObjectId(req.params.id)) throw badRequest('id de supresion invalido');
      res.json(await CommunicationPolicyService.revokeSuppression({
        companyId: req.user.companyId,
        suppressionId: req.params.id,
        userId: req.user._id,
        reason: req.body.reason
      }));
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/reports/overview',
  requireAnyPermission('communication_reports:read', 'communication_reports:read_team'),
  requireModule('reporting'),
  async (req, res, next) => {
    try {
      const contactScope = await assignedResourceScope(req.user);
      const { Contact } = await import('../models/Contact.js');
      const contactIds = await Contact.find({ ...contactScope, archivedAt: null }).distinct('_id');
      const consentFilter = {
        companyId: req.user.companyId,
        contactId: { $in: contactIds },
        ...dateFilter(req.query)
      };
      const messageFilter = {
        companyId: req.user.companyId,
        contactId: { $in: contactIds },
        ...dateFilter(req.query, 'createdAt')
      };
      if (req.query.channel) {
        consentFilter.channel = CommunicationPolicyService.normalizeChannel(req.query.channel);
        messageFilter.channel = req.query.channel;
      }
      if (req.query.campaignId) messageFilter['metadata.campaignId'] = req.query.campaignId;
      if (req.query.workflowId) messageFilter['metadata.workflowId'] = req.query.workflowId;
      const [
        dndGlobal,
        consentByChannel,
        consentBySource,
        blockedByReason,
        technicalErrors,
        delivery
      ] = await Promise.all([
        Contact.countDocuments({
          ...contactScope,
          archivedAt: null,
          $or: [
            { 'communicationPreferences.globalDnd': true },
            { 'metadata.doNotDisturb': { $in: [true, 'true', 'active', 'enabled', 'on'] } },
            { 'metadata.dnd': { $in: [true, 'true', 'active', 'enabled', 'on'] } },
            { 'metadata.optOut': { $in: [true, 'true', 'active', 'enabled', 'on'] } },
            {
              'metadata.preferences.doNotDisturb': {
                $in: [true, 'true', 'active', 'enabled', 'on']
              }
            },
            {
              'metadata.communicationPreferences.doNotDisturb': {
                $in: [true, 'true', 'active', 'enabled', 'on']
              }
            }
          ]
        }),
        ContactConsent.aggregate([
          { $match: consentFilter },
          { $group: { _id: { channel: '$channel', status: '$status' }, count: { $sum: 1 } } },
          { $sort: { '_id.channel': 1, '_id.status': 1 } }
        ]),
        ContactConsent.aggregate([
          { $match: consentFilter },
          { $group: { _id: '$source', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        Message.aggregate([
          { $match: { ...messageFilter, status: { $in: ['blocked', 'skipped'] } } },
          { $group: { _id: '$reasonCode', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        Message.aggregate([
          { $match: { ...messageFilter, status: 'failed' } },
          { $group: { _id: { channel: '$channel', integrationId: '$integrationId' }, count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        Message.aggregate([
          { $match: { ...messageFilter, direction: 'outbound' } },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ])
      ]);
      res.json({
        dndGlobal,
        consentByChannel,
        consentBySource,
        blockedByReason,
        quietHoursSkipped: blockedByReason
          .filter((item) => ['QUIET_HOURS_BLOCKED', 'QUIET_HOURS_SCHEDULED'].includes(item._id))
          .reduce((sum, item) => sum + item.count, 0),
        technicalErrors,
        delivery
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/consents/export',
  requireAnyPermission('consent:export'),
  async (req, res, next) => {
    try {
      const { Contact } = await import('../models/Contact.js');
      const contactIds = await Contact.find({
        ...(await assignedResourceScope(req.user)),
        archivedAt: null
      }).distinct('_id');
      const records = await ContactConsent.find({
        companyId: req.user.companyId,
        contactId: { $in: contactIds },
        ...dateFilter(req.query)
      }).populate('contactId', 'name email phone').sort({ updatedAt: -1 }).limit(10000);
      const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const rows = records.map((item) => [
        item.contactId?.name,
        item.contactId?.email,
        item.contactId?.phone,
        item.channel,
        item.status,
        item.source,
        item.consentedAt?.toISOString?.() || '',
        item.revokedAt?.toISOString?.() || '',
        item.updatedAt?.toISOString?.() || ''
      ].map(cell).join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="consentimientos.csv"');
      res.send(`\uFEFFname,email,phone,channel,status,source,consentedAt,revokedAt,updatedAt\n${rows.join('\n')}`);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
