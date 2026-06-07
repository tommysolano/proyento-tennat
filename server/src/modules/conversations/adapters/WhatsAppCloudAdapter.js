import { BaseAdapter } from './BaseAdapter.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  extensionForMime,
  mediaMaxBytes,
  validateMedia
} from '../../storage/mediaValidation.js';

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
    providerMediaId: value.id || '',
    mimeType: value.mime_type || '',
    filename: value.filename || '',
    caption: value.caption || '',
    status: value.id ? 'pending' : 'unavailable'
  };
}

function retryableProviderError(status, providerError = {}) {
  const code = Number(providerError.code || 0);
  return (
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    [1, 2, 4, 17, 32, 613, 130429, 131000, 131016].includes(code)
  );
}

async function readResponseWithLimit(response, maxBytes) {
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw Object.assign(new Error('La descarga supera el limite configurado'), {
        retryable: false,
        code: 'MEDIA_TOO_LARGE'
      });
    }
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw Object.assign(new Error('La descarga supera el limite configurado'), {
        retryable: false,
        code: 'MEDIA_TOO_LARGE'
      });
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

function publicMediaBody(type, media) {
  const supported = ['image', 'audio', 'video', 'document'];
  if (!supported.includes(type)) return null;
  let publicUrl = '';
  if (media?.url) {
    try {
      const parsed = new URL(media.url);
      const hostname = parsed.hostname.toLowerCase();
      const privateHost =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
      if (['http:', 'https:'].includes(parsed.protocol) && !privateHost) {
        publicUrl = parsed.toString();
      }
    } catch {
      publicUrl = '';
    }
  }
  const source = media?.providerMediaId
    ? { id: media.providerMediaId }
    : publicUrl
      ? { link: publicUrl }
      : null;
  if (!source) return null;
  if (media.caption && ['image', 'video', 'document'].includes(type)) {
    source.caption = media.caption;
  }
  if (media.filename && type === 'document') source.filename = media.filename;
  return { type, [type]: source };
}

