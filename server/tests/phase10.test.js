import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { MODULE_REGISTRY } from '../src/core/modules/moduleRegistry.js';
import { hasPermission } from '../src/core/permissions/permissions.js';
import { ActivityLog } from '../src/models/ActivityLog.js';
import { ConversionEvent } from '../src/models/ConversionEvent.js';
import { Coupon } from '../src/models/Coupon.js';
import { CouponRedemption } from '../src/models/CouponRedemption.js';
import { FunnelStep } from '../src/models/FunnelStep.js';
import { LandingPage } from '../src/models/LandingPage.js';
import { Notification } from '../src/models/Notification.js';
import { Plan } from '../src/models/Plan.js';
import { Referral } from '../src/models/Referral.js';
import { ReferralProgram } from '../src/models/ReferralProgram.js';
import { Review } from '../src/models/Review.js';
import { ReviewRequest } from '../src/models/ReviewRequest.js';
import { ReviewWidget } from '../src/models/ReviewWidget.js';
import { SatisfactionSurvey } from '../src/models/SatisfactionSurvey.js';
import { SurveyResponse } from '../src/models/SurveyResponse.js';
import { Testimonial } from '../src/models/Testimonial.js';
import { UsageRecord } from '../src/models/UsageRecord.js';
import { ensureSuperAdmin } from '../src/data/superAdminBootstrap.js';
import { LoyaltyService } from '../src/modules/loyalty/LoyaltyService.js';
import { ReputationService } from '../src/modules/reputation/ReputationService.js';
import {
  createPublicToken,
  createReferralCode,
  publicReviewUrl
} from '../src/modules/reputation/reputationSecurity.js';
import {
  PLANNED_ACTIONS,
  WORKFLOW_TRIGGERS
} from '../src/modules/workflows/workflowCatalog.js';

const objectId = () => new mongoose.Types.ObjectId();

function surveyDocument(overrides = {}) {
  return new SatisfactionSurvey({
    companyId: objectId(),
    name: 'NPS clientes',
    slug: 'nps-clientes',
    type: 'nps',
    createdBy: objectId(),
    questions: [
      { key: 'nps', label: 'Recomendarias?', type: 'nps', required: true, order: 0 },
      { key: 'comment', label: 'Comentario', type: 'textarea', order: 1 }
    ],
    ...overrides
  });
}

test('phase 10 modules and role permissions expose the requested boundaries', () => {
  for (const key of ['reputation', 'reviews', 'testimonials', 'referrals', 'coupons', 'loyalty']) {
    const module = MODULE_REGISTRY.find((item) => item.key === key);
    assert.equal(module?.status, 'active');
    assert.equal(module?.enabledByDefault, true);
  }
  assert.equal(hasPermission('ADMIN', 'reputation:manage'), true);
  assert.equal(hasPermission('ADMIN', 'coupons:manage'), true);
  assert.equal(hasPermission('SUPERVISOR', 'review_requests:create_team'), true);
  assert.equal(hasPermission('SUPERVISOR', 'reviews:manage'), false);
  assert.equal(hasPermission('CALLCENTER', 'review_requests:create_assigned'), true);
  assert.equal(hasPermission('CALLCENTER', 'coupons:manage'), false);
  assert.equal(hasPermission('DISTRIBUTOR', 'reviews:read_team'), false);
  assert.equal(hasPermission('SUPERADMIN', 'reputation:read_all'), true);
});

test('review tokens and referral codes are random and public URLs use configured frontend base', () => {
  const previous = process.env.CLIENT_URL;
  process.env.CLIENT_URL = 'https://tenant.example';
  const first = createPublicToken();
  const second = createPublicToken();
  assert.notEqual(first, second);
  assert.ok(first.length >= 40);
  assert.match(createReferralCode(), /^[A-Z0-9]{8,12}$/);
  assert.equal(publicReviewUrl(first), `https://tenant.example/r/${encodeURIComponent(first)}`);
  if (previous === undefined) delete process.env.CLIENT_URL;
  else process.env.CLIENT_URL = previous;
});

test('review, request, testimonial and widget schemas sanitize and validate public content', async () => {
  const companyId = objectId();
  const contactId = objectId();
  const userId = objectId();
  await new ReviewRequest({
    companyId,
    contactId,
    publicToken: createPublicToken(),
    publicUrl: 'https://tenant.example/r/token',
    expiresAt: new Date(Date.now() + 60000),
    requestedBy: userId
  }).validate();
  const review = new Review({
    companyId,
    contactId,
    rating: 5,
    reviewerName: '<b>Ana</b>',
    title: '<script>x()</script>Excelente',
    comment: '<p>Muy buen servicio</p>'
  });
  await review.validate();
  assert.equal(review.reviewerName, 'Ana');
  assert.equal(review.title, 'Excelente');
  assert.equal(review.comment, 'Muy buen servicio');
  await assert.rejects(
    new Review({
      companyId,
      rating: 6,
      reviewerName: 'Ana',
      comment: 'Invalida'
    }).validate(),
    /maximum allowed value/i
  );
  await new Testimonial({
    companyId,
    authorName: 'Ana',
    quote: 'Excelente',
    rating: 5
  }).validate();
  await new ReviewWidget({
    companyId,
    name: 'Reviews publicas',
    slug: 'reviews-publicas',
    createdBy: userId,
    settings: { minRating: 4, maxItems: 20 }
  }).validate();
});

