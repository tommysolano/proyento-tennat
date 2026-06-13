import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { Campaign } from '../../models/Campaign.js';
import {
  Contact,
  CONTACT_LIFECYCLE_STAGES,
  CONTACT_STATUSES,
  CRM_PRIORITIES
} from '../../models/Contact.js';
import { ConversionEvent } from '../../models/ConversionEvent.js';
import { Form } from '../../models/Form.js';
import { FormSubmission } from '../../models/FormSubmission.js';
import { IntegrationEvent } from '../../models/IntegrationEvent.js';
import { Note } from '../../models/Note.js';
import { Opportunity } from '../../models/Opportunity.js';
import { Pipeline } from '../../models/Pipeline.js';
import { PipelineStage } from '../../models/PipelineStage.js';
import { Tag } from '../../models/Tag.js';
import { User } from '../../models/User.js';
import { tagScopeFilter } from '../../utils/crmOrganization.js';
import { checkModuleAccess } from '../../middleware/moduleMiddleware.js';
import { checkPlatformLimit } from '../../utils/platformLimits.js';
import { sanitizeError } from '../../utils/sanitize.js';
import { EMAIL_PATTERN } from '../../utils/validation.js';
import {
  mergeMarketingAttribution,
  normalizeMarketingAttribution
} from '../marketing/marketingAttribution.js';
import {
  sanitizeMarketingValue,
  sanitizePlainText
} from '../marketing/marketingSecurity.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { OperationalAlertService } from '../ops/OperationalAlertService.js';
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
  'country',
  'tags',
  'notes'
]);
const OPPORTUNITY_FIELDS = new Set([
  'title',
  'value',
  'source',
  'priority',
  'expectedCloseDate',
  'tags'
]);
const ATTRIBUTION_FIELDS = new Set([
  'campaignName',
  'externalCampaignId',
  'externalAdSetId',
  'adSetName',
  'externalAdId',
  'adName',
  'source',
  'medium',
  'channel',
  'pixelId',
  'tagId',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
  'utmTerm',
  'landingPageUrl',
  'externalEventId',
  'consultedProduct',
  'purchasedProduct',
  'consultedCategory',
  'purchasedCategory',
  'adReference',
  'entryChannel'
]);
const CONSENT_FIELDS = new Set([
  'channel',
  'status',
  'source',
  'legalBasis',
  'consentText',
  'consentVersion',
  'sourceReference'
]);
const BLOCKED_FIELD_PARTS = [
  'password',
  'credential',
  'secret',
  'token',
  'companyid',
  'distributorid',
  'createdby',
  'updatedby',
  '__proto__',
  'constructor',
  'prototype'
];
const ALLOWED_TRANSFORMS = new Set([
  'none',
  'trim',
  'lowercase',
  'uppercase',
  'number',
  'date',
  'boolean'
]);

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function safePath(value) {
  const path = String(value || '').trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,199}$/.test(path)) return '';
  const normalized = path.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return BLOCKED_FIELD_PARTS.some((part) => normalized.includes(part)) ? '' : path;
}

function valueAtPath(payload, path) {
  return path.split('.').reduce((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return current[key];
  }, payload);
}

function transformed(value, transform) {
  if (value === undefined || value === null) return value;
  if (transform === 'trim') return String(value).trim();
  if (transform === 'lowercase') return String(value).trim().toLowerCase();
  if (transform === 'uppercase') return String(value).trim().toUpperCase();
  if (transform === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) throw badRequest('Un campo mapeado no es numerico');
    return number;
  }
  if (transform === 'date') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw badRequest('Un campo mapeado no es una fecha valida');
    return date;
  }
  if (transform === 'boolean') {
    return value === true || ['true', '1', 'yes', 'si'].includes(String(value).toLowerCase());
  }
  return sanitizeMarketingValue(value);
}

export class IntegrationService {
  static async assertRuntimeModules(integration) {
    const required = new Set();
    if (
      integration.settings.createContact ||
      integration.settings.updateExistingContact
    ) {
      required.add('crm');
      required.add('contacts');
    }
    if (integration.settings.createOpportunity) {
      required.add('opportunities');
    }
    if (integration.settings.formId || integration.settings.campaignId) {
      required.add('forms');
    }
    for (const moduleKey of required) {
      const access = await checkModuleAccess(moduleKey, {
        role: 'ADMIN',
        companyId: integration.companyId,
        distributorId: integration.distributorId
      });
      if (!access.enabled) {
        throw Object.assign(new Error(access.message), { status: 403 });
      }
    }
  }

