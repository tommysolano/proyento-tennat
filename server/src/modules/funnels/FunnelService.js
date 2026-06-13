import mongoose from 'mongoose';
import { BookingLink } from '../../models/BookingLink.js';
import { Campaign } from '../../models/Campaign.js';
import { ConversionEvent, CONVERSION_TYPES } from '../../models/ConversionEvent.js';
import { Form } from '../../models/Form.js';
import { Funnel } from '../../models/Funnel.js';
import { FunnelStep, FUNNEL_STEP_TYPES } from '../../models/FunnelStep.js';
import { LandingPage } from '../../models/LandingPage.js';
import { PageView } from '../../models/PageView.js';
import { ReviewWidget } from '../../models/ReviewWidget.js';
import { SatisfactionSurvey } from '../../models/SatisfactionSurvey.js';
import { User } from '../../models/User.js';
import { WorkflowEventEmitter } from '../workflows/WorkflowEventEmitter.js';
import { recordActivity } from '../../utils/activity.js';
import { checkUsageLimit, trackUsage } from '../../utils/usage.js';
import { normalizeOptionalObjectId } from '../../utils/validation.js';
import {
  safePublicUrl,
  sanitizeLimitedHtml,
  sanitizeMarketingValue,
  sanitizePlainText,
  slugifyPublic
} from '../marketing/marketingSecurity.js';
import {
  attributionFromTracking,
  mergeMarketingAttribution,
  normalizeMarketingAttribution
} from '../marketing/marketingAttribution.js';

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400, retryable: false });
}

function normalizeReferenceFields(input = {}, fields = []) {
  const normalized = { ...input };
  for (const field of fields) {
    if (field in normalized) {
      normalized[field] = normalizeOptionalObjectId(normalized[field]);
    }
  }
  return normalized;
}

function normalizeLandingInput(input = {}) {
  const settings = normalizeReferenceFields(input.settings, [
    'associatedFormId',
    'associatedBookingLinkId'
  ]);
  const content = {
    ...(input.content || {}),
    sections: (input.content?.sections || []).map((section) => ({
      ...section,
      content: normalizeReferenceFields(section.content, [
        'formId',
        'bookingLinkId',
        'reviewWidgetId'
      ])
    }))
  };
  return { ...input, settings, content };
}

function normalizeFunnelSettings(settings = {}) {
  return normalizeReferenceFields(settings, ['entryStepId']);
}

function normalizeStepInput(input = {}) {
  return {
    ...normalizeReferenceFields(input, [
      'landingPageId',
      'formId',
      'bookingLinkId',
      'satisfactionSurveyId'
    ]),
    settings: normalizeReferenceFields(input.settings, ['nextStepId'])
  };
}