test('satisfaction surveys validate dynamic questions and normalize NPS/CSAT responses', async () => {
  const survey = surveyDocument();
  await survey.validate();
  assert.deepEqual(
    ReputationService.normalizeSurveyValues(survey, { nps: '9', comment: '<b>Bien</b>' }),
    { values: { nps: 9, comment: 'Bien' }, npsScore: 9, csatScore: null }
  );
  assert.throws(
    () => ReputationService.normalizeSurveyValues(survey, { nps: 11 }),
    /entre 0 y 10/
  );
  await new SurveyResponse({
    companyId: survey.companyId,
    surveyId: survey._id,
    values: { comment: '<script>x()</script>Seguro' },
    npsScore: 8,
    ipHash: 'a'.repeat(64)
  }).validate();
  await assert.rejects(
    surveyDocument({
      slug: 'duplicada',
      questions: [
        { key: 'score', label: 'Uno', type: 'nps' },
        { key: 'score', label: 'Dos', type: 'csat' }
      ]
    }).validate(),
    /Pregunta duplicada/
  );
});

test('coupons and referrals enforce basic lifecycle schema and loyalty guards', async () => {
  const companyId = objectId();
  const userId = objectId();
  const contactId = objectId();
  const coupon = new Coupon({
    companyId,
    code: 'WELCOME10',
    name: 'Bienvenida',
    discountType: 'percentage',
    discountValue: 10,
    status: 'active',
    createdBy: userId
  });
  await coupon.validate();
  assert.doesNotThrow(() => LoyaltyService.assertCouponAvailable(coupon));
  coupon.status = 'disabled';
  assert.throws(() => LoyaltyService.assertCouponAvailable(coupon), /no esta activo/);
  await new CouponRedemption({
    companyId,
    couponId: coupon._id,
    contactId,
    code: coupon.code
  }).validate();
  const program = new ReferralProgram({
    companyId,
    name: 'Embajadores',
    slug: 'embajadores',
    createdBy: userId
  });
  await program.validate();
  await new Referral({
    companyId,
    referralProgramId: program._id,
    referrerContactId: contactId,
    code: createReferralCode()
  }).validate();
});

test('phase 10 workflow, activity, notification, conversion and limits contracts are registered', async () => {
  for (const eventType of [
    'review_request.created',
    'review.submitted',
    'review.approved',
    'review.published',
    'review.negative_received',
    'testimonial.published',
    'survey.submitted',
    'nps.low_score',
    'coupon.issued',
    'coupon.redeemed',
    'referral.created',
    'referral.converted'
  ]) {
    assert.equal(WORKFLOW_TRIGGERS.some((item) => item.eventType === eventType), true);
  }
  for (const actionType of [
    'review_request.create',
    'coupon.issue',
    'referral.create',
    'testimonial.create_from_review'
  ]) {
    assert.equal(PLANNED_ACTIONS.some((item) => item.type === actionType), true);
  }
  const companyId = objectId();
  const userId = objectId();
  await new ActivityLog({
    companyId,
    userId,
    type: 'review_received',
    summary: 'Review recibida'
  }).validate();
  await new Notification({
    companyId,
    userId,
    type: 'review_negative_received',
    title: 'Review negativa'
  }).validate();
  await new ConversionEvent({
    companyId,
    type: 'review_submission'
  }).validate();
  await new UsageRecord({
    scopeType: 'company',
    scopeId: companyId,
    metric: 'coupon_redemptions',
    quantity: 1,
    periodStart: new Date('2026-06-01T00:00:00.000Z'),
    periodEnd: new Date('2026-07-01T00:00:00.000Z')
  }).validate();
  const plan = new Plan({
    distributorId: objectId(),
    name: 'Reputation Pro',
    code: 'reputation-pro',
    price: 99,
    limits: {
      reviewRequestsPerMonth: 500,
      reviews: 10000,
      reviewWidgets: 10,
      surveys: 20,
      surveyResponsesPerMonth: 5000,
      coupons: 100,
      couponRedemptionsPerMonth: 1000,
      referralPrograms: 10,
      referralsPerMonth: 1000
    }
  });
  await plan.validate();
  assert.equal(plan.limits.referralsPerMonth, 1000);
});

test('landing and funnel schemas accept Phase 10 embeds without tenant data in public identifiers', async () => {
  const companyId = objectId();
  const userId = objectId();
  await new LandingPage({
    companyId,
    name: 'Reputacion',
    slug: 'reputacion',
    title: 'Clientes',
    createdBy: userId,
    content: {
      sections: [{
        type: 'review_widget_embed',
        content: { reviewWidgetId: objectId() }
      }]
    }
  }).validate();
  await new FunnelStep({
    companyId,
    funnelId: objectId(),
    name: 'NPS',
    slug: 'nps',
    type: 'satisfaction_survey',
    satisfactionSurveyId: objectId(),
    createdBy: userId
  }).validate();
});

test('superadmin bootstrap rejects missing or weak credentials before database access', async () => {
  const previousEmail = process.env.SUPERADMIN_EMAIL;
  const previousPassword = process.env.SUPERADMIN_PASSWORD;
  delete process.env.SUPERADMIN_EMAIL;
  delete process.env.SUPERADMIN_PASSWORD;
  await assert.rejects(ensureSuperAdmin(), /SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD/);
  process.env.SUPERADMIN_EMAIL = 'admin@example.com';
  process.env.SUPERADMIN_PASSWORD = 'short';
  await assert.rejects(ensureSuperAdmin(), /al menos 12 caracteres/);
  if (previousEmail === undefined) delete process.env.SUPERADMIN_EMAIL;
  else process.env.SUPERADMIN_EMAIL = previousEmail;
  if (previousPassword === undefined) delete process.env.SUPERADMIN_PASSWORD;
  else process.env.SUPERADMIN_PASSWORD = previousPassword;
});