  static validateMappings(mappings = []) {
    if (!Array.isArray(mappings)) throw badRequest('mappings debe ser un arreglo');
    if (mappings.length > 100) throw badRequest('Una integracion admite maximo 100 mapeos');
    return mappings.map((mapping) => {
      const externalField = safePath(mapping.externalField);
      const internalField = safePath(mapping.internalField);
      if (!externalField) throw badRequest('externalField invalido o sensible');
      if (!internalField) throw badRequest('internalField invalido o sensible');
      const allowed = {
        contact: CONTACT_FIELDS,
        opportunity: OPPORTUNITY_FIELDS,
        marketingAttribution: ATTRIBUTION_FIELDS,
        communicationConsent: CONSENT_FIELDS,
        formSubmission: null
      }[mapping.internalEntity];
      if (allowed === undefined) throw badRequest('internalEntity invalido');
      if (allowed && !allowed.has(internalField)) {
        throw badRequest(`Campo interno no permitido: ${mapping.internalEntity}.${internalField}`);
      }
      if (mapping.internalEntity === 'formSubmission' && !/^[a-z][a-z0-9_]{0,63}$/.test(internalField)) {
        throw badRequest('Campo de formSubmission invalido');
      }
      if (!ALLOWED_TRANSFORMS.has(mapping.transform || 'none')) {
        throw badRequest('Transformacion de mapeo invalida');
      }
      return {
        externalField,
        internalEntity: mapping.internalEntity,
        internalField,
        transform: mapping.transform || 'none',
        required: Boolean(mapping.required),
        defaultValue: sanitizeMarketingValue(mapping.defaultValue)
      };
    });
  }

  static mapPayload(integration, payload) {
    const result = {
      contact: {},
      opportunity: {},
      formSubmission: {},
      marketingAttribution: {},
      communicationConsent: {}
    };
    for (const mapping of integration.mappings || []) {
      let value = valueAtPath(payload, mapping.externalField);
      if (value === undefined || value === null || value === '') value = mapping.defaultValue;
      if ((value === undefined || value === null || value === '') && mapping.required) {
        throw badRequest(`Falta el campo requerido: ${mapping.externalField}`);
      }
      if (value === undefined || value === null || value === '') continue;
      result[mapping.internalEntity][mapping.internalField] = transformed(
        value,
        mapping.transform
      );
    }
    return result;
  }

  static payloadHash(payload) {
    return createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
  }

  static async resolveCampaign(integration, attribution) {
    if (integration.settings.campaignId) {
      return Campaign.findOne({
        _id: integration.settings.campaignId,
        companyId: integration.companyId,
        status: { $ne: 'archived' }
      });
    }
    if (!attribution.externalCampaignId && !attribution.campaignName) return null;
    return Campaign.findOne({
      companyId: integration.companyId,
      status: { $ne: 'archived' },
      $or: [
        ...(attribution.externalCampaignId
          ? [{ 'externalIds.campaignId': attribution.externalCampaignId }]
          : []),
        ...(attribution.campaignName ? [{ name: attribution.campaignName }] : [])
      ]
    });
  }

  static normalizeContactData(data) {
    const normalized = {};
    for (const field of CONTACT_FIELDS) {
      if (!(field in data) || ['notes', 'tags'].includes(field)) continue;
      normalized[field] = sanitizePlainText(data[field], field === 'email' ? 320 : 1000);
    }
    if (normalized.email) {
      normalized.email = normalized.email.toLowerCase();
      if (!EMAIL_PATTERN.test(normalized.email)) throw badRequest('email mapeado invalido');
    }
    if (normalized.status && !CONTACT_STATUSES.includes(normalized.status)) {
      throw badRequest('status de contacto mapeado invalido');
    }
    if (
      normalized.lifecycleStage &&
      !CONTACT_LIFECYCLE_STAGES.includes(normalized.lifecycleStage)
    ) {
      throw badRequest('lifecycleStage mapeado invalido');
    }
    if (normalized.priority && !CRM_PRIORITIES.includes(normalized.priority)) {
      throw badRequest('priority de contacto mapeada invalida');
    }
    return normalized;
  }

