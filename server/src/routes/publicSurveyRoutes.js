import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Company } from '../models/Company.js';
import { SatisfactionSurvey } from '../models/SatisfactionSurvey.js';
import { safeTrackingContext } from '../modules/marketing/marketingSecurity.js';
import { ReputationService } from '../modules/reputation/ReputationService.js';
import { publicSlug } from '../modules/reputation/reputationSecurity.js';
import { checkModuleAccess } from '../middleware/moduleMiddleware.js';

const router = Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${publicSlug(req.params.slug)}:${ipKeyGenerator(req.ip)}`
});
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${publicSlug(req.params.slug)}:${ipKeyGenerator(req.ip)}`
});

async function context(slug) {
  const survey = await SatisfactionSurvey.findOne({
    slug: publicSlug(slug),
    status: 'published'
  });
  if (!survey) return null;
  const company = await Company.findOne({
    _id: survey.companyId,
    status: { $in: ['active', 'trial'] }
  }).select('name');
  if (!company) return null;
  const [reputation, surveys] = await Promise.all([
    checkModuleAccess('reputation', {
      role: 'ADMIN',
      companyId: survey.companyId,
      distributorId: survey.distributorId
    }),
    checkModuleAccess('surveys', {
      role: 'ADMIN',
      companyId: survey.companyId,
      distributorId: survey.distributorId
    })
  ]);
  return reputation.enabled && surveys.enabled ? { survey, company } : null;
}

router.get('/:slug', limiter, async (req, res, next) => {
  try {
    const resolved = await context(req.params.slug);
    if (!resolved) return res.status(404).json({ message: 'Encuesta no disponible' });
    res.json({
      name: resolved.survey.name,
      slug: resolved.survey.slug,
      type: resolved.survey.type,
      questions: resolved.survey.questions.map((question) => ({
        key: question.key,
        label: question.label,
        type: question.type,
        required: question.required,
        options: question.options,
        order: question.order
      })),
      settings: {
        title: resolved.survey.settings.title,
        description: resolved.survey.settings.description,
        successMessage: resolved.survey.settings.successMessage
      },
      styling: resolved.survey.styling,
      company: { name: resolved.company.name }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/submit', submitLimiter, async (req, res, next) => {
  try {
    const resolved = await context(req.params.slug);
    if (!resolved) return res.status(404).json({ message: 'Encuesta no disponible' });
    await ReputationService.submitSurvey({
      survey: resolved.survey,
      body: { values: req.body.values || req.body },
      tracking: safeTrackingContext(req)
    });
    res.status(201).json({
      success: true,
      successMessage: resolved.survey.settings.successMessage
    });
  } catch (error) {
    next(error);
  }
});

export default router;
