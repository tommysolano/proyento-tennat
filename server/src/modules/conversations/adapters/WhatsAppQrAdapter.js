import { BaseAdapter } from './BaseAdapter.js';
import { WhatsAppQrSessionManager } from '../WhatsAppQrSessionManager.js';

export class WhatsAppQrAdapter extends BaseAdapter {
  async connect(options = {}) {
    return WhatsAppQrSessionManager.connect(options.sessionId);
  }

  async disconnect(options = {}) {
    return WhatsAppQrSessionManager.disconnect(options.sessionId, options.actorId);
  }

  async getStatus(options = {}) {
    return WhatsAppQrSessionManager.diagnostics(options.sessionId);
  }

  async getDiagnostics(options = {}) {
    return WhatsAppQrSessionManager.diagnostics(options.sessionId);
  }

  async sendMessage(payload) {
    if (payload.template) {
      return {
        success: false,
        status: 'failed',
        retryable: false,
        code: 'WHATSAPP_QR_TEMPLATES_UNSUPPORTED',
        error: 'WhatsApp QR no admite plantillas de WhatsApp Cloud'
      };
    }
    return WhatsAppQrSessionManager.sendMessage({
      channelConfig: this.channelConfig,
      ...payload
    });
  }

  async markAsRead(payload = {}) {
    return WhatsAppQrSessionManager.markAsRead({
      channelConfigId: this.channelConfig?._id,
      ...payload
    });
  }
}
