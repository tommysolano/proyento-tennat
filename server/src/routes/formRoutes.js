import mongoose from 'mongoose';
import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { checkModuleAccess, requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Form } from '../models/Form.js';
import { FormSubmission } from '../models/FormSubmission.js';
import { FormsService } from '../modules/forms/FormsService.js';
import { hasUserPermission } from '../core/permissions/permissions.js';

const router = Router();

function scope(req) {
  if (req.user.role === 'SUPERADMIN') {
    return req.query.companyId && mongoose.isValidObjectId(req.query.companyId)
      ? { companyId: req.query.companyId }
      : {};
  }
  return { companyId: req.user.companyId };
}

async function ensureSurveyAccess(user, type) {
  if (type !== 'survey') return;
  const access = await checkModuleAccess('surveys', user);
  if (!access.enabled) {
    throw Object.assign(new Error(access.message), { status: access.status || 403 });
  }
}

function canReadAttribution(user) {
  return [
    'attribution:read',
    'attribution:read_team',
    'attribution:read_all'
  ].some((permission) => hasUserPermission(user, permission));
}

router.use(authMiddleware);
router.use(roleMiddleware('SUPERADMIN', 'ADMIN', 'SUPERVISOR'));
router.use(requireModule('forms'));

router.get(
  '/',
  requireAnyPermission('forms:read', 'forms:read_team', 'forms:read_all'),
  async (req, res, next) => {
    try {
      const filter = scope(req);
      if (req.query.status) filter.status = req.query.status;
      if (req.query.type) filter.type = req.query.type;
      if (req.query.search) {
        const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.name = new RegExp(safe, 'i');
      }
      let query = Form.find(filter)
          .populate('createdBy updatedBy', 'name email role')
          .sort({ createdAt: -1 })
          .limit(500);
      if (!canReadAttribution(req.user)) query = query.select('-attribution');
      res.json(await query);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  requireAnyPermission('forms:manage'),
  async (req, res, next) => {
    try {
      await ensureSurveyAccess(req.user, req.body.type);
      res.status(201).json(await FormsService.createForm({ actor: req.user, body: req.body }));
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id/submissions',
  requireAnyPermission('forms:submissions', 'forms:submissions_read', 'forms:read_all'),
  async (req, res, next) => {
    try {
      const form = await Form.findOne({ _id: req.params.id, ...scope(req) }).select('_id companyId');
      if (!form) return res.status(404).json({ message: 'Formulario no encontrado' });
      const filter = { formId: form._id, companyId: form.companyId };
      if (req.query.status) filter.status = req.query.status;
      let query = FormSubmission.find(filter)
          .populate('contactId', 'name email phone status')
          .populate('opportunityId', 'title status value currency')
          .sort({ createdAt: -1 })
          .limit(Math.min(Number(req.query.limit) || 250, 500));
      if (!canReadAttribution(req.user)) query = query.select('-attribution');
      res.json(await query);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id/analytics',
  requireAnyPermission('forms:analytics', 'forms:read_all'),
  async (req, res, next) => {
    try {
      const form = await Form.findOne({ _id: req.params.id, ...scope(req) }).select('_id companyId');
      if (!form) return res.status(404).json({ message: 'Formulario no encontrado' });
      res.json(await FormsService.analytics(form._id, form.companyId));
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id',
  requireAnyPermission('forms:read', 'forms:read_team', 'forms:read_all'),
  async (req, res, next) => {
    try {
      let query = Form.findOne({ _id: req.params.id, ...scope(req) })
        .populate('settings.assignTo settings.notifyUsers', 'name email role')
        .populate('settings.addTags', 'name color')
        .populate('settings.pipelineId', 'name')
        .populate('settings.stageId', 'name')
        .populate('settings.bookingLinkId', 'title slug');
      if (!canReadAttribution(req.user)) query = query.select('-attribution');
      const form = await query;
      if (!form) return res.status(404).json({ message: 'Formulario no encontrado' });
      res.json(form);
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id',
  requireAnyPermission('forms:manage'),
  async (req, res, next) => {
    try {
      const form = await Form.findOne({ _id: req.params.id, companyId: req.user.companyId });
      if (!form) return res.status(404).json({ message: 'Formulario no encontrado' });
      await ensureSurveyAccess(req.user, req.body.type || form.type);
      res.json(await FormsService.updateForm({ actor: req.user, form, body: req.body }));
    } catch (error) {
      next(error);
    }
  }
);

function statusAction(status) {
  return async (req, res, next) => {
    try {
      const form = await Form.findOne({ _id: req.params.id, companyId: req.user.companyId });
      if (!form) return res.status(404).json({ message: 'Formulario no encontrado' });
      await ensureSurveyAccess(req.user, form.type);
      res.json(await FormsService.setStatus({ actor: req.user, form, status }));
    } catch (error) {
      next(error);
    }
  };
}

router.patch('/:id/publish', requireAnyPermission('forms:manage'), statusAction('published'));
router.patch('/:id/pause', requireAnyPermission('forms:manage'), statusAction('paused'));
router.patch('/:id/archive', requireAnyPermission('forms:manage'), statusAction('archived'));

export default router;
