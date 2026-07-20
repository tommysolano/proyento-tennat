import { Broadcast } from '../../models/Broadcast.js';
import { Contact } from '../../models/Contact.js';
import { Conversation } from '../../models/Conversation.js';
import { MessageTemplate } from '../../models/MessageTemplate.js';
import { User } from '../../models/User.js';
import { ConversationService } from '../conversations/ConversationService.js';
import { buildOutboundTemplate } from '../communications/TemplateSyncService.js';
import { getDefaultCloudAccount, cloudAccountMissingFields } from '../communications/accountGateway.js';
import { JobService } from '../jobs/JobService.js';
import { checkUsageLimit } from '../../utils/usage.js';
import { logger } from '../../utils/logger.js';

const CLOUD_CHANNELS = ['whatsapp_cloud', 'whatsapp_cloud_api'];

function badRequest(message, status = 400) {
  return Object.assign(new Error(message), { status, retryable: false });
}

/** Construye el filtro de contactos destinatarios de la audiencia. null si vacia. */
function audienceFilter(companyId, audience = {}) {
  const or = [];
  if (Array.isArray(audience.contactIds) && audience.contactIds.length) {
    or.push({ _id: { $in: audience.contactIds } });
  }
  if (audience.tagId) or.push({ tags: audience.tagId });
  if (!or.length) return null;
  return {
    companyId,
    archivedAt: null,
    phone: { $nin: [null, ''] },
    $or: or
  };
}

export class BroadcastService {
  /** Cuenta cuantos contactos con telefono alcanzaria la audiencia. */
  static async previewRecipients(companyId, audience) {
    const filter = audienceFilter(companyId, audience);
    if (!filter) return 0;
    return Contact.countDocuments(filter);
  }

  /**
   * Lanza la difusion: valida plantilla/cuenta/audiencia, marca 'running' y encola
   * un job por destinatario con runAt escalonado segun throttlePerMinute.
   */
  static async launch(companyId, broadcastId, actor) {
    const broadcast = await Broadcast.findOne({ _id: broadcastId, companyId });
    if (!broadcast) throw badRequest('Difusion no encontrada', 404);
    if (broadcast.status === 'running') throw badRequest('La difusion ya esta en curso', 409);
    if (['completed', 'cancelled'].includes(broadcast.status)) {
      throw badRequest('La difusion ya finalizo; duplicala para reenviar', 409);
    }

    const template = await MessageTemplate.findOne({
      _id: broadcast.templateId,
      companyId,
      channel: 'whatsapp_cloud'
    });
    if (!template) throw badRequest('La plantilla de la difusion no existe');
    if (template.status !== 'approved') {
      throw badRequest(`La plantilla "${template.name}" no esta aprobada por Meta (estado: ${template.status})`);
    }

    const account = await getDefaultCloudAccount(companyId);
    const missing = cloudAccountMissingFields(account);
    if (!account || !CLOUD_CHANNELS.includes(account.channel) || missing.length) {
      throw badRequest(
        account
          ? `La cuenta de WhatsApp Cloud esta incompleta: falta ${missing.join(', ')}.`
          : 'No hay un numero de WhatsApp Cloud API configurado para difundir plantillas.'
      );
    }

    const filter = audienceFilter(companyId, broadcast.audience);
    if (!filter) throw badRequest('La difusion no tiene audiencia (contactos o etiqueta).');
    const recipients = await Contact.find(filter).select('_id').lean();
    if (!recipients.length) throw badRequest('La audiencia no tiene contactos con telefono.');

    // Falla temprano si el lote excede el limite del plan (cada envio ademas lo
    // re-verifica). No consume: solo comprueba disponibilidad.
    await checkUsageLimit({
      companyId,
      distributorId: broadcast.distributorId,
      metric: 'whatsapp_messages',
      quantity: recipients.length
    });

    broadcast.status = 'running';
    broadcast.startedAt = new Date();
    broadcast.completedAt = null;
    broadcast.error = '';
    broadcast.stats = { total: recipients.length, processed: 0, sent: 0, failed: 0, skipped: 0 };
    await broadcast.save();

    const perMinute = Math.min(Math.max(broadcast.throttlePerMinute || 60, 1), 600);
    for (let index = 0; index < recipients.length; index += 1) {
      const delayMs = Math.floor((index / perMinute) * 60000);
      // eslint-disable-next-line no-await-in-loop
      await JobService.enqueue({
        type: 'broadcast.recipient',
        payload: { broadcastId: broadcast._id, contactId: recipients[index]._id },
        runAt: new Date(Date.now() + delayMs),
        companyId,
        distributorId: broadcast.distributorId,
        metadata: { broadcastId: broadcast._id }
      });
    }
    logger.info('broadcast.launched', {
      broadcastId: broadcast._id,
      companyId,
      recipients: recipients.length,
      perMinute
    });
    return broadcast;
  }

