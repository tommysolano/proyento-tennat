import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { SatisfactionSurvey } from '../models/SatisfactionSurvey.js';
import { SurveyResponse } from '../models/SurveyResponse.js';
import { ReputationService } from '../modules/reputation/ReputationService.js';
import { publicSlug } from '../modules/reputation/reputationSecurity.js';
import { recordActivity } from '../utils/activity.js';

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware('ADMIN'));
router.use(requireModule('reputation'));
router.use(requireModule('surveys'));
router.use(requirePermission('surveys:manage'));

router.get('/', async (req, res, next) => {
  try {
    res.json(
      await SatisfactionSurvey.find({ companyId: req.user.companyId })
        .sort({ createdAt: -1 })
        .limit(500)
    );
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await ReputationService.createSurvey({ actor: req.user, body: req.body }));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/responses', async (req, res, next) => {
  try {
    const survey = await SatisfactionSurvey.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!survey) return res.status(404).json({ message: 'Encuesta no encontrada' });
    res.json(
      await SurveyResponse.find({ companyId: req.user.companyId, surveyId: survey._id })
        .populate('contactId', 'name email phone')
        .sort({ createdAt: -1 })
        .limit(1000)
    );
  } catch (error) {
    next(error);
  }
});

router.get('/:id/analytics', async (req, res, next) => {
  try {
    const survey = await SatisfactionSurvey.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!survey) return res.status(404).json({ message: 'Encuesta no encontrada' });
    res.json(await ReputationService.surveyAnalytics(survey._id, req.user.companyId));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const survey = await SatisfactionSurvey.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!survey) return res.status(404).json({ message: 'Encuesta no encontrada' });
    res.json(survey);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const survey = await SatisfactionSurvey.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!survey) return res.status(404).json({ message: 'Encuesta no encontrada' });
    for (const field of ['name', 'type', 'questions', 'settings', 'styling', 'metadata']) {
      if (field in req.body) survey[field] = req.body[field];
    }
    if ('slug' in req.body) survey.slug = publicSlug(req.body.slug);
    await survey.save();
    res.json(survey);
  } catch (error) {
    next(error);
  }
});

function statusAction(status, activityType) {
  return async (req, res, next) => {
    try {
      const survey = await SatisfactionSurvey.findOne({ _id: req.params.id, companyId: req.user.companyId });
      if (!survey) return res.status(404).json({ message: 'Encuesta no encontrada' });
      survey.status = status;
      if (status === 'published') survey.publishedAt = new Date();
      await survey.save();
      await recordActivity({
        user: req.user,
        type: activityType,
        summary: `Encuesta ${status}: ${survey.name}`,
        metadata: { satisfactionSurveyId: survey._id }
      });
      res.json(survey);
    } catch (error) {
      next(error);
    }
  };
}

router.patch('/:id/publish', statusAction('published', 'satisfaction_survey_published'));
router.patch('/:id/pause', statusAction('paused', 'satisfaction_survey_paused'));
router.patch('/:id/archive', statusAction('archived', 'satisfaction_survey_archived'));

export default router;
