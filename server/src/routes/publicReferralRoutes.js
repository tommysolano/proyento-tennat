import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { safeTrackingContext } from '../modules/marketing/marketingSecurity.js';
import { LoyaltyService } from '../modules/loyalty/LoyaltyService.js';
import { publicSlug } from '../modules/reputation/reputationSecurity.js';

const router = Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${publicSlug(req.params.programSlug)}:${req.params.code}:${ipKeyGenerator(req.ip)}`
});
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${publicSlug(req.params.programSlug)}:${req.params.code}:${ipKeyGenerator(req.ip)}`
});

router.get('/:programSlug/:code', limiter, async (req, res, next) => {
  try {
    const payload = await LoyaltyService.publicReferral(req.params.programSlug, req.params.code);
    if (!payload) return res.status(404).json({ message: 'Referido no disponible' });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/:programSlug/:code/submit', submitLimiter, async (req, res, next) => {
  try {
    res.status(201).json(
      await LoyaltyService.submitPublicReferral({
        programSlug: req.params.programSlug,
        code: req.params.code,
        body: req.body,
        tracking: safeTrackingContext(req)
      })
    );
  } catch (error) {
    next(error);
  }
});

export default router;