  static async mappedTags(companyId, values, scope) {
    if (values === undefined || values === null || values === '') return [];
    const ids = [...new Set((Array.isArray(values) ? values : [values]).map(String))];
    if (ids.some((id) => !mongoose.isValidObjectId(id))) {
      throw badRequest(`tags de ${scope} contiene IDs invalidos`);
    }
    const count = await Tag.countDocuments({
      _id: { $in: ids },
      companyId,
      status: 'active',
      ...tagScopeFilter(scope)
    });
    if (count !== ids.length) throw badRequest(`tags de ${scope} no pertenece a la empresa`);
    return ids;
  }

  static async upsertContact(integration, mapped, attribution, actor) {
    if (!integration.settings.createContact && !integration.settings.updateExistingContact) {
      return { contact: null, created: false };
    }
    const data = this.normalizeContactData(mapped.contact);
    const tags = await this.mappedTags(integration.companyId, mapped.contact.tags, 'contact');
    const conditions = [];
    if (data.email) conditions.push({ email: data.email });
    if (data.phone) conditions.push({ phone: data.phone });
    let contact = conditions.length
      ? await Contact.findOne({
          companyId: integration.companyId,
          archivedAt: null,
          $or: conditions
        })
      : null;
    if (contact && integration.settings.updateExistingContact) {
      for (const [field, value] of Object.entries(data)) {
        if (value !== undefined && value !== '') contact[field] = value;
      }
      contact.attribution = mergeMarketingAttribution(contact.attribution, attribution);
      contact.metadata = {
        ...(contact.metadata || {}),
        integrationNote: sanitizePlainText(mapped.contact.notes, 2000),
        channel: attribution.entryChannel || attribution.channel || '',
        campaign: attribution.campaignName || attribution.utmCampaign || ''
      };
      if (tags.length) contact.tags = [...new Set([...contact.tags.map(String), ...tags])];
      contact.updatedBy = actor._id;
      await contact.save();
      return { contact, created: false };
    }
    if (contact || !integration.settings.createContact) return { contact, created: false };
    if (!data.phone && !data.email) throw badRequest('El mapeo debe producir email o telefono');
    await checkPlatformLimit(integration.distributorId, 'contacts');
    const name = data.name || data.fullName || data.email || data.phone;
    contact = await Contact.create({
      companyId: integration.companyId,
      distributorId: integration.distributorId,
      ...data,
      name,
      fullName: data.fullName || name,
      source: data.source || `Integracion: ${integration.name}`,
      tags,
      attribution,
      metadata: {
        sourceIntegrationId: integration._id,
        integrationNote: sanitizePlainText(mapped.contact.notes, 2000),
        channel: attribution.entryChannel || attribution.channel || '',
        campaign: attribution.campaignName || attribution.utmCampaign || ''
      },
      createdBy: actor._id,
      updatedBy: actor._id
    });
    return { contact, created: true };
  }

  static async createOpportunity(integration, mapped, contact, attribution, actor) {
    if (!integration.settings.createOpportunity || !contact) return null;
    const [pipeline, stage] = await Promise.all([
      Pipeline.findOne({
        _id: integration.settings.pipelineId,
        companyId: integration.companyId,
        status: 'active'
      }),
      PipelineStage.findOne({
        _id: integration.settings.stageId,
        companyId: integration.companyId,
        pipelineId: integration.settings.pipelineId,
        status: 'active'
      })
    ]);
    if (!pipeline || !stage) throw badRequest('Pipeline o etapa de integracion no disponible');
    const data = mapped.opportunity || {};
    const value = Number(data.value || 0);
    if (!Number.isFinite(value) || value < 0) throw badRequest('value de oportunidad invalido');
    const priority = CRM_PRIORITIES.includes(data.priority) ? data.priority : 'medium';
    const tags = await this.mappedTags(
      integration.companyId,
      data.tags,
      'opportunity'
    );
    let expectedCloseDate = null;
    if (data.expectedCloseDate) {
      expectedCloseDate = new Date(data.expectedCloseDate);
      if (Number.isNaN(expectedCloseDate.getTime())) {
        throw badRequest('expectedCloseDate de oportunidad invalida');
      }
    }
    return Opportunity.create({
      companyId: integration.companyId,
      distributorId: integration.distributorId,
      contactId: contact._id,
      pipelineId: pipeline._id,
      stageId: stage._id,
      title: sanitizePlainText(data.title || `Lead: ${contact.name}`, 300),
      value,
      source: sanitizePlainText(data.source || `Integracion: ${integration.name}`, 500),
      priority,
      tags,
      expectedCloseDate,
      attribution,
      metadata: {
        sourceIntegrationId: integration._id,
        channel: attribution.entryChannel || attribution.channel || '',
        campaign: attribution.campaignName || attribution.utmCampaign || ''
      },
      createdBy: actor._id,
      updatedBy: actor._id
    });
  }

