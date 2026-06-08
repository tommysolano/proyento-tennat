import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Review } from '../models/Review.js';
import { Testimonial } from '../models/Testimonial.js';
import { ReputationService } from '../modules/reputation/ReputationService.js';

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware('ADMIN'));
router.use(requireModule('reputation'));
router.use(requireModule('testimonials'));
router.use(requirePermission('testimonials:manage'));

router.get('/', async (req, res, next) => {
  try {
    res.json(
      await Testimonial.find({ companyId: req.user.companyId })
        .populate('reviewId', 'rating status reviewerName')
        .populate('contactId', 'name')
        .sort({ featured: -1, order: 1, createdAt: -1 })
        .limit(500)
    );
  } catch (error) {
    next(error);
  }
});

router.post('/from-review/:reviewId', async (req, res, next) => {
  try {
    const review = await Review.findOne({
      _id: req.params.reviewId,
      companyId: req.user.companyId
    });
    if (!review) return res.status(404).json({ message: 'Resena no encontrada' });
    res.status(201).json(
      await ReputationService.createTestimonialFromReview({
        actor: req.user,
        review,
        body: req.body
      })
    );
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const testimonial = await Testimonial.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!testimonial) return res.status(404).json({ message: 'Testimonio no encontrado' });
    for (const field of ['authorName', 'authorTitle', 'quote', 'rating', 'imageUrl', 'featured', 'order']) {
      if (field in req.body) testimonial[field] = req.body[field];
    }
    await testimonial.save();
    res.json(testimonial);
  } catch (error) {
    next(error);
  }
});

function status(status) {
  return async (req, res, next) => {
    try {
      const testimonial = await Testimonial.findOne({
        _id: req.params.id,
        companyId: req.user.companyId
      });
      if (!testimonial) return res.status(404).json({ message: 'Testimonio no encontrado' });
      res.json(
        await ReputationService.setTestimonialStatus({
          actor: req.user,
          testimonial,
          status
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

router.patch('/:id/publish', status('published'));
router.patch('/:id/archive', status('archived'));

export default router;
