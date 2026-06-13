import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Company } from '../models/Company.js';
import { Form } from '../models/Form.js';
import { Funnel } from '../models/Funnel.js';
import { FunnelStep } from '../models/FunnelStep.js';
import { LandingPage } from '../models/LandingPage.js';
import { checkModuleAccess } from '../middleware/moduleMiddleware.js';
import { FormsService } from '../modules/forms/FormsService.js';
import { FunnelService } from '../modules/funnels/FunnelService.js';
import { safeTrackingContext, slugifyPublic } from '../modules/marketing/marketingSecurity.js';
import { mergeMarketingAttribution } from '../modules/marketing/marketingAttribution.js';

const router = Router();
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 180,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${slugifyPublic(req.params.slug)}:${ipKeyGenerator(req.ip)}`
});
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${slugifyPublic(req.params.slug)}:${ipKeyGenerator(req.ip)}`
});

async function context(slug) {
  const form = await Form.findOne({
    slug: slugifyPublic(slug),
    status: 'published',
    archivedAt: null
  }).populate('settings.bookingLinkId', 'slug title status publicEnabled');
  if (!form) return null;
  const company = await Company.findOne({
    _id: form.companyId,
    status: { $in: ['active', 'trial'] }
  }).select('name');
  if (!company) return null;
  const pseudoUser = {
    role: 'ADMIN',
    companyId: form.companyId,
    distributorId: form.distributorId
  };
  const modules = [
    checkModuleAccess('forms', pseudoUser),
    form.type === 'survey' ? checkModuleAccess('surveys', pseudoUser) : Promise.resolve({ enabled: true })
  ];
  if ((await Promise.all(modules)).some((item) => !item.enabled)) return null;
  return { form, company };
}

async function resolveSource(form, body) {
  const source = body.source || {};
  if (source.funnelSlug && source.stepSlug) {
    const funnel = await Funnel.findOne({
      slug: slugifyPublic(source.funnelSlug),
      companyId: form.companyId,
      status: 'published'
    });
    const step = funnel
      ? await FunnelStep.findOne({
          funnelId: funnel._id,
          companyId: form.companyId,
          slug: slugifyPublic(source.stepSlug),
          status: 'published'
        })
      : null;
    const funnelLanding = step?.landingPageId
      ? await LandingPage.findOne({
          _id: step.landingPageId,
          companyId: form.companyId,
          status: 'published',
          $or: [
            { 'settings.associatedFormId': form._id },
            { 'content.sections.content.formId': form._id }
          ]
        })
      : null;
    if (funnel && step && (String(step.formId || '') === String(form._id) || funnelLanding)) {
      return {
        sourceType: 'funnel_step',
        sourceId: step._id,
        funnelId: funnel._id,
        funnelStepId: step._id,
        attribution: mergeMarketingAttribution(
          mergeMarketingAttribution(funnel.attribution, funnelLanding?.attribution),
          step.attribution
        )
      };
    }
  }
  if (source.landingSlug) {
    const page = await LandingPage.findOne({
      slug: slugifyPublic(source.landingSlug),
      companyId: form.companyId,
      status: 'published',
      $or: [
        { 'settings.associatedFormId': form._id },
        { 'content.sections.content.formId': form._id }
      ]
    });
    if (page) {
      return {
        sourceType: 'landing_page',
        sourceId: page._id,
        attribution: page.attribution?.toObject?.() || page.attribution || {}
      };
    }
  }
  return { sourceType: 'form' };
}

router.get('/:slug', readLimiter, async (req, res, next) => {
  try {
    const resolved = await context(req.params.slug);
    if (!resolved) return res.status(404).json({ message: 'Formulario no disponible' });
    await FunnelService.recordPageView({
      target: {
        companyId: resolved.form.companyId,
        distributorId: resolved.form.distributorId,
        formId: resolved.form._id,
        attribution: resolved.form.attribution
      },
      tracking: safeTrackingContext(req),
      path: req.originalUrl
    }).catch(() => {});
    res.json({
      ...FormsService.publicPayload(resolved.form),
      company: { name: resolved.company.name }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/submit', submitLimiter, async (req, res, next) => {
  try {
    const resolved = await context(req.params.slug);
    if (!resolved) return res.status(404).json({ message: 'Formulario no disponible' });
    const result = await FormsService.processSubmission({
      form: resolved.form,
      body: req.body || {},
      tracking: safeTrackingContext(req),
      source: await resolveSource(resolved.form, req.body || {})
    });
    res.status(result.spam ? 202 : 201).json(
      FormsService.successPayload(resolved.form, result)
    );
  } catch (error) {
    next(error);
  }
});

export default router;