  static async actorFor(integration) {
    return (
      await User.findOne({
        _id: integration.createdBy,
        companyId: integration.companyId,
        status: 'active'
      })
    ) || User.findOne({
      companyId: integration.companyId,
      role: 'ADMIN',
      status: 'active'
    }).sort({ createdAt: 1 });
  }

  static async processInbound({ integration, payload, externalEventId = '' }) {
    const payloadHash = this.payloadHash(payload);
    const eventId = sanitizePlainText(
      externalEventId || payload?.event_id || payload?.eventId || payload?.id || payloadHash,
      300
    );
    let event;
    try {
      event = await IntegrationEvent.create({
        companyId: integration.companyId,
        distributorId: integration.distributorId,
        integrationId: integration._id,
        externalEventId: eventId,
        payloadHash,
        rawPayload: sanitizeMarketingValue(payload || {})
      });
    } catch (error) {
      if (error.code === 11000) {
        return {
          duplicate: true,
          event: await IntegrationEvent.findOne({
            integrationId: integration._id,
            externalEventId: eventId
          })
        };
      }
      throw error;
    }

    try {
      event.status = 'processing';
      await event.save();
      await this.assertRuntimeModules(integration);
      const actor = await this.actorFor(integration);
      if (!actor) throw Object.assign(new Error('La empresa no tiene administrador activo'), { status: 503 });
      const mapped = this.mapPayload(integration, payload);
      let attribution = normalizeMarketingAttribution(mapped.marketingAttribution, {
        integrationId: integration._id,
        externalEventId: eventId,
        formId: integration.settings.formId || null,
        campaignId: integration.settings.campaignId || null,
        source: integration.provider,
        entryChannel: integration.provider
      });
      const campaign = await this.resolveCampaign(integration, attribution);
      if (campaign) {
        attribution = mergeMarketingAttribution(attribution, {
          campaignId: campaign._id,
          campaignName: campaign.name
        });
      }
      const contactResult = await this.upsertContact(
        integration,
        mapped,
        attribution,
        actor
      );
      const mappedConsent = mapped.communicationConsent || {};
      if (contactResult.contact && Object.keys(mappedConsent).length) {
        if (!mappedConsent.source) {
          throw badRequest('El consentimiento externo debe indicar source');
        }
        await CommunicationPolicyService.recordConsent({
          companyId: integration.companyId,
          distributorId: integration.distributorId,
          contactId: contactResult.contact._id,
          channel: mappedConsent.channel,
          status: mappedConsent.status,
          source: mappedConsent.source,
          legalBasis: mappedConsent.legalBasis,
          consentText: mappedConsent.consentText,
          consentVersion: mappedConsent.consentVersion,
          sourceReference:
            mappedConsent.sourceReference ||
            (mappedConsent.source === 'integration' ? eventId : ''),
          recordedBy: actor._id,
          evidence: {
            integrationId: integration._id,
            integrationEventId: event._id,
            externalEventId: eventId
          }
        });
      }
      const opportunity = await this.createOpportunity(
        integration,
        mapped,
        contactResult.contact,
        attribution,
        actor
      );
      const externalNote = sanitizePlainText(mapped.contact.notes, 5000);
      if (contactResult.contact && externalNote) {
        await Note.create({
          companyId: integration.companyId,
          distributorId: integration.distributorId,
          relatedType: 'contact',
          relatedId: contactResult.contact._id,
          text: externalNote,
          createdBy: actor._id,
          visibility: 'team',
          metadata: {
            sourceIntegrationId: integration._id,
            integrationEventId: event._id
          }
        });
      }
      let submission = null;
      if (integration.settings.formId) {
        const form = await Form.findOne({
          _id: integration.settings.formId,
          companyId: integration.companyId
        });
        if (!form) throw badRequest('formId de integracion no pertenece a la empresa');
        submission = await FormSubmission.create({
          companyId: integration.companyId,
          distributorId: integration.distributorId,
          formId: form._id,
          sourceType: 'form',
          values: mapped.formSubmission,
          normalizedValues: mapped.formSubmission,
          status: 'processed',
          contactId: contactResult.contact?._id || null,
          opportunityId: opportunity?._id || null,
          attribution,
          metadata: { sourceIntegrationId: integration._id }
        });
      }
      const conversionBase = {
        companyId: integration.companyId,
        distributorId: integration.distributorId,
        formId: integration.settings.formId || null,
        formSubmissionId: submission?._id || null,
        contactId: contactResult.contact?._id || null,
        opportunityId: opportunity?._id || null,
        attribution,
        metadata: { sourceIntegrationId: integration._id, integrationEventId: event._id }
      };
      const conversionTypes = [];
      if (submission) conversionTypes.push('form_submission');
      if (contactResult.created) conversionTypes.push('contact_created');
      if (opportunity) conversionTypes.push('opportunity_created');
      await Promise.all(
        conversionTypes.map((type) => ConversionEvent.create({ ...conversionBase, type }))
      );
      event.status = 'processed';
      event.mappedData = mapped;
      event.attribution = attribution;
      event.contactId = contactResult.contact?._id || null;
      event.opportunityId = opportunity?._id || null;
      event.formSubmissionId = submission?._id || null;
      event.processedAt = new Date();
      await event.save();
      integration.status = 'active';
      integration.lastEventAt = new Date();
      integration.lastSyncAt = new Date();
      integration.lastError = '';
      integration.lastErrorAt = null;
      await integration.save();
      return { event, contact: contactResult.contact, opportunity, submission };
    } catch (error) {
      event.status = 'failed';
      event.error = sanitizePlainText(error.message, 2000);
      event.processedAt = new Date();
      await event.save().catch(() => {});
      await this.recordFailure(integration, error, event._id);
      error.integrationFailureRecorded = true;
      throw error;
    }
  }

