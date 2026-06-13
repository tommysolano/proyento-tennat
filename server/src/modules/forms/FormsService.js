import mongoose from 'mongoose';
import { BookingLink } from '../../models/BookingLink.js';
import { Contact, CONTACT_LIFECYCLE_STAGES, CONTACT_STATUSES, CRM_PRIORITIES } from '../../models/Contact.js';
import { Campaign } from '../../models/Campaign.js';
import { ConversionEvent } from '../../models/ConversionEvent.js';
import { CustomField } from '../../models/CustomField.js';
import { Form, FORM_FIELD_TYPES, FORM_TYPES } from '../../models/Form.js';
import { FormSubmission } from '../../models/FormSubmission.js';
import { Opportunity } from '../../models/Opportunity.js';
import { Pipeline } from '../../models/Pipeline.js';
import { PipelineStage } from '../../models/PipelineStage.js';
import { Tag } from '../../models/Tag.js';
import { tagScopeFilter } from '../../utils/crmOrganization.js';
import { User } from '../../models/User.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { RealtimeService } from '../realtime/RealtimeService.js';
import { WorkflowEventEmitter } from '../workflows/WorkflowEventEmitter.js';
import { checkPlatformLimit } from '../../utils/platformLimits.js';
import { recordActivity } from '../../utils/activity.js';
import { sanitizeError } from '../../utils/sanitize.js';
import { checkUsageLimit, trackUsage } from '../../utils/usage.js';
import {
  EMAIL_PATTERN,
  normalizeOptionalObjectId,
  normalizeOptionalObjectIdArray
} from '../../utils/validation.js';
import {
  createSubmissionToken,
  isSafeMarketingKey,
  parseSubmissionToken,
  safePublicUrl,
  sanitizeMarketingValue,
  sanitizePlainText,
  slugifyPublic
} from '../marketing/marketingSecurity.js';
import {
  attributionFromTracking,
  mergeMarketingAttribution,
  normalizeMarketingAttribution
} from '../marketing/marketingAttribution.js';
import { CommunicationPolicyService } from '../communications/CommunicationPolicyService.js';

const CONTACT_FIELDS = new Set([
  'name',
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'secondaryPhone',
  'source',
  'status',
  'lifecycleStage',
  'priority',
  'companyName',
  'address',
  'city',
  'country'
]);
const OPPORTUNITY_FIELDS = new Set([
  'title',
  'value',
  'source',
  'priority',
  'expectedCloseDate'
]);
const PHONE_PATTERN = /^[+0-9().\-\s]{6,40}$/;
const MAX_SUBMISSION_BYTES = 64 * 1024;
const CUSTOM_FIELD_COMPATIBILITY = {
  text: new Set(['text', 'textarea', 'url']),
  textarea: new Set(['text', 'textarea']),
  email: new Set(['email', 'text']),
  phone: new Set(['phone', 'text']),
  number: new Set(['number', 'text']),
  date: new Set(['date', 'text']),
  select: new Set(['select', 'text']),
  radio: new Set(['select', 'text']),
  multiselect: new Set(['multiselect', 'text']),
  checkbox: new Set(['boolean', 'text']),
  boolean: new Set(['boolean', 'text']),
  consent: new Set(['boolean', 'text']),
  hidden: new Set(['text', 'textarea', 'number', 'date', 'boolean'])
};
const OPTIONAL_FORM_REFERENCE_FIELDS = [
  'assignTo',
  'pipelineId',
  'stageId',
  'bookingLinkId'
];

function normalizeFormSettings(settings = {}) {
  const normalized = { ...settings };
  for (const field of OPTIONAL_FORM_REFERENCE_FIELDS) {
    if (field in normalized) {
      normalized[field] = normalizeOptionalObjectId(normalized[field]);
    }
  }
  if ('addTags' in normalized) {
    normalized.addTags = normalizeOptionalObjectIdArray(normalized.addTags);
  }
  if ('notifyUsers' in normalized) {
    normalized.notifyUsers = normalizeOptionalObjectIdArray(normalized.notifyUsers);
  }
  return normalized;
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400, retryable: false });
}

