import { Router } from 'express';
import { checkModuleAccess } from '../middleware/moduleMiddleware.js';
import { ChannelConfig } from '../models/ChannelConfig.js';
import { JobService } from '../modules/jobs/JobService.js';
import { getChannelAdapter } from '../modules/conversations/adapters/index.js';
import { WhatsAppWebhookService } from '../modules/conversations/WhatsAppWebhookService.js';
import { logger } from '../utils/logger.js';
import { OperationalAlertService } from '../modules/ops/OperationalAlertService.js';

const router = Router();

async function loadAvailableConfig(channelConfigId) {
  const config = await ChannelConfig.findOne({
    _id: channelConfigId,
    channel: 'whatsapp_cloud'
  })
    .select('+credentials +verifyToken +webhookSecret');
  if (!config || config.status === 'disabled') return null;
  const moduleAccess = await checkModuleAccess('whatsapp', {
    role: 'ADMIN',
    companyId: config.companyId,
    distributorId: config.distributorId
  });
  if (!moduleAccess.enabled) {
    throw Object.assign(new Error(moduleAccess.message), { status: 403 });
  }
  return config;
}

router.get('/whatsapp/:channelConfigId', async (req, res, next) => {
  try {
    const config = await loadAvailableConfig(req.params.channelConfigId);
    if (!config) return res.status(404).json({ message: 'Canal no encontrado' });
    const adapter = getChannelAdapter('whatsapp_cloud', { channelConfig: config });
    const result = adapter.verifyWebhook(req.query);
    if (!result.verified) return res.status(403).json({ message: 'Verificacion rechazada' });
    res.status(200).send(String(result.challenge || ''));
  } catch (error) {
    next(error);
  }
});

router.post('/whatsapp/:channelConfigId', async (req, res, next) => {
  try {
    const config = await loadAvailableConfig(req.params.channelConfigId);
    if (!config) return res.status(404).json({ message: 'Canal no encontrado' });
    const adapter = getChannelAdapter('whatsapp_cloud', { channelConfig: config });
    const signature = adapter.verifySignature(
      req.rawBody || Buffer.from(JSON.stringify(req.body || {})),
      req.get('x-hub-signature-256')
    );
    const required = process.env.REQUIRE_WEBHOOK_SIGNATURE === 'true';
    if ((signature.configured && !signature.valid) || (required && !signature.valid)) {
      logger.warn('webhook.signature_invalid', {
        channelConfigId: config._id,
        companyId: config.companyId,
        signatureConfigured: signature.configured
      });
      await OperationalAlertService.create({
        companyId: config.companyId,
        distributorId: config.distributorId,
        severity: 'critical',
        type: 'webhook_signature_failed',
        title: 'Firma de webhook WhatsApp invalida',
        message: 'Se rechazo un webhook por firma ausente o invalida',
        relatedType: 'channel_config',
        relatedId: config._id,
        metadata: { signatureConfigured: signature.configured }
      }).catch(() => {});
      return res.status(403).json({ message: 'Firma de webhook invalida' });
    }
    if (!signature.configured) {
      logger.warn('webhook.signature_not_configured', {
        channelConfigId: config._id,
        companyId: config.companyId,
        environment: process.env.NODE_ENV || 'development'
      });
    }

    logger.info('webhook.received', {
      channelConfigId: config._id,
      companyId: config.companyId,
      payloadHash: WhatsAppWebhookService.payloadHash(req.body)
    });
    const hasStatuses = (req.body?.entry || []).some((entry) =>
      (entry.changes || []).some((change) => change.value?.statuses?.length)
    );
    const job = await JobService.enqueue({
      type: hasStatuses ? 'webhook.whatsapp.status' : 'webhook.whatsapp.inbound',
      payload: {
        channelConfigId: config._id,
        payload: req.body
      },
      priority: 10,
      companyId: config.companyId,
      distributorId: config.distributorId,
      metadata: {
        channelConfigId: config._id,
        payloadHash: WhatsAppWebhookService.payloadHash(req.body)
      }
    });
    logger.info('webhook.enqueued', {
      channelConfigId: config._id,
      companyId: config.companyId,
      jobId: job._id,
      type: job.type
    });
    res.status(200).json({ received: true, jobId: job._id });
  } catch (error) {
    next(error);
  }
});

export default router;
