import mongoose from 'mongoose';
import { Company } from '../../models/Company.js';
import { Contact } from '../../models/Contact.js';
import { ConversionEvent } from '../../models/ConversionEvent.js';
import { Review } from '../../models/Review.js';
import { ReviewRequest } from '../../models/ReviewRequest.js';
import { ReviewWidget } from '../../models/ReviewWidget.js';
import { SatisfactionSurvey } from '../../models/SatisfactionSurvey.js';
import { SurveyResponse } from '../../models/SurveyResponse.js';
import { Testimonial } from '../../models/Testimonial.js';
import { User } from '../../models/User.js';
import { recordActivity } from '../../utils/activity.js';
import { checkUsageLimit, trackUsage } from '../../utils/usage.js';
import { EMAIL_PATTERN } from '../../utils/validation.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { WorkflowEventEmitter } from '../workflows/WorkflowEventEmitter.js';
import { checkModuleAccess } from '../../middleware/moduleMiddleware.js';
import { assertContactAccess } from './reputationScope.js';
import {
  createPublicToken,
  publicReviewUrl,
  publicSlug,
  sanitizeReputationText,
  sanitizeReputationValue
} from './reputationSecurity.js';

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400, retryable: false });
}

function sentimentFor(rating) {
  if (rating >= 4) return 'positive';
  if (rating === 3) return 'neutral';
  return 'negative';
}

function dateValue(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest('Fecha invalida');
  return date;
}

async function internalActor(companyId, preferredId = null) {
  if (preferredId) {
    const preferred = await User.findOne({ _id: preferredId, companyId, status: 'active' });
    if (preferred) return preferred;
  }
  return User.findOne({ companyId, role: 'ADMIN', status: 'active' }).sort({ createdAt: 1 });
}

async function notifyCompanyAdmins(input) {
  const users = await User.find({
    companyId: input.companyId,
    role: 'ADMIN',
    status: 'active'
  }).select('_id');
  await Promise.all(users.map((user) => NotificationService.create({ ...input, userId: user._id })));
}

async function publicReputationEnabled(companyId, distributorId, extraModule = 'reviews') {
  const user = { role: 'ADMIN', companyId, distributorId };
  const [reputation, feature] = await Promise.all([
    checkModuleAccess('reputation', user),
    checkModuleAccess(extraModule, user)
  ]);
  return reputation.enabled && feature.enabled;
}

export class ReputationService {
  static generatePublicReviewUrl(token) {
    return publicReviewUrl(token);
  }

  static async createReviewRequest({ actor, body }) {
    const contact = await assertContactAccess(actor, body.contactId);
    await checkUsageLimit({
      companyId: actor.companyId,
      distributorId: actor.distributorId,
      metric: 'review_requests'
    });
    const expiresAt = dateValue(
      body.expiresAt,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    );
    if (expiresAt <= new Date()) throw badRequest('expiresAt debe estar en el futuro');
    const publicToken = createPublicToken();
    const request = await ReviewRequest.create({
      companyId: actor.companyId,
      distributorId: actor.distributorId || null,
      contactId: contact._id,
      appointmentId: body.appointmentId || null,
      opportunityId: body.opportunityId || null,
      conversationId: body.conversationId || null,
      status: body.status === 'draft' ? 'draft' : 'pending',
      channel: body.channel || 'manual',
      publicToken,
      publicUrl: this.generatePublicReviewUrl(publicToken),
      expiresAt,
      requestedBy: actor._id,
      requestedAt: new Date(),
      metadata: sanitizeReputationValue(body.metadata || {})
    });
    await Promise.all([
      recordActivity({
        user: actor,
        type: 'review_request_created',
        summary: `Solicitud de resena creada para ${contact.name}`,
        metadata: { reviewRequestId: request._id, contactId: contact._id, channel: request.channel }
      }),
      trackUsage({
        companyId: actor.companyId,
        distributorId: actor.distributorId,
        metric: 'review_requests',
        metadata: { reviewRequestId: request._id, contactId: contact._id }
      })
    ]);
    return request;
  }

