import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { checkModuleAccess } from '../middleware/moduleMiddleware.js';
import { Integration } from '../models/Integration.js';
import { IntegrationService } from '../modules/integrations/IntegrationService.js';
import { logger } from '../utils/logger.js';
import { isValidObjectId } from '../utils/validation.js';

const router = Router();
const MAX_PAYLOAD_BYTES = 256 * 1024;
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.params.integrationId}:${ipKeyGenerator(req.ip)}`
});

function safeEqual(left, right) {
  const first = Buffer.from(String(left || ''));
  const second = Buffer.from(String(right || ''));
  return first.length === second.length && timingSafeEqual(first, second);
}

function verifyRequest(req, secret) {
  if (!secret) return { valid: false, signatureValid: false };
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const suppliedSignature = String(req.get('x-tennat-signature') || '').replace(/^sha256=/, '');
  const expectedSignature = createHmac('sha256', secret).update(rawBody).digest('hex');
  const signatureValid = safeEqual(suppliedSignature, expectedSignature);
  const authorization = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const suppliedKey = req.get('x-integration-key') || authorization;
  return {
    valid: signatureValid || safeEqual(suppliedKey, secret),
    signatureValid
  };
}

router.post('/:integrationId', limiter, async (req, res, next) => {
  let integration = null;
  try {
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ message: 'Payload de integracion demasiado grande' });
    }
    if (!isValidObjectId(req.params.integrationId)) {
      return res.status(400).json({ message: 'integrationId invalido' });
    }
    integration = await Integration.findOne({
      _id: req.params.integrationId,
      status: { $in: ['active', 'error'] }
    }).select('+credentials +webhookSecret');
    if (!integration) return res.status(404).json({ message: 'Integracion no disponible' });
    const access = await checkModuleAccess('integrations', {
      role: 'ADMIN',
      companyId: integration.companyId,
      distributorId: integration.distributorId
    });
    if (!access.enabled) return res.status(404).json({ message: 'Integracion no disponible' });
    const verification = verifyRequest(req, integration.getDecryptedWebhookSecret());
    const signatureRequired = process.env.REQUIRE_WEBHOOK_SIGNATURE === 'true';
    if (!verification.valid || (signatureRequired && !verification.signatureValid)) {
      const error = Object.assign(new Error('Firma o clave de integracion invalida'), {
        status: 403
      });
      await IntegrationService.recordFailure(integration, error).catch(() => {});
      return res.status(403).json({ message: error.message });
    }
    const result = await IntegrationService.processInbound({
      integration,
      payload: req.body || {},
      externalEventId: req.get('x-external-event-id') || ''
    });
    res.status(result.duplicate ? 200 : 201).json({
      received: true,
      duplicate: Boolean(result.duplicate),
      eventId: result.event?._id || null,
      contactId: result.contact?._id || result.event?.contactId || null,
      opportunityId: result.opportunity?._id || result.event?.opportunityId || null
    });
  } catch (error) {
    logger.error('integration.webhook_failed', error, {
      integrationId: integration?._id || req.params.integrationId,
      companyId: integration?.companyId
    });
    if (integration && !error.integrationFailureRecorded) {
      await IntegrationService.recordFailure(integration, error).catch(() => {});
    }
    next(error);
  }
});

export default router;
