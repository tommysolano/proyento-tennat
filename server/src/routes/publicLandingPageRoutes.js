import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { BookingLink } from '../models/BookingLink.js';
import { Company } from '../models/Company.js';
import { Form } from '../models/Form.js';
import { LandingPage } from '../models/LandingPage.js';
import { checkModuleAccess } from '../middleware/moduleMiddleware.js';
import { FunnelService } from '../modules/funnels/FunnelService.js';
import { safeTrackingContext, slugifyPublic } from '../modules/marketing/marketingSecurity.js';

const router = Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${slugifyPublic(req.params.slug)}:${ipKeyGenerator(req.ip)}`
});
router.use(limiter);

async function context(slug) {
  const page = await LandingPage.findOne({
    slug: slugifyPublic(slug),
    status: 'published',
    archivedAt: null
  })
    .populate('settings.associatedFormId', 'slug status')
    .populate('settings.associatedBookingLinkId', 'slug status publicEnabled');
  if (!page) return null;
  const company = await Company.findOne({
    _id: page.companyId,
    status: { $in: ['active', 'trial'] }
  }).select('name');
  if (!company) return null;
  const access = await checkModuleAccess('landing_pages', {
    role: 'ADMIN',
    companyId: page.companyId,
    distributorId: page.distributorId
  });
  if (!access.enabled) return null;
  return { page, company };
}

async function sectionSlugs(page) {
  const formIds = [];
  const bookingIds = [];
  for (const section of page.content.sections) {
    if (section.content?.formId) formIds.push(section.content.formId);
    if (section.content?.bookingLinkId) bookingIds.push(section.content.bookingLinkId);
  }
  const [forms, bookings] = await Promise.all([
    Form.find({ _id: { $in: formIds }, companyId: page.companyId, status: 'published' }).select('slug'),
    BookingLink.find({
      _id: { $in: bookingIds },
      companyId: page.companyId,
      status: 'active',
      publicEnabled: true
    }).select('slug')
  ]);
  return {
    forms: new Map(forms.map((item) => [String(item._id), item.slug])),
    bookings: new Map(bookings.map((item) => [String(item._id), item.slug]))
  };
}

router.get('/:slug', async (req, res, next) => {
  try {
    const resolved = await context(req.params.slug);
    if (!resolved) return res.status(404).json({ message: 'Landing page no disponible' });
    const payload = FunnelService.publicLandingPayload(resolved.page);
    const references = await sectionSlugs(resolved.page);
    const orderedSections = [...resolved.page.content.sections].sort(
      (a, b) => a.order - b.order
    );
    payload.content.sections = payload.content.sections.map((section, index) => {
      const original = orderedSections[index];
      delete section.content.formId;
      delete section.content.bookingLinkId;
      if (original.content?.formId) section.content.formSlug = references.forms.get(String(original.content.formId)) || '';
      if (original.content?.bookingLinkId) section.content.bookingLinkSlug = references.bookings.get(String(original.content.bookingLinkId)) || '';
      return section;
    });
    if (resolved.page.settings.trackingEnabled) {
      await FunnelService.recordPageView({
        target: {
          companyId: resolved.page.companyId,
          distributorId: resolved.page.distributorId,
          landingPageId: resolved.page._id,
          formId: resolved.page.settings.associatedFormId?._id || null
        },
        tracking: safeTrackingContext(req),
        path: req.originalUrl
      }).catch(() => {});
    }
    res.json({ ...payload, company: { name: resolved.company.name } });
  } catch (error) {
    next(error);
  }
});

router.post('/:slug/events', async (req, res, next) => {
  try {
    const resolved = await context(req.params.slug);
    if (!resolved) return res.status(404).json({ message: 'Landing page no disponible' });
    if (req.body.type !== 'button_click') {
      return res.status(400).json({ message: 'Tipo de evento no permitido' });
    }
    const event = await FunnelService.recordConversion({
      target: {
        companyId: resolved.page.companyId,
        distributorId: resolved.page.distributorId,
        landingPageId: resolved.page._id
      },
      type: 'button_click',
      tracking: safeTrackingContext(req),
      metadata: { label: req.body.label || '' }
    });
    res.status(201).json({ eventId: event._id });
  } catch (error) {
    next(error);
  }
});

export default router;