  static async cancelReviewRequest({ actor, request }) {
    if (['completed', 'expired', 'cancelled'].includes(request.status)) {
      throw badRequest('La solicitud ya no puede cancelarse');
    }
    request.status = 'cancelled';
    await request.save();
    await recordActivity({
      user: actor,
      type: 'review_request_cancelled',
      summary: 'Solicitud de resena cancelada',
      metadata: { reviewRequestId: request._id, contactId: request.contactId }
    });
    return request;
  }

  static async publicReviewRequest(token) {
    const request = await ReviewRequest.findOne({ publicToken: token })
      .populate('contactId', 'name')
      .lean();
    if (!request) return null;
    if (request.expiresAt <= new Date() && !['completed', 'cancelled'].includes(request.status)) {
      await ReviewRequest.updateOne({ _id: request._id }, { status: 'expired' });
      request.status = 'expired';
    }
    const company = await Company.findOne({
      _id: request.companyId,
      status: { $in: ['active', 'trial'] }
    }).select('name');
    if (!company) return null;
    if (!await publicReputationEnabled(request.companyId, request.distributorId, 'reviews')) {
      return null;
    }
    if (['pending', 'sent'].includes(request.status)) {
      await ReviewRequest.updateOne(
        { _id: request._id, status: { $in: ['pending', 'sent'] } },
        { status: 'opened', openedAt: new Date() }
      );
      request.status = 'opened';
    }
    return {
      token: request.publicToken,
      status: request.status,
      expiresAt: request.expiresAt,
      contactName: request.contactId?.name || '',
      company: { name: company.name }
    };
  }