async function uniqueFormSlug(value, excludeId = null) {
  const base = slugifyPublic(value) || 'formulario';
  let candidate = base;
  let suffix = 2;
  while (await Form.exists({ slug: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function asPlain(value) {
  return value?.toObject?.() || value;
}

function publicField(field) {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    placeholder: field.placeholder,
    helpText: field.helpText,
    options: field.options,
    defaultValue: field.type === 'hidden' ? field.defaultValue : undefined,
    order: field.order,
    hidden: field.hidden,
    validation: field.validation,
    consentChannel: field.consentChannel || ''
  };
}

export class FormsService {
  static async actorFor(form) {
    return (
      await User.findOne({
        _id: form.createdBy,
        companyId: form.companyId,
        status: 'active'
      })
    ) || User.findOne({
      companyId: form.companyId,
      role: 'ADMIN',
      status: 'active'
    }).sort({ createdAt: 1 });
  }

  static async validateConfiguration(companyId, input) {
    if (input.type && !FORM_TYPES.includes(input.type)) throw badRequest('type de formulario invalido');
    const fields = input.fields || [];
    if (fields.length > 50) throw badRequest('Un formulario admite maximo 50 campos');
    const keys = new Set();
    for (const field of fields) {
      if (!isSafeMarketingKey(field.key)) throw badRequest(`key invalida: ${field.key}`);
      if (keys.has(field.key)) throw badRequest(`Campo duplicado: ${field.key}`);
      keys.add(field.key);
      if (!FORM_FIELD_TYPES.includes(field.type)) throw badRequest(`Tipo invalido: ${field.type}`);
      if (
        field.type === 'consent' &&
        field.consentChannel &&
        !['whatsapp', 'sms', 'email', 'call', 'facebook_messenger', 'instagram_dm', 'other']
          .includes(field.consentChannel)
      ) {
        throw badRequest(`Canal de consentimiento invalido: ${field.consentChannel}`);
      }
      if (['select', 'multiselect', 'radio'].includes(field.type) && !(field.options || []).length) {
        throw badRequest(`El campo ${field.key} requiere opciones`);
      }
    }
    const settings = normalizeFormSettings(input.settings);
    const attribution = normalizeMarketingAttribution(input.attribution || {});
    if (
      attribution.campaignId &&
      !await Campaign.exists({ _id: attribution.campaignId, companyId, status: { $ne: 'archived' } })
    ) {
      throw badRequest('campaignId no pertenece a la empresa');
    }
    if (
      settings.defaultContactStatus &&
      !CONTACT_STATUSES.includes(settings.defaultContactStatus)
    ) {
      throw badRequest('defaultContactStatus invalido');
    }
    if (
      settings.defaultLifecycleStage &&
      !CONTACT_LIFECYCLE_STAGES.includes(settings.defaultLifecycleStage)
    ) {
      throw badRequest('defaultLifecycleStage invalido');
    }
    if (settings.createOpportunity && (!settings.pipelineId || !settings.stageId)) {
      throw badRequest('pipelineId y stageId son requeridos para crear oportunidades');
    }
    const references = [
      [settings.assignTo, User, { role: { $in: ['ADMIN', 'SUPERVISOR', 'CALLCENTER'] }, status: 'active' }, 'assignTo'],
      [settings.pipelineId, Pipeline, { status: 'active' }, 'pipelineId'],
      [settings.stageId, PipelineStage, { status: 'active' }, 'stageId'],
      [settings.bookingLinkId, BookingLink, { status: 'active' }, 'bookingLinkId']
    ];
    for (const [id, Model, extra, field] of references) {
      if (!id) continue;
      if (!mongoose.isValidObjectId(id) || !await Model.exists({ _id: id, companyId, ...extra })) {
        throw badRequest(`${field} no pertenece a la empresa`);
      }
    }
    if (settings.stageId && settings.pipelineId) {
      const stage = await PipelineStage.findOne({
        _id: settings.stageId,
        companyId,
        pipelineId: settings.pipelineId
      }).select('_id');
      if (!stage) throw badRequest('stageId no pertenece al pipeline seleccionado');
    }
    const tagIds = [...new Set((settings.addTags || []).map(String))];
    if (tagIds.some((id) => !mongoose.isValidObjectId(id))) throw badRequest('Tag invalido');
    if (tagIds.length) {
      const count = await Tag.countDocuments({
        _id: { $in: tagIds },
        companyId,
        status: 'active',
        ...tagScopeFilter('contact')
      });
      if (count !== tagIds.length) throw badRequest('Uno o mas tags no pertenecen a la empresa');
    }
    const notifyIds = [...new Set((settings.notifyUsers || []).map(String))];
    if (notifyIds.some((id) => !mongoose.isValidObjectId(id))) throw badRequest('Usuario de notificacion invalido');
    if (notifyIds.length) {
      const count = await User.countDocuments({
        _id: { $in: notifyIds },
        companyId,
        status: 'active'
      });
      if (count !== notifyIds.length) {
        throw badRequest('Uno o mas usuarios de notificacion no pertenecen a la empresa');
      }
    }
    for (const mapping of settings.fieldMappings || []) {
      if (!['contact', 'opportunity'].includes(mapping.targetEntity)) {
        throw badRequest('targetEntity de mapping invalido');
      }
      if (!keys.has(mapping.formFieldKey)) {
        throw badRequest(`Mapping usa campo inexistente: ${mapping.formFieldKey}`);
      }
      const allowed = mapping.targetEntity === 'contact' ? CONTACT_FIELDS : OPPORTUNITY_FIELDS;
      if (!mapping.customFieldKey && !allowed.has(mapping.targetField)) {
        throw badRequest(`targetField no permitido: ${mapping.targetField}`);
      }
      if (mapping.customFieldKey) {
        const customField = await CustomField.findOne({
          companyId,
          entityType: mapping.targetEntity,
          key: mapping.customFieldKey,
          status: 'active'
        });
        if (!customField) throw badRequest(`Custom field no encontrado: ${mapping.customFieldKey}`);
        const sourceField = fields.find((field) => field.key === mapping.formFieldKey);
        if (!CUSTOM_FIELD_COMPATIBILITY[sourceField.type]?.has(customField.type)) {
          throw badRequest(
            `El campo ${sourceField.key} no es compatible con ${customField.key}`
          );
        }
      }
    }
    return true;
  }

  static async createForm({ actor, body }) {
    const settings = normalizeFormSettings(body.settings);
    await this.validateConfiguration(actor.companyId, { ...body, settings });
    await checkUsageLimit({
      companyId: actor.companyId,
      distributorId: actor.distributorId,
      metric: 'forms'
    });
    const form = await Form.create({
      companyId: actor.companyId,
      distributorId: actor.distributorId || null,
      name: sanitizePlainText(body.name, 120),
      slug: await uniqueFormSlug(body.slug || body.name),
      description: body.description || '',
      type: body.type || 'lead_capture',
      fields: body.fields || [],
      settings,
      styling: body.styling || {},
      createdBy: actor._id,
      updatedBy: actor._id,
      attribution: normalizeMarketingAttribution(body.attribution || {}),
      metadata: body.metadata || {}
    });
    await Promise.all([
      trackUsage({
        companyId: form.companyId,
        distributorId: form.distributorId,
        metric: 'forms',
        metadata: { formId: form._id }
      }),
      recordActivity({
        user: actor,
        type: 'form_created',
        summary: `Formulario creado: ${form.name}`,
        metadata: { formId: form._id, formType: form.type }
      }),
      WorkflowEventEmitter.safelyEmit({
        companyId: form.companyId,
        distributorId: form.distributorId,
        eventType: 'form.created',
        sourceModule: 'forms',
        entityType: 'form',
        entityId: form._id,
        actorUserId: actor._id,
        idempotencyKey: `form:${form._id}:created`,
        payload: { formType: form.type, status: form.status }
      })
    ]);
    return form;
  }

  static async updateForm({ actor, form, body }) {
    const settings = normalizeFormSettings({
      ...form.settings.toObject(),
      ...(body.settings || {})
    });
    const definition = {
      type: body.type || form.type,
      fields: body.fields || form.fields.map(asPlain),
      settings,
      attribution: body.attribution || form.attribution
    };
    await this.validateConfiguration(form.companyId, definition);
    if ('name' in body) form.name = sanitizePlainText(body.name, 120);
    if ('slug' in body && slugifyPublic(body.slug) !== form.slug) {
      form.slug = await uniqueFormSlug(body.slug, form._id);
    }
    for (const field of ['description', 'type', 'fields', 'styling', 'metadata']) {
      if (field in body) form[field] = body[field];
    }
    if ('attribution' in body) {
      form.attribution = normalizeMarketingAttribution(body.attribution);
    }
    if ('settings' in body) {
      form.settings = settings;
    }
    form.updatedBy = actor._id;
    await form.save();
    await recordActivity({
      user: actor,
      type: 'form_updated',
      summary: `Formulario actualizado: ${form.name}`,
      metadata: { formId: form._id, fields: Object.keys(body) }
    });
    return form;
  }

  static async setStatus({ actor, form, status }) {
    if (!['published', 'paused', 'archived'].includes(status)) throw badRequest('status invalido');
    if (status === 'published') {
      await this.validateConfiguration(form.companyId, form.toObject());
      if (!form.fields.length) throw badRequest('Agrega al menos un campo antes de publicar');
      await checkUsageLimit({
        companyId: form.companyId,
        distributorId: form.distributorId,
        metric: 'forms'
      });
      form.publishedAt = new Date();
      form.archivedAt = null;
    }
    if (status === 'archived') form.archivedAt = new Date();
    form.status = status;
    form.updatedBy = actor._id;
    await form.save();
    const activityType = {
      published: 'form_published',
      paused: 'form_paused',
      archived: 'form_archived'
    }[status];
    await Promise.all([
      recordActivity({
        user: actor,
        type: activityType,
        summary: `Formulario ${status}: ${form.name}`,
        metadata: { formId: form._id, status }
      }),
      status === 'published'
        ? WorkflowEventEmitter.safelyEmit({
            companyId: form.companyId,
            distributorId: form.distributorId,
            eventType: 'form.published',
            sourceModule: 'forms',
            entityType: 'form',
            entityId: form._id,
            actorUserId: actor._id,
            idempotencyKey: `form:${form._id}:published:${form.publishedAt.getTime()}`,
            payload: { formType: form.type, slug: form.slug }
          })
        : null
    ]);
    return form;
  }

  static publicPayload(form) {
    return {
      slug: form.slug,
      name: form.name,
      description: form.description,
      type: form.type,
      fields: [...form.fields].sort((a, b) => a.order - b.order).map(publicField),
      styling: form.styling,
      settings: {
        successMessage: form.settings.successMessage,
        redirectUrl: form.settings.redirectUrl,
        requireConsent: form.settings.requireConsent,
        honeypotField: form.settings.honeypotField,
        bookingLinkSlug: form.settings.bookingLinkId?.slug || ''
      },
      submissionToken: createSubmissionToken(form._id)
    };
  }

  static normalizeValues(form, rawValues) {
    if (Buffer.byteLength(JSON.stringify(rawValues || {}), 'utf8') > MAX_SUBMISSION_BYTES) {
      throw Object.assign(new Error('Payload de formulario demasiado grande'), { status: 413 });
    }
    const sanitized = sanitizeMarketingValue(rawValues || {});
    const normalized = {};
    const errors = [];
    for (const field of form.fields) {
      let value = sanitized[field.key];
      if (field.type === 'hidden') value = field.defaultValue;
      if (field.type === 'boolean' || field.type === 'checkbox' || field.type === 'consent') {
        value = value === true || value === 'true' || value === 'on' || value === '1';
      }
      const empty =
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);
      if (field.required && empty) errors.push(`${field.label} es requerido`);
      if (empty) {
        normalized[field.key] = field.defaultValue ?? (field.type === 'multiselect' ? [] : '');
        continue;
      }
      if (typeof value === 'string' && value.length > Number(field.validation?.maxLength || 5000)) {
        errors.push(`${field.label} supera el maximo permitido`);
      }
      if (field.type === 'email') {
        value = String(value).toLowerCase();
        if (!EMAIL_PATTERN.test(value)) errors.push(`${field.label} no es email valido`);
      }
      if (field.type === 'phone' && !PHONE_PATTERN.test(String(value))) {
        errors.push(`${field.label} no es telefono valido`);
      }
      if (field.type === 'number') {
        value = Number(value);
        if (!Number.isFinite(value)) errors.push(`${field.label} debe ser numerico`);
      }
      if (field.type === 'date') {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) errors.push(`${field.label} debe ser fecha valida`);
        else value = date.toISOString().slice(0, 10);
      }
      if (['select', 'radio'].includes(field.type) && !field.options.includes(String(value))) {
        errors.push(`${field.label} contiene una opcion invalida`);
      }
      if (field.type === 'multiselect') {
        value = Array.isArray(value) ? value.map(String) : [String(value)];
        if (value.some((item) => !field.options.includes(item))) {
          errors.push(`${field.label} contiene opciones invalidas`);
        }
      }
      normalized[field.key] = value;
    }
    if (form.settings.requireConsent) {
      const consentField = form.fields.find((field) => field.type === 'consent');
      if (!consentField || normalized[consentField.key] !== true) {
        errors.push('El consentimiento es requerido');
      }
    }
    if (errors.length) throw badRequest(errors.join('. '));
    return normalized;
  }

  static spamCheck(form, body) {
    if (!form.settings.spamProtection) return { spam: false, score: 0, reason: '' };
    const honeypot = body[form.settings.honeypotField] || body.honeypot;
    if (honeypot) return { spam: true, score: 100, reason: 'honeypot' };
    const token = parseSubmissionToken(body.submissionToken, form._id);
    if (!token) return { spam: true, score: 80, reason: 'invalid_submission_token' };
    if (Date.now() - token.issuedAt < form.settings.minimumSubmitTimeMs) {
      return { spam: true, score: 90, reason: 'submitted_too_fast' };
    }
    return { spam: false, score: 0, reason: '' };
  }

  static mappedData(form, values, entityType) {
    const standard = {};
    const customFields = {};
    for (const mapping of form.settings.fieldMappings || []) {
      if (mapping.targetEntity !== entityType) continue;
      const value = values[mapping.formFieldKey];
      if (mapping.customFieldKey) customFields[mapping.customFieldKey] = value;
      else if (mapping.targetField) standard[mapping.targetField] = value;
    }
    return { standard, customFields };
  }

  static async findOrCreateContact({ form, values, actor, attribution }) {
    if (!form.settings.createContact && !form.settings.updateExistingContact) {
      return { contact: null, created: false, ignored: false };
    }
    const mapped = this.mappedData(form, values, 'contact');
    const email = String(mapped.standard.email || values.email || '').toLowerCase();
    const phone = String(mapped.standard.phone || values.phone || '');
    const conditions = [];
    if (email) conditions.push({ email });
    if (phone) conditions.push({ phone });
    const matches = conditions.length
      ? await Contact.find({
          companyId: form.companyId,
          archivedAt: null,
          $or: conditions
        }).limit(2)
      : [];
    const unique = [...new Map(matches.map((item) => [String(item._id), item])).values()];
    if (unique.length > 1) throw Object.assign(new Error('Email y telefono coinciden con contactos distintos'), { status: 409 });
    let contact = unique[0] || null;
    if (contact && form.settings.duplicateStrategy === 'ignore_duplicate') {
      return { contact, created: false, ignored: true };
    }
    const common = {
      ...mapped.standard,
      email,
      phone,
      status: CONTACT_STATUSES.includes(mapped.standard.status)
        ? mapped.standard.status
        : form.settings.defaultContactStatus,
      lifecycleStage: CONTACT_LIFECYCLE_STAGES.includes(mapped.standard.lifecycleStage)
        ? mapped.standard.lifecycleStage
        : form.settings.defaultLifecycleStage,
      priority: CRM_PRIORITIES.includes(mapped.standard.priority)
        ? mapped.standard.priority
        : 'medium',
      assignedTo: form.settings.assignTo || undefined,
      source: mapped.standard.source || `Formulario: ${form.name}`,
      customFields: mapped.customFields
    };
    if (contact && form.settings.updateExistingContact) {
      for (const [key, value] of Object.entries(common)) {
        if (value !== undefined && value !== '') {
          if (key === 'customFields') contact.customFields = { ...(contact.customFields || {}), ...value };
          else contact[key] = value;
        }
      }
      contact.tags = [...new Set([...contact.tags.map(String), ...form.settings.addTags.map(String)])];
      contact.attribution = mergeMarketingAttribution(contact.attribution, attribution);
      contact.metadata = {
        ...(contact.metadata || {}),
        channel: attribution.entryChannel || attribution.channel || contact.metadata?.channel || '',
        campaign: attribution.campaignName || attribution.utmCampaign || contact.metadata?.campaign || ''
      };
      contact.updatedBy = actor._id;
      await contact.save();
      return { contact, created: false, ignored: false };
    }
    if (contact) return { contact, created: false, ignored: false };
    if (!form.settings.createContact) return { contact: null, created: false, ignored: false };
    await checkPlatformLimit(form.distributorId, 'contacts');
    const name =
      mapped.standard.name ||
      mapped.standard.fullName ||
      values.name ||
      [values.first_name, values.last_name].filter(Boolean).join(' ') ||
      email ||
      phone ||
      'Lead de formulario';
    contact = await Contact.create({
      companyId: form.companyId,
      distributorId: form.distributorId,
      ...common,
      name,
      fullName: mapped.standard.fullName || name,
      tags: form.settings.addTags,
      createdBy: actor._id,
      updatedBy: actor._id,
      attribution,
      metadata: {
        sourceFormId: form._id,
        channel: attribution.entryChannel || attribution.channel || '',
        campaign: attribution.campaignName || attribution.utmCampaign || ''
      }
    });
    return { contact, created: true, ignored: false };
  }

  static async createOpportunity({ form, values, contact, actor, attribution }) {
    if (!form.settings.createOpportunity || !contact) return null;
    const mapped = this.mappedData(form, values, 'opportunity');
    const pipeline = await Pipeline.findOne({
      _id: form.settings.pipelineId,
      companyId: form.companyId,
      status: 'active'
    });
    const stage = await PipelineStage.findOne({
      _id: form.settings.stageId,
      companyId: form.companyId,
      pipelineId: pipeline?._id,
      status: 'active'
    });
    if (!pipeline || !stage) throw badRequest('Pipeline o etapa no disponible');
    return Opportunity.create({
      companyId: form.companyId,
      distributorId: form.distributorId,
      contactId: contact._id,
      pipelineId: pipeline._id,
      stageId: stage._id,
      title: mapped.standard.title || `Lead: ${contact.name}`,
      value: Number(mapped.standard.value || 0),
      source: mapped.standard.source || `Formulario: ${form.name}`,
      priority: CRM_PRIORITIES.includes(mapped.standard.priority)
        ? mapped.standard.priority
        : 'medium',
      expectedCloseDate: mapped.standard.expectedCloseDate || null,
      assignedTo: form.settings.assignTo || contact.assignedTo || null,
      customFields: mapped.customFields,
      createdBy: actor._id,
      updatedBy: actor._id,
      attribution,
      metadata: {
        sourceFormId: form._id,
        channel: attribution.entryChannel || attribution.channel || '',
        campaign: attribution.campaignName || attribution.utmCampaign || ''
      }
    });
  }

  static async processSubmission({ form, body, tracking, source = {} }) {
    await checkUsageLimit({
      companyId: form.companyId,
      distributorId: form.distributorId,
      metric: 'form_submissions'
    });
    const actor = await this.actorFor(form);
    if (!actor) throw Object.assign(new Error('La empresa no tiene administrador activo'), { status: 503 });
    const spam = this.spamCheck(form, body);
    const rawValues = body.values && typeof body.values === 'object' ? body.values : body;
    let normalizedValues = {};
    if (!spam.spam) normalizedValues = this.normalizeValues(form, rawValues);
    const sourceAttribution = mergeMarketingAttribution(
      form.attribution || {},
      source.attribution || {}
    );
    const attribution = mergeMarketingAttribution(
      sourceAttribution,
      attributionFromTracking(tracking, tracking.attribution || body.attribution || {}, {
        campaignId: sourceAttribution.campaignId || null,
        campaignName: sourceAttribution.campaignName || '',
        formId: form._id,
        landingPageId: source.sourceType === 'landing_page' ? source.sourceId : null,
        funnelId: source.funnelId || null,
        funnelStepId: source.funnelStepId || null
      })
    );
    const consentField = form.fields.find((field) => field.type === 'consent');
    const submission = await FormSubmission.create({
      companyId: form.companyId,
      distributorId: form.distributorId,
      formId: form._id,
      sourceType: source.sourceType || 'form',
      sourceId: source.sourceId || null,
      funnelId: source.funnelId || null,
      funnelStepId: source.funnelStepId || null,
      values: spam.spam ? {} : normalizedValues,
      normalizedValues,
      status: spam.spam ? 'spam' : 'received',
      ...tracking,
      consent: {
        granted: consentField ? normalizedValues[consentField.key] === true : false,
        text: consentField?.label || '',
        grantedAt: consentField && normalizedValues[consentField.key] === true ? new Date() : null
      },
      spamScore: spam.score,
      attribution,
      metadata: { spamReason: spam.reason }
    });
    await trackUsage({
      companyId: form.companyId,
      distributorId: form.distributorId,
      metric: 'form_submissions',
      metadata: { formId: form._id, submissionId: submission._id, status: submission.status }
    });
    if (spam.spam) {
      await Promise.all([
        recordActivity({
          user: actor,
          type: 'form_spam_detected',
          summary: `Spam detectado en ${form.name}`,
          metadata: { formId: form._id, submissionId: submission._id, reason: spam.reason }
        }),
        WorkflowEventEmitter.safelyEmit({
          companyId: form.companyId,
          distributorId: form.distributorId,
          eventType: 'form.spam_detected',
          sourceModule: 'forms',
          entityType: 'form_submission',
          entityId: submission._id,
          actorUserId: actor._id,
          idempotencyKey: `submission:${submission._id}:spam`,
          payload: { formId: form._id, spamScore: spam.score, reason: spam.reason }
        })
      ]);
      for (const userId of form.settings.notifyUsers) {
        await NotificationService.create({
          companyId: form.companyId,
          distributorId: form.distributorId,
          userId,
          type: 'form_spam_detected',
          title: `Spam detectado: ${form.name}`,
          body: 'El envio fue bloqueado por las reglas basicas anti-spam.',
          relatedType: 'form_submission',
          relatedId: submission._id
        });
      }
      return { submission, spam: true };
    }

    try {
      if (!form.settings.allowMultipleSubmissions) {
        const previous = await FormSubmission.findOne({
          _id: { $ne: submission._id },
          formId: form._id,
          ipHash: tracking.ipHash,
          status: 'processed'
        });
        if (previous) {
          submission.status = 'ignored';
          submission.metadata = { ...(submission.metadata || {}), duplicateOf: previous._id };
          await submission.save();
          return { submission, ignored: true };
        }
      }
      await Promise.all([
        recordActivity({
          user: actor,
          type: 'form_submitted',
          summary: `Formulario enviado: ${form.name}`,
          metadata: {
            formId: form._id,
            submissionId: submission._id,
            sourceType: submission.sourceType,
            funnelId: submission.funnelId,
            funnelStepId: submission.funnelStepId
          }
        }),
        WorkflowEventEmitter.safelyEmit({
          companyId: form.companyId,
          distributorId: form.distributorId,
          eventType: form.type === 'survey' ? 'survey.submitted' : 'form.submitted',
          sourceModule: form.type === 'survey' ? 'surveys' : 'forms',
          entityType: 'form_submission',
          entityId: submission._id,
          actorUserId: actor._id,
          idempotencyKey: `submission:${submission._id}:submitted`,
          payload: {
            formId: form._id,
            formType: form.type,
            sourceType: submission.sourceType,
            funnelId: submission.funnelId,
            funnelStepId: submission.funnelStepId
          }
        })
      ]);
      const contactResult = await this.findOrCreateContact({
        form,
        values: normalizedValues,
        actor,
        attribution
      });
      if (contactResult.ignored) {
        submission.status = 'ignored';
        submission.contactId = contactResult.contact?._id || null;
        await submission.save();
        return { submission, ignored: true };
      }
      const opportunity = await this.createOpportunity({
        form,
        values: normalizedValues,
        contact: contactResult.contact,
        actor,
        attribution
      });
      submission.contactId = contactResult.contact?._id || null;
      submission.opportunityId = opportunity?._id || null;
      submission.status = 'processed';
      await submission.save();
      const grantedConsents = contactResult.contact ? form.fields.filter(
        (field) =>
          field.type === 'consent' &&
          field.consentChannel &&
          normalizedValues[field.key] === true
      ) : [];
      await Promise.all(grantedConsents.map((field) =>
        CommunicationPolicyService.recordConsent({
          companyId: form.companyId,
          distributorId: form.distributorId,
          contactId: contactResult.contact._id,
          channel: field.consentChannel,
          status: 'opted_in',
          source: 'form',
          sourceReference: String(submission._id),
          consentText: field.label,
          consentVersion: form.updatedAt?.toISOString?.() || '',
          recordedBy: actor._id,
          evidence: {
            formId: form._id,
            submissionId: submission._id,
            fieldKey: field.key
          }
        })
      ));
      const conversionBase = {
        companyId: form.companyId,
        distributorId: form.distributorId,
        formId: form._id,
        landingPageId: submission.sourceType === 'landing_page' ? submission.sourceId : null,
        formSubmissionId: submission._id,
        funnelId: submission.funnelId,
        funnelStepId: submission.funnelStepId,
        contactId: submission.contactId,
        opportunityId: submission.opportunityId,
        sessionId: tracking.sessionId,
        visitorId: tracking.visitorId,
        attribution
      };
      const conversionTypes = ['form_submission'];
      if (contactResult.created) conversionTypes.push('contact_created');
      if (opportunity) conversionTypes.push('opportunity_created');
      await Promise.all(
        conversionTypes.map((type) => ConversionEvent.create({ ...conversionBase, type }))
      );
      await trackUsage({
        companyId: form.companyId,
        distributorId: form.distributorId,
        metric: 'conversions',
        quantity: conversionTypes.length,
        metadata: { types: conversionTypes, formId: form._id }
      });
      await recordActivity({
        user: actor,
        type: 'conversion_recorded',
        summary: `Conversion registrada desde formulario: ${form.name}`,
        metadata: {
          formId: form._id,
          submissionId: submission._id,
          types: conversionTypes,
          contactId: submission.contactId,
          opportunityId: submission.opportunityId
        }
      });
      if (contactResult.created) {
        await Promise.all([
          recordActivity({
            user: actor,
            type: 'contact_created_from_form',
            summary: `Contacto creado desde formulario: ${contactResult.contact.name}`,
            metadata: {
              formId: form._id,
              submissionId: submission._id,
              contactId: contactResult.contact._id
            }
          }),
          WorkflowEventEmitter.safelyEmit({
            companyId: form.companyId,
            distributorId: form.distributorId,
            eventType: 'form.contact_created',
            sourceModule: 'forms',
            entityType: 'contact',
            entityId: contactResult.contact._id,
            actorUserId: actor._id,
            idempotencyKey: `submission:${submission._id}:contact-created`,
            payload: { formId: form._id, submissionId: submission._id }
          })
        ]);
      }
      if (opportunity) {
        await Promise.all([
          recordActivity({
            user: actor,
            type: 'opportunity_created_from_form',
            summary: `Oportunidad creada desde formulario: ${opportunity.title}`,
            metadata: {
              formId: form._id,
              submissionId: submission._id,
              contactId: submission.contactId,
              opportunityId: opportunity._id
            }
          }),
          WorkflowEventEmitter.safelyEmit({
            companyId: form.companyId,
            distributorId: form.distributorId,
            eventType: 'form.opportunity_created',
            sourceModule: 'forms',
            entityType: 'opportunity',
            entityId: opportunity._id,
            actorUserId: actor._id,
            idempotencyKey: `submission:${submission._id}:opportunity-created`,
            payload: {
              formId: form._id,
              submissionId: submission._id,
              contactId: submission.contactId
            }
          })
        ]);
      }
      await Promise.all([
        recordActivity({
          user: actor,
          type: 'form_submission_processed',
          summary: `Submission procesado: ${form.name}`,
          metadata: {
            formId: form._id,
            submissionId: submission._id,
            contactId: submission.contactId,
            opportunityId: submission.opportunityId
          }
        }),
        WorkflowEventEmitter.safelyEmit({
          companyId: form.companyId,
          distributorId: form.distributorId,
          eventType: 'form.submission_processed',
          sourceModule: 'forms',
          entityType: 'form_submission',
          entityId: submission._id,
          actorUserId: actor._id,
          idempotencyKey: `submission:${submission._id}:processed`,
          payload: {
            formId: form._id,
            contactId: submission.contactId,
            opportunityId: submission.opportunityId,
            funnelId: submission.funnelId,
            funnelStepId: submission.funnelStepId
          }
        })
      ]);
      for (const userId of form.settings.notifyUsers) {
        await NotificationService.create({
          companyId: form.companyId,
          distributorId: form.distributorId,
          userId,
          type: contactResult.created ? 'form_lead_created' : 'form_submission_received',
          title: contactResult.created ? 'Nuevo lead capturado' : 'Nuevo formulario enviado',
          body: form.name,
          relatedType: 'form_submission',
          relatedId: submission._id,
          metadata: { contactId: submission.contactId, opportunityId: submission.opportunityId }
        });
        if (opportunity) {
          await NotificationService.create({
            companyId: form.companyId,
            distributorId: form.distributorId,
            userId,
            type: 'form_opportunity_created',
            title: 'Oportunidad creada desde formulario',
            body: opportunity.title,
            relatedType: 'opportunity',
            relatedId: opportunity._id
          });
        }
      }
      RealtimeService.publish('form.submission_processed', {
        companyId: form.companyId,
        data: {
          formId: form._id,
          submissionId: submission._id,
          contactId: submission.contactId,
          opportunityId: submission.opportunityId
        }
      });
      return {
        submission,
        contact: contactResult.contact,
        opportunity,
        createdContact: contactResult.created
      };
    } catch (error) {
      submission.status = 'failed';
      submission.error = sanitizeError(error);
      await submission.save();
      throw error;
    }
  }

  static async analytics(formId, companyId) {
    const [views, byStatus, contactsCreated, opportunitiesCreated] = await Promise.all([
      ConversionEvent.countDocuments({ companyId, formId, type: 'page_view' }),
      FormSubmission.aggregate([
        { $match: { companyId, formId: new mongoose.Types.ObjectId(formId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      ConversionEvent.countDocuments({ companyId, formId, type: 'contact_created' }),
      ConversionEvent.countDocuments({ companyId, formId, type: 'opportunity_created' })
    ]);
    const statuses = Object.fromEntries(byStatus.map((item) => [item._id, item.count]));
    const submissions = Object.values(statuses).reduce((sum, value) => sum + value, 0);
    const processed = statuses.processed || 0;
    return {
      views,
      submissions,
      processed,
      spam: statuses.spam || 0,
      ignored: statuses.ignored || 0,
      failed: statuses.failed || 0,
      contactsCreated,
      opportunitiesCreated,
      conversionRate: views ? Number(((processed / views) * 100).toFixed(2)) : 0
    };
  }

  static successPayload(form, result) {
    return {
      success: !result.spam,
      spam: Boolean(result.spam),
      ignored: Boolean(result.ignored),
      submissionId: result.submission._id,
      successMessage: form.settings.successMessage,
      redirectUrl: safePublicUrl(form.settings.redirectUrl)
    };
  }
}
