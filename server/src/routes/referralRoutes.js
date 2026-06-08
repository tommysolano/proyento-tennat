import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Referral } from '../models/Referral.js';
import { ReferralProgram } from '../models/ReferralProgram.js';
import { LoyaltyService } from '../modules/loyalty/LoyaltyService.js';
import { reputationScope } from '../modules/reputation/reputationScope.js';
import { publicSlug } from '../modules/reputation/reputationSecurity.js';
import { recordActivity } from '../utils/activity.js';

const programRouter = Router();
const referralRouter = Router();

programRouter.use(authMiddleware);
programRouter.use(roleMiddleware('ADMIN', 'SUPERVISOR'));
programRouter.use(requireModule('loyalty'));
programRouter.use(requireModule('referrals'));

programRouter.get(
  '/',
  requireAnyPermission('referrals:manage', 'referrals:read_team'),
  async (req, res, next) => {
    try {
      res.json(
        await ReferralProgram.find({ companyId: req.user.companyId })
          .sort({ createdAt: -1 })
          .limit(500)
      );
    } catch (error) {
      next(error);
    }
  }
);

programRouter.post('/', requireAnyPermission('referrals:manage'), async (req, res, next) => {
  try {
    res.status(201).json(
      await LoyaltyService.createReferralProgram({ actor: req.user, body: req.body })
    );
  } catch (error) {
    next(error);
  }
});

programRouter.get(
  '/:id',
  requireAnyPermission('referrals:manage', 'referrals:read_team'),
  async (req, res, next) => {
    try {
      const program = await ReferralProgram.findOne({
        _id: req.params.id,
        companyId: req.user.companyId
      });
      if (!program) return res.status(404).json({ message: 'Programa no encontrado' });
      res.json(program);
    } catch (error) {
      next(error);
    }
  }
);

programRouter.patch('/:id', requireAnyPermission('referrals:manage'), async (req, res, next) => {
  try {
    const program = await ReferralProgram.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!program) return res.status(404).json({ message: 'Programa no encontrado' });
    for (const field of ['name', 'rewardDescription', 'referrerReward', 'refereeReward', 'settings', 'metadata']) {
      if (field in req.body) program[field] = req.body[field];
    }
    if ('slug' in req.body) program.slug = publicSlug(req.body.slug);
    await program.save();
    res.json(program);
  } catch (error) {
    next(error);
  }
});

function programStatus(status, activityType) {
  return async (req, res, next) => {
    try {
      const program = await ReferralProgram.findOne({
        _id: req.params.id,
        companyId: req.user.companyId
      });
      if (!program) return res.status(404).json({ message: 'Programa no encontrado' });
      program.status = status;
      await program.save();
      await recordActivity({
        user: req.user,
        type: activityType,
        summary: `Programa de referidos ${status}: ${program.name}`,
        metadata: { referralProgramId: program._id }
      });
      res.json(program);
    } catch (error) {
      next(error);
    }
  };
}

programRouter.patch('/:id/activate', requireAnyPermission('referrals:manage'), programStatus('active', 'referral_program_activated'));
programRouter.patch('/:id/pause', requireAnyPermission('referrals:manage'), programStatus('paused', 'referral_program_paused'));
programRouter.patch('/:id/archive', requireAnyPermission('referrals:manage'), programStatus('archived', 'referral_program_archived'));

referralRouter.use(authMiddleware);
referralRouter.use(roleMiddleware('ADMIN', 'SUPERVISOR'));
referralRouter.use(requireModule('loyalty'));
referralRouter.use(requireModule('referrals'));

referralRouter.get(
  '/',
  requireAnyPermission('referrals:manage', 'referrals:read_team'),
  async (req, res, next) => {
    try {
      const filter = req.user.role === 'ADMIN'
        ? { companyId: req.user.companyId }
        : await reputationScope(req.user, 'referrerContactId');
      if (req.query.status) filter.status = req.query.status;
      res.json(
        await Referral.find(filter)
          .populate('referralProgramId', 'name slug status')
          .populate('referrerContactId referredContactId', 'name email phone assignedTo')
          .sort({ createdAt: -1 })
          .limit(1000)
      );
    } catch (error) {
      next(error);
    }
  }
);

referralRouter.post('/', requireAnyPermission('referrals:manage'), async (req, res, next) => {
  try {
    const program = await ReferralProgram.findOne({
      _id: req.body.referralProgramId,
      companyId: req.user.companyId
    });
    if (!program) return res.status(404).json({ message: 'Programa no encontrado' });
    res.status(201).json(
      await LoyaltyService.createReferral({ actor: req.user, program, body: req.body })
    );
  } catch (error) {
    next(error);
  }
});

referralRouter.patch('/:id/convert', requireAnyPermission('referrals:manage'), async (req, res, next) => {
  try {
    const referral = await Referral.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!referral) return res.status(404).json({ message: 'Referido no encontrado' });
    res.json(await LoyaltyService.markReferralConverted({ actor: req.user, referral }));
  } catch (error) {
    next(error);
  }
});

referralRouter.patch('/:id/reward', requireAnyPermission('referrals:manage'), async (req, res, next) => {
  try {
    const referral = await Referral.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!referral) return res.status(404).json({ message: 'Referido no encontrado' });
    res.json(
      await LoyaltyService.rewardReferral({
        actor: req.user,
        referral,
        rewardStatus: req.body.rewardStatus
      })
    );
  } catch (error) {
    next(error);
  }
});

export { referralRouter as referralRoutes };
export default programRouter;