  static async submitReview({ token, body, tracking }) {
    const request = await ReviewRequest.findOne({ publicToken: token });
    if (!request) throw Object.assign(new Error('Solicitud no encontrada'), { status: 404 });
    if (!await publicReputationEnabled(request.companyId, request.distributorId, 'reviews')) {
      throw Object.assign(new Error('Modulo de resenas no disponible'), { status: 404 });
    }
    if (request.expiresAt <= new Date()) {
      request.status = 'expired';
      await request.save();
      throw Object.assign(new Error('La solicitud de resena expiro'), { status: 410 });
    }
    if (['completed', 'cancelled', 'expired'].includes(request.status)) {
      throw Object.assign(new Error('La solicitud ya no acepta respuestas'), { status: 409 });
    }
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw badRequest('rating debe ser un entero entre 1 y 5');
    }
    const comment = sanitizeReputationText(body.comment, 5000);
    const reviewerName = sanitizeReputationText(body.reviewerName, 160);
    const reviewerEmail = String(body.reviewerEmail || '').trim().toLowerCase();
    if (!comment || !reviewerName) throw badRequest('comment y reviewerName son requeridos');
    if (reviewerEmail && !EMAIL_PATTERN.test(reviewerEmail)) throw badRequest('reviewerEmail invalido');
    if (await Review.exists({ reviewRequestId: request._id })) {
      throw Object.assign(new Error('La solicitud ya fue respondida'), { status: 409 });
    }
    await checkUsageLimit({
      companyId: request.companyId,
      distributorId: request.distributorId,
      metric: 'reviews'
    });
    const review = await Review.create({
      companyId: request.companyId,
      distributorId: request.distributorId,
      contactId: request.contactId,
      reviewRequestId: request._id,
      source: 'internal',
      rating,
      title: body.title,
      comment,
      reviewerName,
      reviewerEmail,
      status: 'new',
      sentiment: sentimentFor(rating),
      metadata: { ipHash: tracking.ipHash, userAgent: tracking.userAgent, referrer: tracking.referrer }
    });
    request.status = 'completed';
    request.completedAt = new Date();
    await request.save();
    const actor = await internalActor(request.companyId, request.requestedBy);
    if (!actor) throw Object.assign(new Error('La empresa no tiene administrador activo'), { status: 503 });
    await Promise.all([
      recordActivity({
        user: actor,
        type: 'review_received',
        summary: `Nueva resena recibida (${rating}/5)`,
        metadata: {
          reviewId: review._id,
          reviewRequestId: request._id,
          contactId: request.contactId,
          rating,
          sentiment: review.sentiment
        }
      }),
      recordActivity({
        user: actor,
        type: 'review_request_completed',
        summary: 'Solicitud de resena completada',
        metadata: { reviewRequestId: request._id, reviewId: review._id, contactId: request.contactId }
      }),
      trackUsage({
        companyId: request.companyId,
        distributorId: request.distributorId,
        metric: 'reviews',
        metadata: { reviewId: review._id, reviewRequestId: request._id }
      }),
      ConversionEvent.create({
        companyId: request.companyId,
        distributorId: request.distributorId,
        type: 'review_submission',
        contactId: request.contactId,
        metadata: { reviewId: review._id, reviewRequestId: request._id }
      }),
      notifyCompanyAdmins({
        companyId: request.companyId,
        distributorId: request.distributorId,
        type: rating <= 2 ? 'review_negative_received' : 'review_received',
        title: rating <= 2 ? 'Nueva resena negativa' : 'Nueva resena recibida',
        body: `${rating}/5 - ${reviewerName}`,
        relatedType: 'review',
        relatedId: review._id,
        metadata: { contactId: request.contactId, rating }
      })
    ]);
    if (rating <= 2) {
      await WorkflowEventEmitter.safelyEmit({
        companyId: request.companyId,
        distributorId: request.distributorId,
        eventType: 'review.negative_received',
        sourceModule: 'reviews',
        entityType: 'review',
        entityId: review._id,
        actorUserId: actor._id,
        idempotencyKey: `review:${review._id}:negative`,
        payload: { contactId: request.contactId, rating }
      });
    }
    return review;
  }

  static async reviewTransition({ actor, review, status }) {
    const allowed = {
      approved: ['new', 'rejected'],
      rejected: ['new', 'approved'],
      published: ['approved'],
      archived: ['new', 'approved', 'rejected', 'published']
    };
    if (!allowed[status]?.includes(review.status)) {
      throw badRequest(`No se puede cambiar una resena ${review.status} a ${status}`);
    }
    review.status = status;
    if (status === 'approved') review.publicApproved = true;
    if (status === 'rejected') review.publicApproved = false;
    if (status === 'published') {
      review.publicApproved = true;
      review.publishedAt = new Date();
    }
    await review.save();
    const types = {
      approved: 'review_approved',
      rejected: 'review_rejected',
      published: 'review_published',
      archived: 'review_archived'
    };
    await recordActivity({
      user: actor,
      type: types[status],
      summary: `Resena ${status}`,
      metadata: { reviewId: review._id, contactId: review.contactId, rating: review.rating }
    });
    return review;
  }

  static approveReview(input) { return this.reviewTransition({ ...input, status: 'approved' }); }
  static rejectReview(input) { return this.reviewTransition({ ...input, status: 'rejected' }); }
  static publishReview(input) { return this.reviewTransition({ ...input, status: 'published' }); }
  static archiveReview(input) { return this.reviewTransition({ ...input, status: 'archived' }); }

  static async respondToReview({ actor, review, responseText }) {
    const text = sanitizeReputationText(responseText, 5000);
    if (!text) throw badRequest('responseText es requerido');
    review.responseText = text;
    review.respondedBy = actor._id;
    review.respondedAt = new Date();
    await review.save();
    await recordActivity({
      user: actor,
      type: 'review_responded',
      summary: 'Respuesta interna registrada en resena',
      metadata: { reviewId: review._id, contactId: review.contactId }
    });
    return review;
  }

  static async createTestimonialFromReview({ actor, review, body = {} }) {
    if (!['approved', 'published'].includes(review.status) || !review.publicApproved) {
      throw badRequest('La resena debe estar aprobada');
    }
    const testimonial = await Testimonial.create({
      companyId: actor.companyId,
      distributorId: actor.distributorId || null,
      reviewId: review._id,
      contactId: review.contactId,
      authorName: body.authorName || review.reviewerName,
      authorTitle: body.authorTitle || '',
      quote: body.quote || review.comment,
      rating: body.rating || review.rating,
      imageUrl: body.imageUrl || '',
      featured: Boolean(body.featured),
      order: Number(body.order || 0),
      status: 'draft',
      metadata: sanitizeReputationValue(body.metadata || {})
    });
    await recordActivity({
      user: actor,
      type: 'testimonial_created',
      summary: 'Testimonio creado desde resena',
      metadata: { testimonialId: testimonial._id, reviewId: review._id, contactId: review.contactId }
    });
    return testimonial;
  }

  static async setTestimonialStatus({ actor, testimonial, status }) {
    if (!['published', 'archived'].includes(status)) throw badRequest('Estado invalido');
    testimonial.status = status;
    await testimonial.save();
    await recordActivity({
      user: actor,
      type: status === 'published' ? 'testimonial_published' : 'testimonial_archived',
      summary: `Testimonio ${status}`,
      metadata: {
        testimonialId: testimonial._id,
        reviewId: testimonial.reviewId,
        contactId: testimonial.contactId
      }
    });
    return testimonial;
  }

  static async createWidget({ actor, body }) {
    await checkUsageLimit({
      companyId: actor.companyId,
      distributorId: actor.distributorId,
      metric: 'review_widgets'
    });
    const widget = await ReviewWidget.create({
      companyId: actor.companyId,
      distributorId: actor.distributorId || null,
      name: body.name,
      slug: publicSlug(body.slug || body.name),
      type: body.type,
      settings: body.settings || {},
      styling: body.styling || {},
      createdBy: actor._id,
      metadata: body.metadata || {}
    });
    await Promise.all([
      recordActivity({
        user: actor,
        type: 'review_widget_created',
        summary: `Widget de resenas creado: ${widget.name}`,
        metadata: { reviewWidgetId: widget._id }
      }),
      trackUsage({
        companyId: actor.companyId,
        distributorId: actor.distributorId,
        metric: 'review_widgets',
        metadata: { reviewWidgetId: widget._id }
      })
    ]);
    return widget;
  }

  static async publicWidget(slug) {
    const widget = await ReviewWidget.findOne({ slug: publicSlug(slug), status: 'published' }).lean();
    if (!widget) return null;
    const company = await Company.findOne({
      _id: widget.companyId,
      status: { $in: ['active', 'trial'] }
    }).select('name');
    if (!company) return null;
    if (!await publicReputationEnabled(widget.companyId, widget.distributorId, 'reviews')) {
      return null;
    }
    const sourceFilter = widget.settings.sources?.length
      ? { source: { $in: widget.settings.sources } }
      : {};
    const [reviews, testimonials] = await Promise.all([
      Review.find({
        companyId: widget.companyId,
        status: 'published',
        publicApproved: true,
        rating: { $gte: widget.settings.minRating },
        ...sourceFilter
      })
        .select('-_id rating title comment reviewerName source publishedAt')
        .sort({ publishedAt: -1 })
        .limit(widget.settings.maxItems)
        .lean(),
      Testimonial.find({
        companyId: widget.companyId,
        status: 'published',
        ...(widget.settings.onlyFeatured ? { featured: true } : {})
      })
        .select('-_id authorName authorTitle quote rating imageUrl featured order createdAt')
        .sort({ featured: -1, order: 1, createdAt: -1 })
        .limit(widget.settings.maxItems)
        .lean()
    ]);
    return {
      name: widget.name,
      slug: widget.slug,
      type: widget.type,
      settings: widget.settings,
      styling: widget.styling,
      company: { name: company.name },
      reviews,
      testimonials
    };
  }

  static async createSurvey({ actor, body }) {
    await checkUsageLimit({
      companyId: actor.companyId,
      distributorId: actor.distributorId,
      metric: 'satisfaction_surveys'
    });
    const questions = body.questions?.length
      ? body.questions
      : body.type === 'csat'
        ? [{ key: 'csat', label: 'Como calificas tu experiencia?', type: 'csat', required: true, order: 0 }]
        : [{ key: 'nps', label: 'Que tan probable es que nos recomiendes?', type: 'nps', required: true, order: 0 }];
    const survey = await SatisfactionSurvey.create({
      companyId: actor.companyId,
      distributorId: actor.distributorId || null,
      name: body.name,
      slug: publicSlug(body.slug || body.name),
      type: body.type || 'nps',
      questions,
      settings: body.settings || {},
      styling: body.styling || {},
      createdBy: actor._id,
      metadata: body.metadata || {}
    });
    await Promise.all([
      recordActivity({
        user: actor,
        type: 'satisfaction_survey_created',
        summary: `Encuesta de satisfaccion creada: ${survey.name}`,
        metadata: { satisfactionSurveyId: survey._id }
      }),
      trackUsage({
        companyId: actor.companyId,
        distributorId: actor.distributorId,
        metric: 'satisfaction_surveys',
        metadata: { satisfactionSurveyId: survey._id }
      })
    ]);
    return survey;
  }

  static normalizeSurveyValues(survey, rawValues) {
    const source = rawValues && typeof rawValues === 'object' ? rawValues : {};
    const values = {};
    let npsScore = null;
    let csatScore = null;
    const errors = [];
    for (const question of survey.questions) {
      let value = source[question.key];
      const empty = value === undefined || value === null || value === '';
      if (empty && question.required) errors.push(`${question.label} es requerida`);
      if (empty) continue;
      if (question.type === 'nps') {
        value = Number(value);
        if (!Number.isInteger(value) || value < 0 || value > 10) errors.push(`${question.label} debe estar entre 0 y 10`);
        else npsScore = value;
      } else if (question.type === 'csat') {
        value = Number(value);
        if (!Number.isInteger(value) || value < 1 || value > 5) errors.push(`${question.label} debe estar entre 1 y 5`);
        else csatScore = value;
      } else if (['select', 'radio'].includes(question.type) && !question.options.includes(String(value))) {
        errors.push(`${question.label} contiene una opcion invalida`);
      } else if (question.type === 'checkbox') {
        value = Boolean(value);
      } else if (question.type === 'number') {
        value = Number(value);
        if (!Number.isFinite(value)) errors.push(`${question.label} debe ser numerica`);
      } else {
        value = sanitizeReputationText(value, 5000);
      }
      values[question.key] = value;
    }
    if (errors.length) throw badRequest(errors.join('. '));
    return { values, npsScore, csatScore };
  }

  static async submitSurvey({ survey, body, tracking }) {
    await checkUsageLimit({
      companyId: survey.companyId,
      distributorId: survey.distributorId,
      metric: 'survey_responses'
    });
    const normalized = this.normalizeSurveyValues(survey, body.values || body);
    let contactId = null;
    if (body.contactId && mongoose.isValidObjectId(body.contactId)) {
      contactId = await Contact.exists({ _id: body.contactId, companyId: survey.companyId });
      contactId = contactId?._id || null;
    }
    const response = await SurveyResponse.create({
      companyId: survey.companyId,
      distributorId: survey.distributorId,
      surveyId: survey._id,
      contactId,
      reviewRequestId: body.reviewRequestId || null,
      ...normalized,
      status: 'received',
      ipHash: tracking.ipHash,
      userAgent: tracking.userAgent,
      referrer: tracking.referrer,
      metadata: { utm: tracking.utm }
    });
    const actor = await internalActor(survey.companyId, survey.createdBy);
    if (!actor) throw Object.assign(new Error('La empresa no tiene administrador activo'), { status: 503 });
    await Promise.all([
      recordActivity({
        user: actor,
        type: 'survey_response_received',
        summary: `Respuesta recibida: ${survey.name}`,
        metadata: {
          surveyResponseId: response._id,
          satisfactionSurveyId: survey._id,
          contactId,
          npsScore: response.npsScore,
          csatScore: response.csatScore
        }
      }),
      trackUsage({
        companyId: survey.companyId,
        distributorId: survey.distributorId,
        metric: 'survey_responses',
        metadata: { surveyResponseId: response._id, satisfactionSurveyId: survey._id }
      }),
      ConversionEvent.create({
        companyId: survey.companyId,
        distributorId: survey.distributorId,
        type: 'survey_response',
        contactId,
        metadata: { surveyId: survey._id, surveyResponseId: response._id }
      })
    ]);
    if (response.npsScore !== null && response.npsScore <= survey.settings.lowNpsThreshold) {
      await Promise.all([
        WorkflowEventEmitter.safelyEmit({
          companyId: survey.companyId,
          distributorId: survey.distributorId,
          eventType: 'nps.low_score',
          sourceModule: 'surveys',
          entityType: 'survey_response',
          entityId: response._id,
          actorUserId: actor._id,
          idempotencyKey: `survey-response:${response._id}:low-nps`,
          payload: { surveyId: survey._id, contactId, npsScore: response.npsScore }
        }),
        notifyCompanyAdmins({
          companyId: survey.companyId,
          distributorId: survey.distributorId,
          type: 'survey_low_nps',
          title: 'Nueva respuesta con NPS bajo',
          body: `${survey.name}: ${response.npsScore}/10`,
          relatedType: 'survey_response',
          relatedId: response._id,
          metadata: { surveyId: survey._id, contactId, npsScore: response.npsScore }
        })
      ]);
    }
    return response;
  }

  static async surveyAnalytics(surveyId, companyId) {
    const [total, scored] = await Promise.all([
      SurveyResponse.countDocuments({ companyId, surveyId }),
      SurveyResponse.aggregate([
        { $match: { companyId, surveyId: new mongoose.Types.ObjectId(surveyId), status: { $ne: 'spam' } } },
        {
          $group: {
            _id: null,
            npsAverage: { $avg: '$npsScore' },
            csatAverage: { $avg: '$csatScore' },
            promoters: { $sum: { $cond: [{ $gte: ['$npsScore', 9] }, 1, 0] } },
            passives: { $sum: { $cond: [{ $and: [{ $gte: ['$npsScore', 7] }, { $lte: ['$npsScore', 8] }] }, 1, 0] } },
            detractors: { $sum: { $cond: [{ $lte: ['$npsScore', 6] }, 1, 0] } }
          }
        }
      ])
    ]);
    const row = scored[0] || {};
    const npsCount = (row.promoters || 0) + (row.passives || 0) + (row.detractors || 0);
    return {
      totalResponses: total,
      npsAverage: Number((row.npsAverage || 0).toFixed(2)),
      csatAverage: Number((row.csatAverage || 0).toFixed(2)),
      nps: npsCount ? Number((((row.promoters - row.detractors) / npsCount) * 100).toFixed(2)) : 0,
      promoters: row.promoters || 0,
      passives: row.passives || 0,
      detractors: row.detractors || 0
    };
  }

  static async calculateReputationMetrics(
    companyId,
    resourceScope = null,
    { includeSurveyMetrics = true } = {}
  ) {
    const companyMatch = companyId
      ? { companyId: new mongoose.Types.ObjectId(companyId) }
      : {};
    const scope = resourceScope || companyMatch;
    const aggregateScope = {
      ...scope,
      ...(scope.companyId ? { companyId: new mongoose.Types.ObjectId(scope.companyId) } : {})
    };
    const [reviewRows, pendingRequests, publishedTestimonials, surveyRows] = await Promise.all([
      Review.aggregate([
        { $match: aggregateScope },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            averageRating: { $avg: '$rating' },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
            published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
            negative: { $sum: { $cond: [{ $lte: ['$rating', 2] }, 1, 0] } }
          }
        }
      ]),
      ReviewRequest.countDocuments({
        ...scope,
        status: { $in: ['draft', 'pending', 'sent', 'opened'] }
      }),
      Testimonial.countDocuments({ ...scope, status: 'published' }),
      includeSurveyMetrics
        ? SurveyResponse.aggregate([
            { $match: { ...companyMatch, status: { $ne: 'spam' } } },
            { $group: { _id: null, npsAverage: { $avg: '$npsScore' }, csatAverage: { $avg: '$csatScore' } } }
          ])
        : []
    ]);
    const reviews = reviewRows[0] || {};
    const surveys = surveyRows[0] || {};
    return {
      averageRating: Number((reviews.averageRating || 0).toFixed(2)),
      totalReviews: reviews.total || 0,
      pendingReviews: reviews.pending || 0,
      publishedReviews: reviews.published || 0,
      negativeReviews: reviews.negative || 0,
      pendingReviewRequests: pendingRequests,
      npsAverage: Number((surveys.npsAverage || 0).toFixed(2)),
      csatAverage: Number((surveys.csatAverage || 0).toFixed(2)),
      publishedTestimonials
    };
  }
}
