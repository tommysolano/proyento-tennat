import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { BookingLink } from '../models/BookingLink.js';
import { Company } from '../models/Company.js';
import { Form } from '../models/Form.js';
import { Funnel } from '../models/Funnel.js';
import { FunnelStep } from '../models/FunnelStep.js';
import { LandingPage } from '../models/LandingPage.js';
import { SatisfactionSurvey } from '../models/SatisfactionSurvey.js';
import { checkModuleAccess } from '../middleware/moduleMiddleware.js';
import { FunnelService } from '../modules/funnels/FunnelService.js';
import { safeTrackingContext, slugifyPublic } from '../modules/marketing/marketingSecurity.js';
import { mergeMarketingAttribution } from '../modules/marketing/marketingAttribution.js';

const router = Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${slugifyPublic(req.params.funnelSlug)}:${ipKeyGenerator(req.ip)}`
});
router.use(limiter);

async function resolve(funnelSlug, stepSlug = '') {
  const funnel = await Funnel.findOne({
    slug: slugifyPublic(funnelSlug),
    status: 'published',
    archivedAt: null
  });
  if (!funnel) return null;
  const company = await Company.findOne({
    _id: funnel.companyId,
    status: { $in: ['active', 'trial'] }
  }).select('name');
  if (!company) return null;
  const access = await checkModuleAccess('funnels', {
    role: 'ADMIN',
    companyId: funnel.companyId,
    distributorId: funnel.distributorId
  });
  if (!access.enabled) return null;
  let step;
  if (stepSlug) {
    step = await FunnelStep.findOne({
      funnelId: funnel._id,
      companyId: funnel.companyId,
      slug: slugifyPublic(stepSlug),
      status: 'published'
    });
  } else if (funnel.settings.entryStepId) {
    step = await FunnelStep.findOne({
      _id: funnel.settings.entryStepId,
      funnelId: funnel._id,
      companyId: funnel.companyId,
      status: 'published'
    });
  }
  if (!step) {
    step = await FunnelStep.findOne({
      funnelId: funnel._id,
      companyId: funnel.companyId,
      status: 'published'
    }).sort({ order: 1 });
  }
  if (!step) return null;
  const [landingPage, form, bookingLink, satisfactionSurvey, nextStep] = await Promise.all([
    step.landingPageId
      ? LandingPage.findOne({ _id: step.landingPageId, companyId: funnel.companyId, status: 'published' }).select('slug')
      : null,
    step.formId
      ? Form.findOne({ _id: step.formId, companyId: funnel.companyId, status: 'published' }).select('slug')
      : null,
    step.bookingLinkId
      ? BookingLink.findOne({
          _id: step.bookingLinkId,
          companyId: funnel.companyId,
          status: 'active',
          publicEnabled: true
        }).select('slug')
      : null,
    step.satisfactionSurveyId
      ? SatisfactionSurvey.findOne({
          _id: step.satisfactionSurveyId,
          companyId: funnel.companyId,
          status: 'published'
        }).select('slug')
      : null,
    step.settings.nextStepId
      ? FunnelStep.findOne({
          _id: step.settings.nextStepId,
          funnelId: funnel._id,
          companyId: funnel.companyId,
          status: 'published'
        }).select('slug')
      : FunnelStep.findOne({
          funnelId: funnel._id,
          companyId: funnel.companyId,
          status: 'published',
          order: { $gt: step.order }
        }).sort({ order: 1 }).select('slug')
  ]);
  return {
    funnel,
    step,
    company,
    landingPage,
    form,
    bookingLink,
    satisfactionSurvey,
    nextStep
  };
}

async function render(req, res, next) {
  try {
    const context = await resolve(req.params.funnelSlug, req.params.stepSlug);
    if (!context) return res.status(404).json({ message: 'Funnel no disponible' });
    if (context.funnel.settings.trackingEnabled) {
      await FunnelService.recordPageView({
        target: {
          companyId: context.funnel.companyId,
          distributorId: context.funnel.distributorId,
          funnelId: context.funnel._id,
          funnelStepId: context.step._id,
          landingPageId: context.step.landingPageId,
          formId: context.step.formId,
          attribution: mergeMarketingAttribution(
            context.funnel.attribution,
            context.step.attribution
          )
        },
        tracking: safeTrackingContext(req),
        path: req.originalUrl
      }).catch(() => {});
    }
    res.json({
      ...FunnelService.publicFunnelPayload(context.funnel, context.step, context),
      company: { name: context.company.name }
    });
  } catch (error) {
    next(error);
  }
}

router.get('/:funnelSlug', render);
router.get('/:funnelSlug/:stepSlug', render);

router.post('/:funnelSlug/:stepSlug/events', async (req, res, next) => {
  try {
    const context = await resolve(req.params.funnelSlug, req.params.stepSlug);
    if (!context) return res.status(404).json({ message: 'Funnel no disponible' });
    if (!['button_click', 'funnel_step_completed'].includes(req.body.type)) {
      return res.status(400).json({ message: 'Tipo de evento no permitido' });
    }
    const event = await FunnelService.recordConversion({
      target: {
        companyId: context.funnel.companyId,
        distributorId: context.funnel.distributorId,
        funnelId: context.funnel._id,
        funnelStepId: context.step._id,
        landingPageId: context.step.landingPageId,
        formId: context.step.formId,
        attribution: mergeMarketingAttribution(
          context.funnel.attribution,
          context.step.attribution
        )
      },
      type: req.body.type,
      tracking: safeTrackingContext(req),
      metadata: { label: req.body.label || '' }
    });
    res.status(201).json({ eventId: event._id });
  } catch (error) {
    next(error);
  }
});

export default router;
