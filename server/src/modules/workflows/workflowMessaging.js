import { Contact } from '../../models/Contact.js';
import { Conversation } from '../../models/Conversation.js';
import { ConversationService } from '../conversations/ConversationService.js';
import {
  getDefaultAccount,
  getDefaultCloudAccount
} from '../communications/accountGateway.js';
import { canonicalChannel } from '../conversations/adapters/index.js';

const WHATSAPP_CHANNELS = ['whatsapp_cloud', 'whatsapp_qr'];

/**
 * Resuelve el contactId "objetivo" de una accion de workflow a partir del
 * contexto del evento: un contactId explicito de la config, el propio evento si
 * es de contacto, o el contactId que traiga el payload/entidad (conversacion,
 * oportunidad, cita…). Devuelve null si no hay ninguno.
 */
export function resolveContactId(context, explicit = null) {
  if (explicit) return explicit;
  if (context.event?.entityType === 'contact') return context.event.entityId;
  return (
    context.payload?.contactId ||
    context.entity?.contactId ||
    (context.event?.entityType === 'contact' ? context.entity?._id : null) ||
    null
  );
}

/**
 * Resuelve (o crea) la conversacion de WhatsApp del contacto del contexto para
 * que una accion de workflow pueda enviarle un mensaje. Reutiliza el mismo
 * `findOrCreateConversation` que el resto del sistema (scoped por companyId).
 *
 * `preferCloud`: para plantillas HSM (que solo soporta Cloud API). Si la
 * conversacion existente esta anclada a un numero QR, la re-ancla al numero
 * Cloud por defecto para que el envio de la plantilla no falle en el adapter QR.
 *
 * Lanza errores NO reintentables (status 4xx) con mensajes accionables cuando
 * falta el contacto, el telefono o un numero de WhatsApp configurado.
 */
export async function resolveWorkflowConversation(context, { contactId = null, preferCloud = false } = {}) {
  const companyId = context.companyId;
  const cid = resolveContactId(context, contactId);
  if (!cid) {
    throw Object.assign(
      new Error('El evento no tiene un contacto al que enviar el mensaje'),
      { status: 400, retryable: false }
    );
  }
  const contact = await Contact.findOne({ _id: cid, companyId, archivedAt: null });
  if (!contact) {
    throw Object.assign(new Error('Contacto no encontrado en la empresa'), {
      status: 404,
      retryable: false
    });
  }
  if (!String(contact.phone || '').trim()) {
    throw Object.assign(
      new Error(`El contacto "${contact.name}" no tiene telefono para enviar WhatsApp`),
      { status: 400, retryable: false }
    );
  }

  const account = preferCloud
    ? await getDefaultCloudAccount(companyId)
    : await getDefaultAccount(companyId);
  if (!account) {
    throw Object.assign(
      new Error(
        preferCloud
          ? 'No hay un numero de WhatsApp Cloud API configurado para enviar plantillas'
          : 'No hay un numero de WhatsApp por defecto configurado'
      ),
      { status: 409, retryable: false }
    );
  }

  let conversation = await Conversation.findOne({
    companyId,
    contactId: contact._id,
    channel: { $in: WHATSAPP_CHANNELS },
    status: { $ne: 'archived' },
    archivedAt: null
  }).sort({ lastMessageAt: -1 });

  if (!conversation) {
    ({ conversation } = await ConversationService.findOrCreateConversation({
      companyId,
      distributorId: context.distributorId,
      contactId: contact._id,
      channel: account.channel,
      channelConfigId: account._id,
      createdBy: context.actor._id
    }));
  } else if (
    preferCloud &&
    canonicalChannel(conversation.channel) !== 'whatsapp_cloud'
  ) {
    // La conversacion vive en QR pero la plantilla necesita Cloud: re-anclar al
    // numero Cloud por defecto (processOutboundMessage respeta channelConfigId).
    conversation.channel = 'whatsapp_cloud';
    conversation.channelConfigId = account._id;
    await conversation.save();
  }

  return { contact, conversation, account };
}