async function uniqueSlug(Model, value, fallback, excludeId = null) {
  const base = slugifyPublic(value) || fallback;
  let candidate = base;
  let suffix = 2;
  while (await Model.exists({ slug: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function uniqueStepSlug(funnelId, value, excludeId = null) {
  const base = slugifyPublic(value) || 'paso';
  let candidate = base;
  let suffix = 2;
  while (
    await FunnelStep.exists({
      funnelId,
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {})
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function tenantReference(Model, id, companyId, extra = {}) {
  if (!id) return null;
  if (!mongoose.isValidObjectId(id)) throw badRequest('Referencia invalida');
  const item = await Model.findOne({ _id: id, companyId, ...extra });
  if (!item) throw badRequest('La referencia no pertenece a la empresa');
  return item;
}

async function validateCampaign(companyId, attribution = {}) {
  const normalized = normalizeMarketingAttribution(attribution);
  if (
    normalized.campaignId &&
    !await Campaign.exists({
      _id: normalized.campaignId,
      companyId,
      status: { $ne: 'archived' }
    })
  ) {
    throw badRequest('campaignId no pertenece a la empresa');
  }
  return normalized;
}

function safeSection(section) {
  const content = sanitizeMarketingValue(section.content || {});
  if (section.type === 'custom_html_limited') {
    content.html = sanitizeLimitedHtml(section.content?.html);
  }
  return {
    id: section._id,
    type: section.type,
    order: section.order,
    content,
    settings: sanitizeMarketingValue(section.settings || {})
  };
}

export class FunnelService {
  static async validateLandingReferences(companyId, input) {
    const normalized = normalizeLandingInput(input);
    const settings = normalized.settings;
    await Promise.all([
      tenantReference(Form, settings.associatedFormId, companyId),
      tenantReference(BookingLink, settings.associatedBookingLinkId, companyId)
    ]);
    for (const section of normalized.content.sections) {
      if (section.type === 'form_embed' && section.content?.formId) {
        await tenantReference(Form, section.content.formId, companyId);
      }
      if (section.type === 'booking_embed' && section.content?.bookingLinkId) {
        await tenantReference(BookingLink, section.content.bookingLinkId, companyId);
      }
      if (section.type === 'review_widget_embed' && section.content?.reviewWidgetId) {
        await tenantReference(ReviewWidget, section.content.reviewWidgetId, companyId);
      }
    }
    await validateCampaign(companyId, input.attribution || {});
  }

  static async createLandingPage({ actor, body }) {
    const normalized = normalizeLandingInput(body);
    await this.validateLandingReferences(actor.companyId, normalized);
    await checkUsageLimit({
      companyId: actor.companyId,
      distributorId: actor.distributorId,
      metric: 'landing_pages'
    });
    const page = await LandingPage.create({
      companyId: actor.companyId,
      distributorId: actor.distributorId || null,
      name: sanitizePlainText(body.name, 120),
      slug: await uniqueSlug(LandingPage, body.slug || body.name, 'pagina'),
      title: sanitizePlainText(body.title || body.name, 180),
      description: body.description || '',
      content: normalized.content,
      seo: normalized.seo || {},
      styling: normalized.styling || {},
      settings: normalized.settings,
      createdBy: actor._id,
      updatedBy: actor._id,
      attribution: await validateCampaign(actor.companyId, body.attribution || {}),
      metadata: body.metadata || {}
    });
    await Promise.all([
      trackUsage({
        companyId: page.companyId,
        distributorId: page.distributorId,
        metric: 'landing_pages',
        metadata: { landingPageId: page._id }
      }),
      recordActivity({
        user: actor,
        type: 'landing_page_created',
        summary: `Landing page creada: ${page.name}`,
        metadata: { landingPageId: page._id }
      })
    ]);
    return page;
  }

  static async updateLandingPage({ actor, page, body }) {
    const merged = normalizeLandingInput({
      content: body.content || page.content.toObject(),
      settings: { ...page.settings.toObject(), ...(body.settings || {}) }
    });
    await this.validateLandingReferences(page.companyId, merged);
    if ('slug' in body && slugifyPublic(body.slug) !== page.slug) {
      page.slug = await uniqueSlug(LandingPage, body.slug, 'pagina', page._id);
    }
    for (const field of [
      'name',
      'title',
      'description',
      'seo',
      'styling',
      'metadata'
    ]) {
      if (field in body) page[field] = body[field];
    }
    if ('content' in body) page.content = merged.content;
    if ('settings' in body) page.settings = merged.settings;
    if ('attribution' in body) {
      page.attribution = await validateCampaign(page.companyId, body.attribution);
    }
    page.updatedBy = actor._id;
    await page.save();
    await recordActivity({
      user: actor,
      type: 'landing_page_updated',
      summary: `Landing page actualizada: ${page.name}`,
      metadata: { landingPageId: page._id, fields: Object.keys(body) }
    });
    return page;
  }

  static async setLandingStatus({ actor, page, status }) {
    if (!['published', 'paused', 'archived'].includes(status)) throw badRequest('status invalido');
    if (status === 'published') {
      await this.validateLandingReferences(page.companyId, page.toObject());
      page.publishedAt = new Date();
      page.archivedAt = null;
    }
    if (status === 'archived') page.archivedAt = new Date();
    page.status = status;
    page.updatedBy = actor._id;
    await page.save();
    const type = {
      published: 'landing_page_published',
      paused: 'landing_page_paused',
      archived: 'landing_page_archived'
    }[status];
    await Promise.all([
      recordActivity({
        user: actor,
        type,
        summary: `Landing page ${status}: ${page.name}`,
        metadata: { landingPageId: page._id }
      }),
      status === 'published'
        ? WorkflowEventEmitter.safelyEmit({
            companyId: page.companyId,
            distributorId: page.distributorId,
            eventType: 'landing_page.published',
            sourceModule: 'landing_pages',
            entityType: 'landing_page',
            entityId: page._id,
            actorUserId: actor._id,
            idempotencyKey: `landing:${page._id}:published:${page.publishedAt.getTime()}`,
            payload: { slug: page.slug }
          })
        : null
    ]);
    return page;
  }

  static async validateStepReferences(companyId, funnelId, input) {
    const normalized = normalizeStepInput(input);
    if (normalized.type && !FUNNEL_STEP_TYPES.includes(normalized.type)) throw badRequest('type de step invalido');
    const [, form] = await Promise.all([
      tenantReference(LandingPage, normalized.landingPageId, companyId),
      tenantReference(Form, normalized.formId, companyId),
      tenantReference(BookingLink, normalized.bookingLinkId, companyId),
      tenantReference(SatisfactionSurvey, normalized.satisfactionSurveyId, companyId)
    ]);
    if (normalized.type === 'survey' && form && form.type !== 'survey') {
      throw badRequest('Un step survey requiere un formulario de tipo survey');
    }
    if (normalized.settings.nextStepId) {
      const next = await FunnelStep.findOne({
        _id: normalized.settings.nextStepId,
        companyId,
        funnelId
      });
      if (!next) throw badRequest('nextStepId no pertenece al funnel');
    }
  }

  static async createFunnel({ actor, body }) {
    const settings = normalizeFunnelSettings(body.settings);
    if (settings.entryStepId) {
      throw badRequest('entryStepId solo puede configurarse despues de crear steps');
    }
    await checkUsageLimit({
      companyId: actor.companyId,
      distributorId: actor.distributorId,
      metric: 'funnels'
    });
    const funnel = await Funnel.create({
      companyId: actor.companyId,
      distributorId: actor.distributorId || null,
      name: sanitizePlainText(body.name, 120),
      slug: await uniqueSlug(Funnel, body.slug || body.name, 'funnel'),
      description: body.description || '',
      settings,
      createdBy: actor._id,
      updatedBy: actor._id,
      attribution: await validateCampaign(actor.companyId, body.attribution || {}),
      metadata: body.metadata || {}
    });
    await Promise.all([
      trackUsage({
        companyId: funnel.companyId,
        distributorId: funnel.distributorId,
        metric: 'funnels',
        metadata: { funnelId: funnel._id }
      }),
      recordActivity({
        user: actor,
        type: 'funnel_created',
        summary: `Funnel creado: ${funnel.name}`,
        metadata: { funnelId: funnel._id }
      })
    ]);
    return funnel;
  }

  static async updateFunnel({ actor, funnel, body }) {
    if ('slug' in body && slugifyPublic(body.slug) !== funnel.slug) {
      funnel.slug = await uniqueSlug(Funnel, body.slug, 'funnel', funnel._id);
    }
    for (const field of ['name', 'description', 'metadata']) {
      if (field in body) funnel[field] = body[field];
    }
    if ('attribution' in body) {
      funnel.attribution = await validateCampaign(funnel.companyId, body.attribution);
    }
    if ('settings' in body) {
      const settings = normalizeFunnelSettings({
        ...funnel.settings.toObject(),
        ...body.settings
      });
      if (settings.entryStepId) {
        await this.validateStepReferences(funnel.companyId, funnel._id, {
          settings: { nextStepId: settings.entryStepId }
        });
      }
      funnel.settings = settings;
    }
    funnel.updatedBy = actor._id;
    await funnel.save();
    await recordActivity({
      user: actor,
      type: 'funnel_updated',
      summary: `Funnel actualizado: ${funnel.name}`,
      metadata: { funnelId: funnel._id, fields: Object.keys(body) }
    });
    return funnel;
  }

  static async createFunnelStep({ actor, funnel, body }) {
    const normalized = normalizeStepInput(body);
    await this.validateStepReferences(funnel.companyId, funnel._id, normalized);
    await checkUsageLimit({
      companyId: funnel.companyId,
      distributorId: funnel.distributorId,
      metric: 'funnel_steps'
    });
    const step = await FunnelStep.create({
      companyId: funnel.companyId,
      distributorId: funnel.distributorId,
      funnelId: funnel._id,
      name: sanitizePlainText(normalized.name, 120),
      slug: await uniqueStepSlug(funnel._id, normalized.slug || normalized.name),
      type: normalized.type || 'landing',
      order: Number(normalized.order) || 0,
      landingPageId: normalized.landingPageId || null,
      formId: normalized.formId || null,
      bookingLinkId: normalized.bookingLinkId || null,
      satisfactionSurveyId: normalized.satisfactionSurveyId || null,
      content: normalized.content || {},
      settings: normalized.settings,
      createdBy: actor._id,
      updatedBy: actor._id,
      attribution: await validateCampaign(
        funnel.companyId,
        body.attribution || funnel.attribution || {}
      ),
      metadata: body.metadata || {}
    });
    if (!funnel.settings.entryStepId) {
      funnel.settings.entryStepId = step._id;
      await funnel.save();
    }
    await Promise.all([
      trackUsage({
        companyId: step.companyId,
        distributorId: step.distributorId,
        metric: 'funnel_steps',
        metadata: { funnelId: funnel._id, funnelStepId: step._id }
      }),
      recordActivity({
        user: actor,
        type: 'funnel_step_created',
        summary: `Step creado: ${step.name}`,
        metadata: { funnelId: funnel._id, funnelStepId: step._id }
      })
    ]);
    return step;
  }

  static async updateFunnelStep({ actor, step, body }) {
    const normalized = normalizeStepInput({
      ...step.toObject(),
      ...body,
      settings: { ...step.settings.toObject(), ...(body.settings || {}) }
    });
    await this.validateStepReferences(step.companyId, step.funnelId, normalized);
    for (const field of [
      'name',
      'type',
      'order',
      'landingPageId',
      'formId',
      'bookingLinkId',
      'satisfactionSurveyId',
      'content',
      'metadata'
    ]) {
      if (field in body) step[field] = normalized[field];
    }
    if ('slug' in body && slugifyPublic(body.slug) !== step.slug) {
      step.slug = await uniqueStepSlug(step.funnelId, body.slug, step._id);
    }
    if ('settings' in body) step.settings = normalized.settings;
    if ('attribution' in body) {
      step.attribution = await validateCampaign(step.companyId, body.attribution);
    }
    step.updatedBy = actor._id;
    await step.save();
    await recordActivity({
      user: actor,
      type: 'funnel_step_updated',
      summary: `Step actualizado: ${step.name}`,
      metadata: { funnelId: step.funnelId, funnelStepId: step._id }
    });
    return step;
  }

  static async setFunnelStatus({ actor, funnel, status }) {
    if (!['published', 'paused', 'archived'].includes(status)) throw badRequest('status invalido');
    if (status === 'published') {
      const steps = await FunnelStep.find({
        companyId: funnel.companyId,
        funnelId: funnel._id,
        status: 'published'
      }).sort({ order: 1 });
      if (!steps.length) throw badRequest('Publica al menos un step antes del funnel');
      if (!funnel.settings.entryStepId) funnel.settings.entryStepId = steps[0]._id;
      funnel.publishedAt = new Date();
      funnel.archivedAt = null;
    }
    if (status === 'archived') funnel.archivedAt = new Date();
    funnel.status = status;
    funnel.updatedBy = actor._id;
    await funnel.save();
    const type = {
      published: 'funnel_published',
      paused: 'funnel_paused',
      archived: 'funnel_archived'
    }[status];
    await Promise.all([
      recordActivity({
        user: actor,
        type,
        summary: `Funnel ${status}: ${funnel.name}`,
        metadata: { funnelId: funnel._id }
      }),
      status === 'published'
        ? WorkflowEventEmitter.safelyEmit({
            companyId: funnel.companyId,
            distributorId: funnel.distributorId,
            eventType: 'funnel.published',
            sourceModule: 'funnels',
            entityType: 'funnel',
            entityId: funnel._id,
            actorUserId: actor._id,
            idempotencyKey: `funnel:${funnel._id}:published:${funnel.publishedAt.getTime()}`,
            payload: { slug: funnel.slug }
          })
        : null
    ]);
    return funnel;
  }

  static async setStepStatus({ actor, step, status }) {
    if (!['published', 'archived'].includes(status)) throw badRequest('status invalido');
    if (status === 'published') {
      await this.validateStepReferences(step.companyId, step.funnelId, step.toObject());
      const requiredReference = {
        landing: step.landingPageId,
        form: step.formId,
        survey: step.formId,
        satisfaction_survey: step.satisfactionSurveyId,
        booking: step.bookingLinkId
      }[step.type];
      if (
        ['landing', 'form', 'survey', 'satisfaction_survey', 'booking'].includes(step.type) &&
        !requiredReference
      ) {
        throw badRequest(`El step ${step.type} no tiene su referencia configurada`);
      }
      if (step.type === 'redirect' && !safePublicUrl(step.settings.redirectUrl)) {
        throw badRequest('El step redirect requiere una URL publica valida');
      }
      step.publishedAt = new Date();
      step.archivedAt = null;
    } else {
      step.archivedAt = new Date();
    }
    step.status = status;
    step.updatedBy = actor._id;
    await step.save();
    await recordActivity({
      user: actor,
      type: status === 'published' ? 'funnel_step_published' : 'funnel_step_archived',
      summary: `Step ${status}: ${step.name}`,
      metadata: { funnelId: step.funnelId, funnelStepId: step._id }
    });
    return step;
  }

  static publicLandingPayload(page) {
    return {
      slug: page.slug,
      title: page.title,
      description: page.description,
      content: {
        sections: [...page.content.sections]
          .sort((a, b) => a.order - b.order)
          .map(safeSection),
        html: sanitizeLimitedHtml(page.content.html)
      },
      seo: page.seo,
      styling: page.styling,
      settings: {
        redirectUrl: safePublicUrl(page.settings.redirectUrl),
        associatedFormSlug: page.settings.associatedFormId?.slug || '',
        associatedBookingSlug: page.settings.associatedBookingLinkId?.slug || ''
      }
    };
  }

  static publicFunnelPayload(funnel, step, relations = {}) {
    return {
      funnel: {
        slug: funnel.slug,
        name: funnel.name,
        description: funnel.description
      },
      step: {
        slug: step.slug,
        name: step.name,
        type: step.type,
        order: step.order,
        content: {
          title: step.content.title,
          description: step.content.description,
          html: sanitizeLimitedHtml(step.content.html)
        },
        redirectUrl: safePublicUrl(step.settings.redirectUrl),
        nextStepSlug: relations.nextStep?.slug || '',
        landingPageSlug: relations.landingPage?.slug || '',
        formSlug: relations.form?.slug || '',
        satisfactionSurveySlug: relations.satisfactionSurvey?.slug || '',
        bookingLinkSlug: relations.bookingLink?.slug || ''
      }
    };
  }

  static async recordPageView({ target, tracking, path }) {
    await checkUsageLimit({
      companyId: target.companyId,
      distributorId: target.distributorId,
      metric: 'page_views'
    });
    const attribution = mergeMarketingAttribution(
      target.attribution || {},
      attributionFromTracking(tracking, tracking.attribution || {}, {
        campaignId: target.attribution?.campaignId || null,
        landingPageId: target.landingPageId || null,
        formId: target.formId || null,
        funnelId: target.funnelId || null,
        funnelStepId: target.funnelStepId || null
      })
    );
    const payload = {
      companyId: target.companyId,
      distributorId: target.distributorId,
      landingPageId: target.landingPageId || null,
      funnelId: target.funnelId || null,
      funnelStepId: target.funnelStepId || null,
      formId: target.formId || null,
      ...tracking,
      attribution,
      path: sanitizePlainText(String(path || '').split('?')[0], 1000)
    };
    const view = await PageView.create(payload);
    await Promise.all([
      ConversionEvent.create({
        ...payload,
        type: 'page_view',
        metadata: { pageViewId: view._id }
      }),
      trackUsage({
        companyId: target.companyId,
        distributorId: target.distributorId,
        metric: 'page_views',
        metadata: {
          landingPageId: target.landingPageId,
          funnelId: target.funnelId,
          funnelStepId: target.funnelStepId,
          formId: target.formId
        }
      })
    ]);
    if (target.landingPageId) {
      await WorkflowEventEmitter.safelyEmit({
        companyId: target.companyId,
        distributorId: target.distributorId,
        eventType: 'landing_page.viewed',
        sourceModule: 'landing_pages',
        entityType: 'landing_page',
        entityId: target.landingPageId,
        idempotencyKey: `pageview:${view._id}:landing`,
        payload: { pageViewId: view._id }
      });
    }
    if (target.funnelStepId) {
      await WorkflowEventEmitter.safelyEmit({
        companyId: target.companyId,
        distributorId: target.distributorId,
        eventType: 'funnel.step_viewed',
        sourceModule: 'funnels',
        entityType: 'funnel_step',
        entityId: target.funnelStepId,
        idempotencyKey: `pageview:${view._id}:funnel-step`,
        payload: { pageViewId: view._id, funnelId: target.funnelId }
      });
    }
    return view;
  }

  static async recordConversion({ target, type, tracking, metadata = {} }) {
    if (!CONVERSION_TYPES.includes(type) || type === 'page_view') {
      throw badRequest('Tipo de conversion invalido');
    }
    const event = await ConversionEvent.create({
      companyId: target.companyId,
      distributorId: target.distributorId,
      landingPageId: target.landingPageId || null,
      funnelId: target.funnelId || null,
      funnelStepId: target.funnelStepId || null,
      formId: target.formId || null,
      type,
      sessionId: tracking.sessionId,
      visitorId: tracking.visitorId,
      attribution: mergeMarketingAttribution(
        target.attribution || {},
        attributionFromTracking(tracking, tracking.attribution || {}, {
          campaignId: target.attribution?.campaignId || null,
          landingPageId: target.landingPageId || null,
          formId: target.formId || null,
          funnelId: target.funnelId || null,
          funnelStepId: target.funnelStepId || null
        })
      ),
      metadata: sanitizeMarketingValue(metadata)
    });
    await trackUsage({
      companyId: target.companyId,
      distributorId: target.distributorId,
      metric: 'conversions',
      metadata: { conversionEventId: event._id, type }
    });
    const actor = await User.findOne({
      companyId: target.companyId,
      role: 'ADMIN',
      status: 'active'
    }).sort({ createdAt: 1 });
    if (actor) {
      await recordActivity({
        user: actor,
        type: 'conversion_recorded',
        summary: `Conversion registrada: ${type}`,
        metadata: {
          conversionEventId: event._id,
          type,
          landingPageId: target.landingPageId || null,
          funnelId: target.funnelId || null,
          funnelStepId: target.funnelStepId || null,
          formId: target.formId || null
        }
      });
    }
    if (target.funnelId) {
      await WorkflowEventEmitter.safelyEmit({
        companyId: target.companyId,
        distributorId: target.distributorId,
        eventType: 'funnel.conversion',
        sourceModule: 'funnels',
        entityType: 'conversion_event',
        entityId: event._id,
        idempotencyKey: `conversion:${event._id}:workflow`,
        payload: {
          type,
          funnelId: target.funnelId,
          funnelStepId: target.funnelStepId
        }
      });
    }
    return event;
  }

  static async landingAnalytics(pageId, companyId) {
    const [views, conversions, submissions] = await Promise.all([
      PageView.countDocuments({ companyId, landingPageId: pageId }),
      ConversionEvent.countDocuments({
        companyId,
        landingPageId: pageId,
        type: { $ne: 'page_view' }
      }),
      ConversionEvent.countDocuments({ companyId, landingPageId: pageId, type: 'form_submission' })
    ]);
    return {
      views,
      conversions,
      submissions,
      conversionRate: views ? Number(((conversions / views) * 100).toFixed(2)) : 0
    };
  }

  static async funnelAnalytics(funnelId, companyId) {
    const objectId = new mongoose.Types.ObjectId(funnelId);
    const [steps, conversions] = await Promise.all([
      PageView.aggregate([
        { $match: { companyId, funnelId: objectId } },
        { $group: { _id: '$funnelStepId', views: { $sum: 1 } } }
      ]),
      ConversionEvent.aggregate([
        { $match: { companyId, funnelId: objectId, type: { $ne: 'page_view' } } },
        { $group: { _id: '$funnelStepId', conversions: { $sum: 1 } } }
      ])
    ]);
    const conversionMap = new Map(conversions.map((item) => [String(item._id), item.conversions]));
    const stepIds = steps.map((item) => item._id).filter(Boolean);
    const stepDocs = await FunnelStep.find({
      _id: { $in: stepIds },
      companyId,
      funnelId
    }).select('name slug order');
    const names = new Map(stepDocs.map((item) => [String(item._id), item]));
    const byStep = steps.map((item) => {
      const conversionsCount = conversionMap.get(String(item._id)) || 0;
      const step = names.get(String(item._id));
      return {
        stepId: item._id,
        name: step?.name || 'Step',
        slug: step?.slug || '',
        order: step?.order || 0,
        views: item.views,
        conversions: conversionsCount,
        conversionRate: item.views
          ? Number(((conversionsCount / item.views) * 100).toFixed(2))
          : 0
      };
    }).sort((a, b) => a.order - b.order);
    const totalViews = byStep.reduce((sum, item) => sum + item.views, 0);
    const totalConversions = byStep.reduce((sum, item) => sum + item.conversions, 0);
    return {
      views: totalViews,
      conversions: totalConversions,
      submissions: await ConversionEvent.countDocuments({
        companyId,
        funnelId: objectId,
        type: 'form_submission'
      }),
      contactsCreated: await ConversionEvent.countDocuments({
        companyId,
        funnelId: objectId,
        type: 'contact_created'
      }),
      opportunitiesCreated: await ConversionEvent.countDocuments({
        companyId,
        funnelId: objectId,
        type: 'opportunity_created'
      }),
      byStep: byStep.map((item, index) => ({
        ...item,
        abandonment:
          index < byStep.length - 1
            ? Math.max(0, item.views - byStep[index + 1].views)
            : 0
      }))
    };
  }
}
