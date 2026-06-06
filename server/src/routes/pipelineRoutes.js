import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Opportunity } from '../models/Opportunity.js';
import { Pipeline } from '../models/Pipeline.js';
import { PipelineStage } from '../models/PipelineStage.js';
import { recordActivity } from '../utils/activity.js';
import { tenantFields } from '../utils/crmScope.js';
import { cleanString } from '../utils/validation.js';

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requireAnyPermission('pipelines:manage', 'opportunities:read_team', 'opportunities:read_assigned'));
router.use(requireModule('crm'));
router.use(requireModule('opportunities'));

router.get('/', async (req, res, next) => {
  try {
    const pipelines = await Pipeline.find({ companyId: req.user.companyId, status: 'active' }).sort({ createdAt: 1 }).lean();
    const stages = await PipelineStage.find({ companyId: req.user.companyId, status: 'active' }).sort({ order: 1 }).lean();
    res.json(pipelines.map((pipeline) => ({
      ...pipeline,
      stages: stages.filter((stage) => stage.pipelineId.toString() === pipeline._id.toString())
    })));
  } catch (error) { next(error); }
});

router.post('/', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const name = cleanString(req.body.name);
    if (!name) return res.status(400).json({ message: 'name es requerido' });
    const pipeline = await Pipeline.create({
      ...tenantFields(req.user),
      name,
      description: cleanString(req.body.description),
      createdBy: req.user._id
    });
    await recordActivity({ user: req.user, type: 'pipeline_created', summary: `Pipeline creado: ${pipeline.name}`, metadata: { pipelineId: pipeline._id } });
    res.status(201).json(pipeline);
  } catch (error) { next(error); }
});

router.patch('/:id', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const pipeline = await Pipeline.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!pipeline) return res.status(404).json({ message: 'Pipeline no encontrado' });
    for (const field of ['name', 'description', 'status']) if (field in req.body) pipeline[field] = req.body[field];
    await pipeline.save();
    await recordActivity({ user: req.user, type: 'pipeline_updated', summary: `Pipeline actualizado: ${pipeline.name}`, metadata: { pipelineId: pipeline._id } });
    res.json(pipeline);
  } catch (error) { next(error); }
});

router.get('/:id/stages', async (req, res, next) => {
  try {
    const pipeline = await Pipeline.exists({ _id: req.params.id, companyId: req.user.companyId });
    if (!pipeline) return res.status(404).json({ message: 'Pipeline no encontrado' });
    res.json(await PipelineStage.find({ companyId: req.user.companyId, pipelineId: req.params.id, status: 'active' }).sort({ order: 1 }));
  } catch (error) { next(error); }
});

router.post('/:id/stages', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const name = cleanString(req.body.name);
    if (!name) return res.status(400).json({ message: 'name es requerido' });
    const pipeline = await Pipeline.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!pipeline) return res.status(404).json({ message: 'Pipeline no encontrado' });
    const stage = await PipelineStage.create({
      ...tenantFields(req.user),
      pipelineId: pipeline._id,
      name,
      order: Number.isFinite(Number(req.body.order)) ? Number(req.body.order) : 0,
      probability: Number(req.body.probability) || 0,
      color: req.body.color || '#0e7490'
    });
    await recordActivity({ user: req.user, type: 'pipeline_stage_created', summary: `Etapa creada: ${stage.name}`, metadata: { pipelineId: pipeline._id, stageId: stage._id } });
    res.status(201).json(stage);
  } catch (error) { next(error); }
});

router.patch('/:pipelineId/stages/:stageId', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    const stage = await PipelineStage.findOne({
      _id: req.params.stageId,
      pipelineId: req.params.pipelineId,
      companyId: req.user.companyId
    });
    if (!stage) return res.status(404).json({ message: 'Etapa no encontrada' });
    for (const field of ['name', 'order', 'probability', 'color', 'status']) if (field in req.body) stage[field] = req.body[field];
    if (stage.status === 'inactive' && await Opportunity.exists({ companyId: req.user.companyId, stageId: stage._id, status: 'open' })) {
      return res.status(409).json({ message: 'No se puede desactivar una etapa con oportunidades abiertas' });
    }
    await stage.save();
    await recordActivity({ user: req.user, type: 'pipeline_stage_updated', summary: `Etapa actualizada: ${stage.name}`, metadata: { pipelineId: stage.pipelineId, stageId: stage._id } });
    res.json(stage);
  } catch (error) { next(error); }
});

router.put('/:id/stages/reorder', roleMiddleware('ADMIN'), async (req, res, next) => {
  try {
    if (!Array.isArray(req.body.stageIds)) return res.status(400).json({ message: 'stageIds debe ser un arreglo' });
    const stages = await PipelineStage.find({ companyId: req.user.companyId, pipelineId: req.params.id, _id: { $in: req.body.stageIds } });
    if (stages.length !== req.body.stageIds.length) return res.status(400).json({ message: 'Una etapa no pertenece al pipeline' });
    await Promise.all(req.body.stageIds.map((id, order) => PipelineStage.updateOne({ _id: id }, { order })));
    await recordActivity({ user: req.user, type: 'pipeline_stage_reordered', summary: 'Etapas reordenadas', metadata: { pipelineId: req.params.id, stageIds: req.body.stageIds } });
    res.json(await PipelineStage.find({ companyId: req.user.companyId, pipelineId: req.params.id }).sort({ order: 1 }));
  } catch (error) { next(error); }
});

export default router;
