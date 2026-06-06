import { BaseAdapter } from './BaseAdapter.js';

function textFromMessage(message) {
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'button') return message.button?.text || '';
  if (message.type === 'interactive') {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      ''
    );
  }
  return message[message.type]?.caption || `[${message.type || 'mensaje'}]`;
}

function mediaFromMessage(message) {
  const supported = ['image', 'audio', 'video', 'document'];
  if (!supported.includes(message.type)) return {};
  const value = message[message.type] || {};
  return {
    externalMediaId: value.id || '',
    mimeType: value.mime_type || '',
    fileName: value.filename || '',
    caption: value.caption || ''
  };
}

export class WhatsAppCloudAdapter extends BaseAdapter {
  verifyWebhook(query) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    return {
      verified: mode === 'subscribe' && Boolean(token) && token === this.channelConfig?.verifyToken,
      challenge
    };
  }

  normalizeInboundMessage(payload) {
    const normalized = [];
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        const value = change?.value || {};
        const profileByWaId = new Map(
          (value.contacts || []).map((contact) => [
            contact.wa_id,
            contact.profile?.name || ''
          ])
        );
        for (const message of value.messages || []) {
          normalized.push({
            eventId: message.id,
            externalMessageId: message.id,
            externalConversationId: message.from,
            phone: message.from,
            contactName: profileByWaId.get(message.from) || '',
            channel: 'whatsapp_cloud',
            provider: 'whatsapp_cloud',
            type: ['text', 'image', 'audio', 'video', 'document', 'location'].includes(message.type)
              ? message.type
              : 'system',
            text: textFromMessage(message),
            media: mediaFromMessage(message),
            timestamp: message.timestamp
              ? new Date(Number(message.timestamp) * 1000)
              : new Date(),
            providerPayload: message,
            metadata: {
              phoneNumberId: value.metadata?.phone_number_id || '',
              displayPhoneNumber: value.metadata?.display_phone_number || ''
            }
          });
        }
      }
    }
    return normalized;
  }

  normalizeStatusUpdate(payload) {
    const normalized = [];
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        for (const status of change?.value?.statuses || []) {
          normalized.push({
            eventId: `${status.id}:${status.status}:${status.timestamp || ''}`,
            externalMessageId: status.id,
            status: status.status,
            timestamp: status.timestamp
              ? new Date(Number(status.timestamp) * 1000)
              : new Date(),
            providerPayload: status
          });
        }
      }
    }
    return normalized;
  }

  async sendMessage({ contact, text, template }) {
    const config = this.channelConfig;
    const accessToken = config?.credentials?.accessToken;
    const phoneNumberId = config?.phoneNumberId || config?.credentials?.phoneNumberId;
    const apiVersion = config?.settings?.apiVersion || process.env.WHATSAPP_GRAPH_VERSION;
    const recipient = String(contact?.phone || '').replace(/[^\d]/g, '');

    if (config?.status !== 'connected') {
      return { success: false, status: 'failed', error: 'El canal WhatsApp no esta conectado' };
    }
    if (!accessToken || !phoneNumberId || !recipient) {
      return {
        success: false,
        status: 'failed',
        error: 'Faltan accessToken, phoneNumberId o telefono del contacto'
      };
    }
    if (!apiVersion) {
      return {
        success: false,
        status: 'failed',
        error: 'WHATSAPP_GRAPH_VERSION o settings.apiVersion es requerido para envio real'
      };
    }

    const body = template
      ? {
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'template',
          template
        }
      : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'text',
          text: { preview_url: false, body: text }
        };

    try {
      const response = await fetch(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          success: false,
          status: 'failed',
          error: result.error?.message || `WhatsApp respondio HTTP ${response.status}`,
          providerPayload: { error: result.error || { status: response.status } }
        };
      }
      return {
        success: true,
        status: 'sent',
        externalMessageId: result.messages?.[0]?.id || '',
        providerPayload: {
          messagingProduct: result.messaging_product,
          contactWaId: result.contacts?.[0]?.wa_id,
          messageId: result.messages?.[0]?.id
        }
      };
    } catch (error) {
      return {
        success: false,
        status: 'failed',
        error: `No se pudo conectar con WhatsApp: ${error.message}`
      };
    }
  }
}