  static async recordFailure(integration, error, eventId = null) {
    const now = new Date();
    const safeError = sanitizePlainText(error?.message || String(error), 2000);
    const repeatedRecently =
      integration.lastError === safeError &&
      integration.lastErrorAt &&
      now.getTime() - new Date(integration.lastErrorAt).getTime() < 30 * 60 * 1000;
    integration.status = 'error';
    integration.lastError = safeError;
    integration.lastErrorAt = now;
    await integration.save().catch(() => {});
    await OperationalAlertService.create({
      companyId: integration.companyId,
      distributorId: integration.distributorId,
      severity: 'warning',
      type: 'integration_error',
      title: `Fallo de integracion: ${integration.name}`,
      message: safeError,
      relatedType: 'integration',
      relatedId: integration._id,
      metadata: { eventId, error: sanitizeError(error) }
    }).catch(() => {});
    const creator = await User.findById(integration.createdBy).select('role');
    if (creator?.role === 'DISTRIBUTOR' && integration.distributorId) {
      await OperationalAlertService.create({
        distributorId: integration.distributorId,
        severity: 'warning',
        type: 'integration_error',
        title: `Fallo en integracion administrada: ${integration.name}`,
        message: safeError,
        relatedType: 'integration',
        relatedId: integration._id,
        metadata: { companyId: integration.companyId, eventId }
      }).catch(() => {});
    }
    if (repeatedRecently) return;
    const configured = (integration.notifyUsers || []).map(String);
    const admins = await User.find({
      companyId: integration.companyId,
      role: 'ADMIN',
      status: 'active'
    }).select('_id');
    const userIds = [...new Set([...configured, ...admins.map((user) => String(user._id))])];
    await Promise.all(
      userIds.map((userId) =>
        NotificationService.create({
          companyId: integration.companyId,
          distributorId: integration.distributorId,
          userId,
          type: 'integration_failed',
          title: `Fallo de integracion: ${integration.name}`,
          body: safeError,
          relatedType: 'integration',
          relatedId: integration._id,
          metadata: { eventId }
        }).catch(() => {})
      )
    );
  }
}
