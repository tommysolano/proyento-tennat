import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Note } from '../models/Note.js';
import { recordActivity } from '../utils/activity.js';
import { assertRelatedResource, tenantFields } from '../utils/crmScope.js';
import { cleanString } from '../utils/validation.js';

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requireAnyPermission('notes:manage', 'notes:create_team', 'notes:create_assigned'));
router.use(requireModule('crm'));

router.get('/', async (req, res, next) => {
  try {
    const { relatedType, relatedId } = req.query;
    if (!['contact', 'opportunity'].includes(relatedType) || !relatedId) {
      return res.status(400).json({ message: 'relatedType y relatedId son requeridos' });
    }
    await assertRelatedResource(req.user, relatedType, relatedId);
    res.json(await Note.find({
      companyId: req.user.companyId,
      relatedType,
      relatedId
    }).populate('createdBy', 'name email role').sort({ createdAt: -1 }));
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const text = cleanString(req.body.text);
    if (!text) return res.status(400).json({ message: 'text es requerido' });
    if (!['contact', 'opportunity'].includes(req.body.relatedType)) {
      return res.status(400).json({ message: 'relatedType invalido' });
    }
    const relatedId = await assertRelatedResource(req.user, req.body.relatedType, req.body.relatedId);
    const note = await Note.create({
      ...tenantFields(req.user),
      relatedType: req.body.relatedType,
      relatedId,
      text,
      createdBy: req.user._id,
      visibility: req.body.visibility === 'internal' ? 'internal' : 'team',
      metadata: req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}
    });
    const metadata = {
      noteId: note._id,
      relatedType: note.relatedType,
      relatedId,
      contactId: note.relatedType === 'contact' ? relatedId : undefined,
      opportunityId: note.relatedType === 'opportunity' ? relatedId : undefined
    };
    await recordActivity({ user: req.user, type: 'crm_note_created', summary: `Nota CRM creada en ${note.relatedType}`, metadata });
    res.status(201).json(await note.populate('createdBy', 'name email role'));
  } catch (error) { next(error); }
});

export default router;