export class WhatsAppCloudAdapter extends BaseAdapter {
  verifyWebhook(query) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    return {
      verified:
        mode === 'subscribe' &&
        Boolean(token) &&
        token === this.channelConfig?.getDecryptedVerifyToken(),
      challenge
    };
  }

  verifySignature(rawBody, signatureHeader) {
    const appSecret = this.channelConfig?.getDecryptedAppSecret();
    if (!appSecret) return { configured: false, valid: false };
    const supplied = String(signatureHeader || '');
    if (!supplied.startsWith('sha256=')) return { configured: true, valid: false };
    const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    return {
      configured: true,
      valid:
        suppliedBuffer.length === expectedBuffer.length &&
        timingSafeEqual(suppliedBuffer, expectedBuffer)
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
              displayPhoneNumber: value.metadata?.display_phone_number || '',
              sandboxMode: Boolean(this.channelConfig?.settings?.sandboxMode)
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

  async sendMessage({ contact, text, type = 'text', template, media = {} }) {
    const config = this.channelConfig;
    const credentials = config?.getDecryptedCredentials?.() || {};
    const accessToken = credentials.accessToken;
    const phoneNumberId = config?.phoneNumberId || credentials.phoneNumberId;
    const apiVersion =
      config?.settings?.apiVersion ||
      process.env.WHATSAPP_GRAPH_API_VERSION ||
      process.env.WHATSAPP_GRAPH_VERSION;
    const baseUrl =
      process.env.WHATSAPP_GRAPH_API_BASE_URL || 'https://graph.facebook.com';
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

    const mediaBody = publicMediaBody(type, media);
    if (type !== 'text' && !template && !mediaBody) {
      return {
        success: false,
        status: 'failed',
        retryable: false,
        error: 'WhatsApp media requiere una URL publica o providerMediaId'
      };
    }

    const body = template
      ? {
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'template',
          template
        }
      : mediaBody
        ? {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipient,
            ...mediaBody
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
        `${baseUrl.replace(/\/$/, '')}/${apiVersion}/${phoneNumberId}/messages`,
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
        const providerError = result.error || {};
        return {
          success: false,
          status: 'failed',
          retryable: retryableProviderError(response.status, providerError),
          error: providerError.message || `WhatsApp respondio HTTP ${response.status}`,
          providerPayload: {
            error: {
              code: providerError.code,
              type: providerError.type,
              subcode: providerError.error_subcode,
              status: response.status
            }
          }
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
        retryable: true,
        error: `No se pudo conectar con WhatsApp: ${error.message}`
      };
    }
  }

  async getMediaMetadata(providerMediaId) {
    const config = this.channelConfig;
    const accessToken = config?.getDecryptedCredentials?.().accessToken;
    const apiVersion =
      config?.settings?.apiVersion ||
      process.env.WHATSAPP_GRAPH_API_VERSION ||
      process.env.WHATSAPP_GRAPH_VERSION;
    const baseUrl =
      process.env.WHATSAPP_GRAPH_API_BASE_URL || 'https://graph.facebook.com';
    if (!accessToken || !apiVersion || !providerMediaId) {
      throw Object.assign(new Error('No hay credenciales suficientes para consultar media'), {
        retryable: false
      });
    }
    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/${apiVersion}/${providerMediaId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(
        new Error(result.error?.message || `WhatsApp media respondio HTTP ${response.status}`),
        { retryable: retryableProviderError(response.status, result.error) }
      );
    }
    return {
      mimeType: result.mime_type || '',
      size: Number(result.file_size || 0),
      providerMediaId: result.id || providerMediaId,
      providerUrlAvailable: Boolean(result.url),
      downloadUrl: result.url || ''
    };
  }

  async downloadMedia(providerMediaId, filename = '') {
    const credentials = this.channelConfig?.getDecryptedCredentials?.() || {};
    const accessToken = credentials.accessToken;
    if (!accessToken) {
      throw Object.assign(new Error('Falta accessToken para descargar media de WhatsApp'), {
        retryable: false,
        code: 'WHATSAPP_CREDENTIALS_MISSING'
      });
    }
    const metadata = await this.getMediaMetadata(providerMediaId);
    if (!metadata.downloadUrl) {
      throw Object.assign(new Error('WhatsApp no devolvio URL de descarga de media'), {
        retryable: true
      });
    }
    if (metadata.size > mediaMaxBytes()) {
      throw Object.assign(new Error('La media de WhatsApp supera el limite configurado'), {
        retryable: false,
        code: 'MEDIA_TOO_LARGE'
      });
    }
    const response = await fetch(metadata.downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      throw Object.assign(
        new Error(`No se pudo descargar media de WhatsApp: HTTP ${response.status}`),
        { retryable: retryableProviderError(response.status) }
      );
    }
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > mediaMaxBytes()) {
      throw Object.assign(new Error('La descarga supera el limite configurado'), {
        retryable: false,
        code: 'MEDIA_TOO_LARGE'
      });
    }
    const buffer = await readResponseWithLimit(response, mediaMaxBytes());
    const mimeType =
      metadata.mimeType ||
      String(response.headers.get('content-type') || '').split(';')[0].trim();
    const resolvedFilename =
      filename ||
      `${providerMediaId}${extensionForMime(mimeType)}`;
    const validation = validateMedia({
      filename: resolvedFilename,
      mimeType,
      size: buffer.length
    });
    return {
      buffer,
      providerMediaId: metadata.providerMediaId,
      ...validation
    };
  }

  async testConnection() {
    const config = this.channelConfig;
    const credentials = config?.getDecryptedCredentials?.() || {};
    const accessToken = credentials.accessToken;
    const phoneNumberId = config?.phoneNumberId;
    const apiVersion =
      config?.settings?.apiVersion ||
      process.env.WHATSAPP_GRAPH_API_VERSION ||
      process.env.WHATSAPP_GRAPH_VERSION;
    const baseUrl =
      process.env.WHATSAPP_GRAPH_API_BASE_URL || 'https://graph.facebook.com';
    if (!accessToken || !phoneNumberId || !apiVersion) {
      return {
        success: false,
        error: 'Faltan accessToken, phoneNumberId o version de Graph API'
      };
    }
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, '')}/${apiVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          success: false,
          error: result.error?.message || `Meta respondio HTTP ${response.status}`,
          code: result.error?.code || null
        };
      }
      return {
        success: true,
        account: {
          id: result.id || phoneNumberId,
          displayPhoneNumber: result.display_phone_number || '',
          verifiedName: result.verified_name || ''
        }
      };
    } catch (error) {
      return { success: false, error: `No se pudo conectar con Meta: ${error.message}` };
    }
  }
}
