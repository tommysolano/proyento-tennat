import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { checkModuleAccess } from '../middleware/moduleMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { ChannelConfig } from '../models/ChannelConfig.js';
import { Company } from '../models/Company.js';
import { WhatsAppSession } from '../models/WhatsAppSession.js';
import { WhatsAppQrSessionManager } from '../modules/conversations/WhatsAppQrSessionManager.js';
import { recordActivity } from '../utils/activity.js';
import { cleanString, isValidObjectId } from '../utils/validation.js';

const router = Router();
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const actionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user._id)
});
const qrLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user._id)
});

async function targetCompany(req, requested = '') {
  if (['ADMIN', 'SUPERVISOR'].includes(req.user.role)) {
    return Company.findById(req.user.companyId).select('_id distributorId status');
  }
  const companyId = cleanString(requested || req.query.companyId);
  if (!isValidObjectId(companyId)) throw badRequest('companyId es requerido');
  const filter = { _id: companyId };
  if (req.user.role === 'DISTRIBUTOR') {
    filter.distributorId = req.user.distributorId;
  }
  const company = await Company.findOne(filter).select('_id distributorId status');
  if (!company) {
    throw Object.assign(new Error('Empresa fuera del alcance'), { status: 403 });
  }
  return company;
}

async function assertModules(company) {
  for (const moduleKey of ['conversations', 'inbox', 'whatsapp']) {
    const access = await checkModuleAccess(moduleKey, {
      role: 'ADMIN',
      companyId: company._id,
      distributorId: company.distributorId
    });
    if (!access.enabled) {
      throw Object.assign(new Error(access.message), { status: 403 });
    }
  }
}

async function scopedSession(req, id, selectSecrets = false) {
  if (!isValidObjectId(id)) throw badRequest('id de sesion invalido');
  const company = await targetCompany(req, req.body?.companyId);
  await assertModules(company);
  let query = WhatsAppSession.findOne({ _id: id, companyId: company._id })
    .populate('integrationId', 'displayName channel status phoneNumberId')
    .populate('createdBy disconnectedBy authDeletedBy', 'name email role');
  if (selectSecrets) query = query.select('+authState +encryptedConfig +internalId');
  const session = await query;
  if (!session) {
    throw Object.assign(new Error('Sesion WhatsApp no encontrada'), { status: 404 });
  }
  return { session, company };
}

function requireConfirmation(req, session) {
  if (cleanString(req.body.confirmation) !== session.name) {
    throw badRequest('La confirmacion debe coincidir con el nombre de la sesion');
  }
}

async function activity(req, session, type, summary, metadata = {}) {
  await recordActivity({
    user: req.user,
    companyId: session.companyId,
    distributorId: session.distributorId,
    type,
    summary,
    metadata: {
      sessionId: session._id,
      integrationId: session.integrationId?._id || session.integrationId,
      ...metadata
    }
  });
}

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN', 'DISTRIBUTOR', 'ADMIN', 'SUPERVISOR'));

