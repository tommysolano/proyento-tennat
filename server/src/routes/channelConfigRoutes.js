import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import {
  CHANNEL_CONFIG_CHANNELS,
  CHANNEL_CONFIG_STATUSES,
  ChannelConfig
} from '../models/ChannelConfig.js';
import { recordActivity } from '../utils/activity.js';
import { cleanString } from '../utils/validation.js';
import { getChannelAdapter } from '../modules/conversations/adapters/index.js';

const router = Router();
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

function canonicalConfigChannel(channel) {
  return {
    whatsapp_cloud_api: 'whatsapp_cloud',
    facebook: 'facebook_messenger',
    messenger: 'facebook_messenger'
  }[channel] || channel;
}

function safe(config) {
  return config.toSafeObject();
}

function validateConnected(config) {
  const credentials = config.getDecryptedCredentials();
  if (
    config.channel === 'whatsapp_cloud' &&
    config.status === 'connected' &&
    (!config.phoneNumberId || !credentials.accessToken || !config.getDecryptedVerifyToken())
  ) {
    throw badRequest(
      'WhatsApp conectado requiere phoneNumberId, accessToken y verifyToken'
    );
  }
}

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN'));
router.use(requirePermission('channel_configs:manage'));
router.use(requireModule('conversations'));
router.use(requireModule('whatsapp'));

router.get('/', async (req, res, next) => {
  try {
    const configs = await ChannelConfig.find({ companyId: req.user.companyId })
      .select('+credentials +verifyToken +webhookSecret')
      .sort({ createdAt: -1 });
    res.json(configs.map(safe));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const channel = canonicalConfigChannel(req.body.channel || 'whatsapp_cloud');
    const displayName = cleanString(req.body.displayName);
    if (!displayName) throw badRequest('displayName es requerido');
    if (!CHANNEL_CONFIG_CHANNELS.includes(channel)) throw badRequest('channel invalido');
    const status = req.body.status || 'pending';
    if (!CHANNEL_CONFIG_STATUSES.includes(status)) throw badRequest('status invalido');
    const config = new ChannelConfig({
      companyId: req.user.companyId,
      distributorId: req.user.distributorId || null,
      channel,
      displayName,
      credentials: {},
      settings: {
        apiVersion: cleanString(req.body.apiVersion)
      },
      webhookSecret: '',
      verifyToken: '',
      phoneNumberId: cleanString(req.body.phoneNumberId),
      externalBusinessId: cleanString(req.body.externalBusinessId),
      externalAccountId: cleanString(req.body.externalAccountId),
      status,
      lastConnectedAt: status === 'connected' ? new Date() : null,
      createdBy: req.user._id,
      metadata: {}
    });
    config.setSecrets({
      credentials: {
        accessToken: cleanString(req.body.accessToken),
        appId: cleanString(req.body.appId)
      },
      appSecret: cleanString(req.body.appSecret),
      webhookSecret: cleanString(req.body.webhookSecret),
      verifyToken: cleanString(req.body.verifyToken)
    });
    validateConnected(config);
    await config.save();
    await recordActivity({
      user: req.user,
      type: 'channel_configured',
      summary: `Canal configurado: ${config.displayName}`,
      metadata: { channelConfigId: config._id, channel: config.channel, status: config.status }
    });
    res.status(201).json(safe(config));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const config = await ChannelConfig.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    }).select('+credentials +verifyToken +webhookSecret');
    if (!config) return res.status(404).json({ message: 'Canal no encontrado' });
    res.json(safe(config));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const config = await ChannelConfig.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    }).select('+credentials +verifyToken +webhookSecret');
    if (!config) return res.status(404).json({ message: 'Canal no encontrado' });
    for (const field of [
      'displayName',
      'phoneNumberId',
      'externalBusinessId',
      'externalAccountId',
      'status'
    ]) {
      if (field in req.body) config[field] = req.body[field];
    }
    if ('status' in req.body && !CHANNEL_CONFIG_STATUSES.includes(req.body.status)) {
      throw badRequest('status invalido');
    }
    if ('verifyToken' in req.body && req.body.verifyToken) {
      config.setSecrets({ verifyToken: cleanString(req.body.verifyToken) });
    }
    if ('webhookSecret' in req.body && req.body.webhookSecret) {
      config.setSecrets({ webhookSecret: cleanString(req.body.webhookSecret) });
    }
    if ('appSecret' in req.body && req.body.appSecret) {
      config.setSecrets({ appSecret: cleanString(req.body.appSecret) });
    }
    if ('accessToken' in req.body && req.body.accessToken) {
      config.setSecrets({
        credentials: { accessToken: cleanString(req.body.accessToken) }
      });
    }
    if ('apiVersion' in req.body) {
      config.settings = {
        ...(config.settings || {}),
        apiVersion: cleanString(req.body.apiVersion)
      };
      config.markModified('settings');
    }
    if (config.status === 'connected' && !config.lastConnectedAt) {
      config.lastConnectedAt = new Date();
    }
    validateConnected(config);
    await config.save();
    await recordActivity({
      user: req.user,
      type: 'channel_config_updated',
      summary: `Canal actualizado: ${config.displayName}`,
      metadata: { channelConfigId: config._id, channel: config.channel, status: config.status }
    });
    res.json(safe(config));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/disable', async (req, res, next) => {
  try {
    const config = await ChannelConfig.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      { status: 'disabled' },
      { new: true }
    ).select('+credentials +verifyToken +webhookSecret');
    if (!config) return res.status(404).json({ message: 'Canal no encontrado' });
    await recordActivity({
      user: req.user,
      type: 'channel_disabled',
      summary: `Canal desactivado: ${config.displayName}`,
      metadata: { channelConfigId: config._id, channel: config.channel }
    });
    res.json(safe(config));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/test', async (req, res, next) => {
  try {
    const config = await ChannelConfig.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    }).select('+credentials +verifyToken +webhookSecret');
    if (!config) return res.status(404).json({ message: 'Canal no encontrado' });
    const checks = {
      phoneNumberId: Boolean(config.phoneNumberId),
      accessToken: Boolean(config.getDecryptedCredentials().accessToken),
      verifyToken: Boolean(config.getDecryptedVerifyToken()),
      appSecret: Boolean(config.getDecryptedAppSecret()),
      apiVersion: Boolean(
        config.settings?.apiVersion ||
          process.env.WHATSAPP_GRAPH_API_VERSION ||
          process.env.WHATSAPP_GRAPH_VERSION
      )
    };
    const requiredChecks = [checks.phoneNumberId, checks.accessToken, checks.verifyToken, checks.apiVersion];
    const valid = config.channel !== 'whatsapp_cloud' || requiredChecks.every(Boolean);
    const live = req.body.live === true;
    const liveResult =
      live && valid && config.channel === 'whatsapp_cloud'
        ? await getChannelAdapter('whatsapp_cloud', {
            channelConfig: config
          }).testConnection()
        : null;
    res.json({
      valid: liveResult ? liveResult.success : valid,
      checks,
      live,
      liveResult,
      message: live
        ? liveResult?.success
          ? 'Conexion real con Meta validada.'
          : liveResult?.error || 'No se pudo validar la conexion con Meta.'
        : valid
          ? 'Configuracion minima completa. No se realizo una llamada externa.'
          : 'Configuracion incompleta. No se realizo una llamada externa.'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
