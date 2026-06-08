import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { ReputationService } from '../modules/reputation/ReputationService.js';
import { requestIpHash } from '../modules/reputation/reputationSecurity.js';
import { safeTrackingContext } from '../modules/marketing/marketingSecurity.js';

const router = Router();
const widgetRouter = Router();
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.params.token || req.params.slug}:${ipKeyGenerator(req.ip)}`
});
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.params.token}:${ipKeyGenerator(req.ip)}`
});

router.get('/request/:token', readLimiter, async (req, res, next) => {
  try {
    const request = await ReputationService.publicReviewRequest(req.params.token);
    if (!request) return res.status(404).json({ message: 'Solicitud no disponible' });
    res.json(request);
  } catch (error) {
    next(error);
  }
});

router.post('/request/:token/submit', submitLimiter, async (req, res, next) => {
  try {
    const tracking = safeTrackingContext(req);
    tracking.ipHash = requestIpHash(req);
    await ReputationService.submitReview({
      token: req.params.token,
      body: req.body,
      tracking
    });
    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

widgetRouter.get('/:slug', readLimiter, async (req, res, next) => {
  try {
    const widget = await ReputationService.publicWidget(req.params.slug);
    if (!widget) return res.status(404).json({ message: 'Widget no disponible' });
    res.json(widget);
  } catch (error) {
    next(error);
  }
});

export { widgetRouter as publicReviewWidgetRoutes };
export default router;