  /** Cancela una difusion en curso: los jobs pendientes se auto-descartan. */
  static async cancel(companyId, broadcastId, actor) {
    const broadcast = await Broadcast.findOne({ _id: broadcastId, companyId });
    if (!broadcast) throw badRequest('Difusion no encontrada', 404);
    if (broadcast.status !== 'running') throw badRequest('Solo se puede cancelar una difusion en curso', 409);
    broadcast.status = 'cancelled';
    broadcast.cancelledBy = actor?._id || null;
    broadcast.completedAt = new Date();
    await broadcast.save();
    return broadcast;
  }

  /**
   * Procesa UN destinatario (job broadcast.recipient). Reutiliza el pipeline de
   * envio (consentimiento, ventana 24h, cola de proveedor). Actualiza las
   * estadisticas de forma atomica y cierra la difusion cuando termina el ultimo.
   */
  static async processRecipient(job) {
    const { broadcastId, contactId } = job.payload;
    const broadcast = await Broadcast.findById(broadcastId);
    if (!broadcast) return { skipped: true };
    if (broadcast.status !== 'running') {
      // Cancelada o ya finalizada: descartar sin contar.
      return { skipped: true, reason: broadcast.status };
    }

    const [contact, template, sender] = await Promise.all([
      Contact.findOne({ _id: contactId, companyId: broadcast.companyId, archivedAt: null }),
      MessageTemplate.findOne({ _id: broadcast.templateId, companyId: broadcast.companyId }),
      User.findOne({ _id: broadcast.createdBy, companyId: broadcast.companyId })
    ]);

    let outcome = 'skipped';
    if (contact && String(contact.phone || '').trim() && template && sender) {
      try {
        const account = await getDefaultCloudAccount(broadcast.companyId);
        const { conversation } = await ConversationService.findOrCreateConversation({
          companyId: broadcast.companyId,
          distributorId: broadcast.distributorId,
          contactId: contact._id,
          channel: 'whatsapp_cloud',
          channelConfigId: account?._id || null,
          createdBy: sender._id
        });
        const variables = { name: contact.name, ...(broadcast.variables || {}) };
        const providerTemplate = buildOutboundTemplate(template, variables);
        await ConversationService.createOutboundMessage({
          user: sender,
          conversation,
          text: template.content,
          type: 'text',
          template: providerTemplate,
          templateId: template._id,
          category: template.messageCategory === 'reply' ? 'commercial' : (template.messageCategory || 'commercial')
        });
        outcome = 'sent';
      } catch (error) {
        // Bloqueo de politica (opt-out/consentimiento/ventana) = skip; el resto = fallo.
        if (error?.policy || /opt|consent|supres|ventana|window|dnd/i.test(String(error?.code || ''))) {
          outcome = 'skipped';
        } else {
          outcome = 'failed';
          logger.warn('broadcast.recipient_failed', {
            broadcastId,
            contactId,
            error: error.message
          });
        }
      }
    }

    // Actualizacion atomica de contadores + cierre al completar el ultimo.
    const inc = { 'stats.processed': 1, [`stats.${outcome}`]: 1 };
    const updated = await Broadcast.findOneAndUpdate(
      { _id: broadcastId, status: 'running' },
      { $inc: inc },
      { new: true }
    );
    if (updated && updated.stats.processed >= updated.stats.total) {
      await Broadcast.updateOne(
        { _id: broadcastId, status: 'running' },
        { $set: { status: 'completed', completedAt: new Date() } }
      );
    }
    return { outcome };
  }
}
