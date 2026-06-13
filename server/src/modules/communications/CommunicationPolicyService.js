import mongoose from 'mongoose';
import { hasUserPermission } from '../../core/permissions/permissions.js';
import { ActivityLog } from '../../models/ActivityLog.js';
import { ChannelConfig } from '../../models/ChannelConfig.js';
import {
  CONSENT_CHANNELS,
  CONSENT_SOURCES,
  CONSENT_STATUSES,
  ContactConsent
} from '../../models/ContactConsent.js';
import {
  CommunicationSettings,
  DEFAULT_GLOBAL_OPT_OUT_KEYWORDS,
  DEFAULT_OPT_OUT_KEYWORDS
} from '../../models/CommunicationSettings.js';
import { Contact } from '../../models/Contact.js';
import { Company } from '../../models/Company.js';
import {
  SUPPRESSION_TYPES,
  SuppressionEntry
} from '../../models/SuppressionEntry.js';
import { sanitize } from '../../utils/sanitize.js';
import { cleanString } from '../../utils/validation.js';
import {
  detectOptOutKeyword,
  evaluateCommunicationRules,
  MESSAGE_CATEGORIES,
  normalizeCommunicationChannel
} from './communicationPolicyRules.js';

function badRequest(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function dateOrNull(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${field} debe ser una fecha valida`);
  return date;
}

function controlledObject(value, field, maxBytes = 16 * 1024) {
  const controlled = sanitize(value && typeof value === 'object' ? value : {});
  if (Buffer.byteLength(JSON.stringify(controlled), 'utf8') > maxBytes) {
    throw badRequest(`${field} excede el tamano permitido`);
  }
  return controlled;
}

export function normalizeSuppressionValue(type, value) {
  const clean = cleanString(value);
  if (type === 'email') return clean.toLowerCase();
  if (type === 'phone') {
    const digits = clean.replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }
  return clean;
}

function channelPreferenceBlocked(contact, channel) {
  const preferences = contact.communicationPreferences || {};
  const key = {
    whatsapp: 'doNotWhatsApp',
    sms: 'doNotSms',
    email: 'doNotEmail',
    call: 'doNotCall'
  }[channel];
  return Boolean(key && preferences[key]);
}

function permanentDeliveryFailure(contact, channel) {
  const delivery = contact.metadata?.delivery?.[channel] ||
    contact.metadata?.deliveryStatus?.[channel] ||
    {};
  return Boolean(
    delivery.permanentFailure ||
    delivery.invalid ||
    delivery.bounced ||
    ['blocked', 'invalid', 'bounced', 'permanent_failure'].includes(delivery.status)
  );
}

function legacyGlobalDnd(contact) {
  const metadata = contact.metadata || {};
  return [
    metadata.doNotDisturb,
    metadata.dnd,
    metadata.optOut,
    metadata.preferences?.doNotDisturb,
    metadata.communicationPreferences?.doNotDisturb
  ].some((value) => [true, 'true', 'active', 'enabled', 'on'].includes(
    typeof value === 'string' ? value.toLowerCase() : value
  ));
}

async function recordActivity({
  companyId,
  distributorId,
  userId,
  type,
  summary,
  metadata
}) {
  if (!userId) return null;
  return ActivityLog.create({
    companyId,
    distributorId: distributorId || null,
    userId,
    type,
    summary,
    metadata: sanitize(metadata || {})
  });
}

export class CommunicationPolicyService {
  static normalizeChannel = normalizeCommunicationChannel;

  static async settings(companyId, distributorId = null) {
    const company = await Company.findById(companyId).select('settings.timezone');
    return CommunicationSettings.findOneAndUpdate(
      { companyId },
      {
        $setOnInsert: {
          companyId,
          distributorId: distributorId || null,
          timezone: company?.settings?.timezone || 'UTC',
          optOutKeywords: DEFAULT_OPT_OUT_KEYWORDS,
          globalOptOutKeywords: DEFAULT_GLOBAL_OPT_OUT_KEYWORDS
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  static async recordConsent({
    companyId,
    distributorId = null,
    contactId,
    channel,
    status,
    source,
    legalBasis = '',
    consentText = '',
    consentVersion = '',
    sourceReference = '',
    reason = '',
    expiresAt = null,
    recordedBy = null,
    metadata = {},
    evidence = {}
  }) {
    if (!mongoose.isValidObjectId(contactId)) throw badRequest('contactId invalido');
    const normalizedChannel = normalizeCommunicationChannel(channel);
    if (!CONSENT_CHANNELS.includes(normalizedChannel)) throw badRequest('channel invalido');
    if (!CONSENT_STATUSES.includes(status)) throw badRequest('status de consentimiento invalido');
    if (!CONSENT_SOURCES.includes(source)) throw badRequest('source de consentimiento invalido');
    if (source === 'integration' && !cleanString(sourceReference)) {
      throw badRequest('Una integracion debe indicar sourceReference');
    }
    const contact = await Contact.findOne({
      _id: contactId,
      companyId,
      archivedAt: null
    }).select('_id companyId distributorId');
    if (!contact) throw badRequest('Contacto no encontrado', 404);

    const now = new Date();
    const history = {
      status,
      source,
      legalBasis: cleanString(legalBasis),
      consentText: cleanString(consentText),
      consentVersion: cleanString(consentVersion),
      sourceReference: cleanString(sourceReference),
      reason: cleanString(reason),
      recordedBy: recordedBy || null,
      evidence: controlledObject(evidence, 'evidence'),
      recordedAt: now
    };
    const consent = await ContactConsent.findOneAndUpdate(
      { companyId, contactId, channel: normalizedChannel },
      {
        $set: {
          distributorId: distributorId || contact.distributorId || null,
          status,
          source,
          legalBasis: history.legalBasis,
          consentText: history.consentText,
          consentVersion: history.consentVersion,
          sourceReference: history.sourceReference,
          consentedAt: status === 'opted_in' ? now : null,
          revokedAt: ['opted_out', 'blocked'].includes(status) ? now : null,
          expiresAt: dateOrNull(expiresAt, 'expiresAt'),
          recordedBy: recordedBy || null,
          metadata: controlledObject(metadata, 'metadata'),
          evidence: history.evidence
        },
        $push: { history }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await recordActivity({
      companyId,
      distributorId: distributorId || contact.distributorId,
      userId: recordedBy,
      type: ['opted_out', 'blocked'].includes(status)
        ? 'consent_revoked'
        : 'consent_updated',
      summary: `Consentimiento ${normalizedChannel}: ${status}`,
      metadata: {
        contactId,
        channel: normalizedChannel,
        status,
        source,
        consentId: consent._id
      }
    });
    return consent;
  }

  static async setGlobalDnd({
    companyId,
    contactId,
    active,
    reason = '',
    recordedBy = null,
    source = 'manual'
  }) {
    const contact = await Contact.findOne({
      _id: contactId,
      companyId,
      archivedAt: null
    });
    if (!contact) throw badRequest('Contacto no encontrado', 404);
    contact.communicationPreferences = {
      ...(contact.communicationPreferences?.toObject?.() || contact.communicationPreferences || {}),
      globalDnd: Boolean(active),
      globalDndReason: cleanString(reason),
      globalDndUpdatedAt: new Date(),
      globalDndUpdatedBy: recordedBy || null
    };
    contact.metadata = {
      ...(contact.metadata || {}),
      doNotDisturb: Boolean(active),
      dnd: Boolean(active),
      optOut: Boolean(active),
      preferences: {
        ...(contact.metadata?.preferences || {}),
        doNotDisturb: Boolean(active)
      },
      communicationPreferences: {
        ...(contact.metadata?.communicationPreferences || {}),
        doNotDisturb: Boolean(active)
      }
    };
    contact.updatedBy = recordedBy || contact.updatedBy;
    await contact.save();
    await recordActivity({
      companyId,
      distributorId: contact.distributorId,
      userId: recordedBy,
      type: 'global_dnd_updated',
      summary: `No molestar global ${active ? 'activado' : 'retirado'}`,
      metadata: { contactId, active: Boolean(active), reason: cleanString(reason), source }
    });
    return contact;
  }

  static async updatePreferences({ companyId, contactId, preferences, recordedBy = null }) {
    const contact = await Contact.findOne({
      _id: contactId,
      companyId,
      archivedAt: null
    });
    if (!contact) throw badRequest('Contacto no encontrado', 404);
    const current = contact.communicationPreferences?.toObject?.() ||
      contact.communicationPreferences || {};
    const next = { ...current };
    for (const field of [
      'preferredChannel',
      'language',
      'preferredStartTime',
      'preferredEndTime'
    ]) {
      if (field in preferences) next[field] = cleanString(preferences[field]);
    }
    for (const field of ['doNotCall', 'doNotWhatsApp', 'doNotSms', 'doNotEmail']) {
      if (field in preferences) next[field] = Boolean(preferences[field]);
    }
    if ('allowedChannels' in preferences) {
      if (!Array.isArray(preferences.allowedChannels)) {
        throw badRequest('allowedChannels debe ser un arreglo');
      }
      next.allowedChannels = [...new Set(
        preferences.allowedChannels.map(normalizeCommunicationChannel)
      )].filter((channel) => CONSENT_CHANNELS.includes(channel));
    }
    contact.communicationPreferences = next;
    contact.updatedBy = recordedBy || contact.updatedBy;
    await contact.save();
    await recordActivity({
      companyId,
      distributorId: contact.distributorId,
      userId: recordedBy,
      type: 'communication_preferences_updated',
      summary: 'Preferencias de comunicacion actualizadas',
      metadata: { contactId, fields: Object.keys(preferences) }
    });
    return contact;
  }

  static async addSuppression({
    companyId,
    distributorId = null,
    type,
    value,
    channel = 'all',
    reason,
    source = 'manual',
    expiresAt = null,
    userId = null,
    metadata = {}
  }) {
    if (!SUPPRESSION_TYPES.includes(type)) throw badRequest('type de supresion invalido');
    const normalizedValue = normalizeSuppressionValue(type, value);
    if (!normalizedValue) throw badRequest('value de supresion es requerido');
    const normalizedChannel = channel === 'all' ? 'all' : normalizeCommunicationChannel(channel);
    const cleanReason = cleanString(reason);
    if (!cleanReason) throw badRequest('reason es requerido');
    const entry = await SuppressionEntry.findOneAndUpdate(
      { companyId, type, normalizedValue, channel: normalizedChannel },
      {
        $set: {
          distributorId: distributorId || null,
          displayValue: cleanString(value),
          reason: cleanReason,
          source: cleanString(source) || 'manual',
          status: 'active',
          expiresAt: dateOrNull(expiresAt, 'expiresAt'),
          addedBy: userId || null,
          revokedBy: null,
          revokedAt: null,
          metadata: controlledObject(metadata, 'metadata')
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await recordActivity({
      companyId,
      distributorId,
      userId,
      type: 'suppression_created',
      summary: `Supresion agregada para ${type}`,
      metadata: { suppressionId: entry._id, type, channel: normalizedChannel }
    });
    return entry;
  }

  static async revokeSuppression({ companyId, suppressionId, userId, reason = '' }) {
    const entry = await SuppressionEntry.findOne({
      _id: suppressionId,
      companyId
    });
    if (!entry) throw badRequest('Supresion no encontrada', 404);
    entry.status = 'revoked';
    entry.revokedBy = userId;
    entry.revokedAt = new Date();
    entry.metadata = { ...(entry.metadata || {}), revokeReason: cleanString(reason) };
    await entry.save();
    await recordActivity({
      companyId,
      distributorId: entry.distributorId,
      userId,
      type: 'suppression_revoked',
      summary: 'Supresion retirada',
      metadata: { suppressionId: entry._id, reason: cleanString(reason) }
    });
    return entry;
  }

  static async evaluate({
    companyId,
    contactId,
    channel,
    category = 'commercial',
    conversation = null,
    channelConfigId = null,
    user = null,
    adminOverride = false,
    overrideReason = '',
    now = new Date()
  }) {
    if (!mongoose.isValidObjectId(contactId)) throw badRequest('contactId invalido');
    if (!MESSAGE_CATEGORIES.includes(category)) throw badRequest('category de mensaje invalida');
    const evaluatedChannel = normalizeCommunicationChannel(channel);
    const [contact, consent, settings, channelConfig] = await Promise.all([
      Contact.findOne({ _id: contactId, companyId, archivedAt: null }),
      ContactConsent.findOne({ companyId, contactId, channel: evaluatedChannel }),
      this.settings(companyId),
      channelConfigId
        ? ChannelConfig.findOne({ _id: channelConfigId, companyId })
        : null
    ]);
    if (!contact) throw badRequest('Contacto no encontrado', 404);

    const identifiers = [];
    if (contact.email) identifiers.push({
      type: 'email',
      normalizedValue: normalizeSuppressionValue('email', contact.email)
    });
    if (contact.phone) identifiers.push({
      type: 'phone',
      normalizedValue: normalizeSuppressionValue('phone', contact.phone)
    });
    const suppression = identifiers.length
      ? await SuppressionEntry.findOne({
          companyId,
          status: 'active',
          $and: [
            { $or: identifiers },
            { $or: [{ channel: 'all' }, { channel: evaluatedChannel }] },
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }
          ]
        })
      : null;
    const preferences = contact.communicationPreferences || {};
    const globalDnd = Boolean(preferences.globalDnd) || legacyGlobalDnd(contact);
    const recentInbound = Boolean(
      conversation?.lastInboundAt &&
      now.getTime() - new Date(conversation.lastInboundAt).getTime() <= 24 * 60 * 60 * 1000
    );
    const integrationAvailable =
      !channelConfigId ||
      Boolean(channelConfig && ['connected', 'active', 'sandbox'].includes(channelConfig.status));
    const result = evaluateCommunicationRules({
      channel: evaluatedChannel,
      category,
      consentStatus:
        consent?.expiresAt && new Date(consent.expiresAt) <= now
          ? 'unknown'
          : consent?.status || 'unknown',
      globalDnd,
      channelBlocked: channelPreferenceBlocked(contact, evaluatedChannel),
      permanentDeliveryFailure: permanentDeliveryFailure(contact, evaluatedChannel),
      suppressed: Boolean(suppression),
      integrationAvailable,
      recentInbound,
      quietHours: {
        ...(settings.quietHours?.toObject?.() || settings.quietHours || {}),
        timezone: settings.timezone || 'UTC'
      },
      now
    });
    const permission = category === 'commercial'
      ? 'messages:send_commercial'
      : ['transactional', 'operational'].includes(category)
        ? 'messages:send_transactional'
        : null;
    if (permission && user && !hasUserPermission(user, permission)) {
      return {
        ...result,
        allowed: false,
        reasonCode: 'SEND_PERMISSION_REQUIRED',
        reasonMessage: 'No tienes permiso para enviar esta categoria de mensaje.',
        appliedRules: [...result.appliedRules, permission],
        evaluatedChannel,
        evaluatedAt: now
      };
    }
    if (!result.allowed && adminOverride) {
      if (!user || !hasUserPermission(user, 'consent:override')) {
        throw badRequest('No tienes permiso para aplicar una excepcion', 403);
      }
      if (!cleanString(overrideReason)) throw badRequest('overrideReason es requerido');
      if ([
        'SUPPRESSED',
        'CONSENT_BLOCKED',
        'INTEGRATION_UNAVAILABLE',
        'PERMANENT_DELIVERY_FAILURE'
      ].includes(result.reasonCode)) {
        throw badRequest('Esta regla no admite excepcion administrativa', 409);
      }
      await recordActivity({
        companyId,
        distributorId: contact.distributorId,
        userId: user._id,
        type: 'consent_override_applied',
        summary: 'Excepcion administrativa de comunicacion aplicada',
        metadata: {
          contactId,
          channel: evaluatedChannel,
          category,
          originalReasonCode: result.reasonCode,
          reason: cleanString(overrideReason)
        }
      });
      return {
        ...result,
        allowed: true,
        reasonCode: 'ADMIN_OVERRIDE',
        reasonMessage: 'Envio autorizado mediante excepcion administrativa auditada.',
        appliedRules: [...result.appliedRules, 'admin_override'],
        evaluatedChannel,
        evaluatedAt: now
      };
    }
    return {
      ...result,
      consentStatus:
        consent?.expiresAt && new Date(consent.expiresAt) <= now
          ? 'unknown'
          : consent?.status || 'unknown',
      globalDnd,
      suppressionId: suppression?._id || null,
      evaluatedChannel,
      evaluatedAt: now
    };
  }

  static async contactStatus({ companyId, contactId, channel = null, conversation = null }) {
    const contact = await Contact.findOne({
      _id: contactId,
      companyId,
      archivedAt: null
    }).select('communicationPreferences metadata updatedAt');
    if (!contact) throw badRequest('Contacto no encontrado', 404);
    const consents = await ContactConsent.find({ companyId, contactId })
      .select('-evidence -metadata')
      .sort({ channel: 1 });
    const now = new Date();
    const byChannel = Object.fromEntries(CONSENT_CHANNELS.map((item) => {
      const consent = consents.find((candidate) => candidate.channel === item);
      if (!consent) {
        return [item, {
          channel: item,
          status: 'unknown',
          source: 'other',
          updatedAt: null,
          history: []
        }];
      }
      const value = consent.toObject();
      if (value.expiresAt && new Date(value.expiresAt) <= now) {
        value.status = 'unknown';
        value.expired = true;
      }
      return [item, value];
    }));
    let policy = null;
    if (channel) {
      policy = await this.evaluate({
        companyId,
        contactId,
        channel,
        category: 'reply',
        conversation
      });
    }
    return {
      globalDnd: Boolean(contact.communicationPreferences?.globalDnd) || legacyGlobalDnd(contact),
      globalDndReason: contact.communicationPreferences?.globalDndReason || '',
      globalDndUpdatedAt: contact.communicationPreferences?.globalDndUpdatedAt || null,
      preferences: contact.communicationPreferences || {},
      consents: byChannel,
      policy
    };
  }

  static async processInboundOptOut({
    companyId,
    distributorId = null,
    contactId,
    channel,
    text,
    messageId = null,
    recordedBy = null
  }) {
    const settings = await this.settings(companyId, distributorId);
    const match = detectOptOutKeyword(
      text,
      settings.optOutKeywords,
      settings.globalOptOutKeywords
    );
    if (!match) return null;
    const normalizedChannel = normalizeCommunicationChannel(channel);
    const consent = await this.recordConsent({
      companyId,
      distributorId,
      contactId,
      channel: normalizedChannel,
      status: 'opted_out',
      source: 'inbound_message',
      sourceReference: messageId ? String(messageId) : '',
      reason: `Palabra de baja: ${match.keyword}`,
      recordedBy,
      evidence: { messageId, keyword: match.keyword }
    });
    if (match.global) {
      await this.setGlobalDnd({
        companyId,
        contactId,
        active: true,
        reason: `Solicitud global: ${match.keyword}`,
        recordedBy,
        source: 'inbound_message'
      });
    }
    await recordActivity({
      companyId,
      distributorId,
      userId: recordedBy,
      type: 'opt_out_detected',
      summary: `Baja detectada en ${normalizedChannel}`,
      metadata: { contactId, messageId, keyword: match.keyword, global: match.global }
    });
    return { match, consent };
  }
}