router.get(
  '/',
  requirePermission('whatsapp_connections:read'),
  async (req, res, next) => {
    try {
      const company = await targetCompany(req);
      await assertModules(company);
      const sessions = await WhatsAppSession.find({ companyId: company._id })
        .populate('integrationId', 'displayName channel status phoneNumberId')
        .populate('createdBy disconnectedBy authDeletedBy', 'name email role')
        .sort({ createdAt: -1 });
      res.json(sessions);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/metrics',
  requirePermission('whatsapp_sessions:diagnostics'),
  async (req, res, next) => {
    try {
      const company = await targetCompany(req);
      await assertModules(company);
      res.json(await WhatsAppQrSessionManager.metrics(company._id));
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  requirePermission('whatsapp_sessions:create'),
  async (req, res, next) => {
    let config = null;
    try {
      const company = await targetCompany(req, req.body.companyId);
      await assertModules(company);
      const name = cleanString(req.body.name).slice(0, 120);
      if (!name) throw badRequest('name es requerido');
      const maxSessions = Math.max(
        1,
        Number(process.env.WHATSAPP_QR_MAX_SESSIONS_PER_COMPANY || 5)
      );
      if (
        await WhatsAppSession.countDocuments({
          companyId: company._id,
          enabled: true
        }) >= maxSessions
      ) {
        throw Object.assign(
          new Error('La empresa alcanzo el limite de sesiones WhatsApp QR'),
          { status: 409 }
        );
      }
      config = await ChannelConfig.create({
        companyId: company._id,
        distributorId: company.distributorId || null,
        channel: 'whatsapp_qr',
        displayName: name,
        status: 'pending',
        createdBy: req.user._id,
        settings: {
          provider: 'baileys',
          allowGroups: process.env.WHATSAPP_QR_ALLOW_GROUPS === 'true'
        },
        metadata: { managedBy: 'whatsapp_session' }
      });
      const session = new WhatsAppSession({
        companyId: company._id,
        distributorId: company.distributorId || null,
        integrationId: config._id,
        name,
        status: 'disconnected',
        providerVersion: '6.7.23',
        createdBy: req.user._id,
        metadata: { provider: 'whatsapp_qr' }
      });
      session.setEncryptedConfig({
        allowGroups: process.env.WHATSAPP_QR_ALLOW_GROUPS === 'true'
      });
      await session.save();
      await activity(
        req,
        session,
        'whatsapp_session_created',
        `Sesion WhatsApp QR creada: ${session.name}`
      );
      res.status(201).json(
        await WhatsAppSession.findById(session._id)
          .populate('integrationId', 'displayName channel status phoneNumberId')
          .populate('createdBy', 'name email role')
      );
    } catch (error) {
      if (config?._id) await ChannelConfig.deleteOne({ _id: config._id }).catch(() => {});
      next(error);
    }
  }
);

router.get(
  '/:id',
  requirePermission('whatsapp_connections:read'),
  async (req, res, next) => {
    try {
      const { session } = await scopedSession(req, req.params.id);
      res.json(session);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id/qr',
  requirePermission('whatsapp_sessions:view_qr'),
  qrLimiter,
  async (req, res, next) => {
    try {
      const { session } = await scopedSession(req, req.params.id);
      const qr = WhatsAppQrSessionManager.getQr(session._id);
      if (!qr) {
        return res.status(410).json({
          message: 'El QR no esta disponible o ya expiro',
          status: session.status,
          expiresAt: session.qrExpiresAt
        });
      }
      res.setHeader('Cache-Control', 'no-store, private');
      res.json({
        dataUrl: qr.dataUrl,
        generatedAt: qr.generatedAt,
        expiresAt: qr.expiresAt
      });
    } catch (error) {
      next(error);
    }
  }
);

for (const [path, forceRestart, activityType] of [
  ['connect', false, 'whatsapp_session_connect_requested'],
  ['reconnect', true, 'whatsapp_session_reconnect_requested']
]) {
  router.post(
    `/:id/${path}`,
    requirePermission('whatsapp_sessions:reconnect'),
    actionLimiter,
    async (req, res, next) => {
      try {
        const { session } = await scopedSession(req, req.params.id);
        if (!session.enabled) {
          throw Object.assign(new Error('La sesion esta deshabilitada'), { status: 409 });
        }
        const updated = await WhatsAppQrSessionManager.connect(session._id, {
          forceRestart
        });
        await activity(
          req,
          session,
          activityType,
          `${path === 'connect' ? 'Conexion' : 'Reconexion'} WhatsApp QR solicitada`
        );
        res.status(202).json(updated);
      } catch (error) {
        next(error);
      }
    }
  );
}

router.post(
  '/:id/regenerate-qr',
  requirePermission('whatsapp_sessions:reconnect'),
  actionLimiter,
  async (req, res, next) => {
    try {
      const { session } = await scopedSession(req, req.params.id);
      const updated = await WhatsAppQrSessionManager.regenerateQr(session._id);
      await activity(
        req,
        session,
        'whatsapp_session_qr_regenerated',
        'QR de WhatsApp regenerado'
      );
      res.status(202).json(updated);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/:id/disconnect',
  requirePermission('whatsapp_sessions:disconnect'),
  actionLimiter,
  async (req, res, next) => {
    try {
      const { session } = await scopedSession(req, req.params.id);
      requireConfirmation(req, session);
      const updated = await WhatsAppQrSessionManager.disconnect(
        session._id,
        req.user._id
      );
      await activity(
        req,
        session,
        'whatsapp_session_disconnected',
        `Sesion WhatsApp QR desconectada: ${session.name}`
      );
      res.json(updated);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/:id/logout',
  requirePermission('whatsapp_sessions:delete_auth'),
  actionLimiter,
  async (req, res, next) => {
    try {
      const { session } = await scopedSession(req, req.params.id);
      requireConfirmation(req, session);
      const updated = await WhatsAppQrSessionManager.logout(
        session._id,
        req.user._id
      );
      await activity(
        req,
        session,
        'whatsapp_session_auth_deleted',
        `Autenticacion WhatsApp QR eliminada: ${session.name}`
      );
      res.json(updated);
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id/enabled',
  requirePermission('whatsapp_sessions:disconnect'),
  actionLimiter,
  async (req, res, next) => {
    try {
      const { session } = await scopedSession(req, req.params.id);
      const enabled = req.body.enabled === true;
      if (!enabled) requireConfirmation(req, session);
      const updated = await WhatsAppQrSessionManager.setEnabled(
        session._id,
        enabled,
        req.user._id
      );
      await activity(
        req,
        session,
        'whatsapp_session_enabled_updated',
        `Sesion WhatsApp QR ${enabled ? 'habilitada' : 'deshabilitada'}`
      );
      res.json(updated);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id/diagnostics',
  requirePermission('whatsapp_sessions:diagnostics'),
  async (req, res, next) => {
    try {
      const { session } = await scopedSession(req, req.params.id, true);
      const diagnostics = await WhatsAppQrSessionManager.diagnostics(session._id);
      res.json({ session, diagnostics });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
