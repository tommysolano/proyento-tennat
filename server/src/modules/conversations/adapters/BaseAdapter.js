export class BaseAdapter {
  constructor({ channelConfig = null } = {}) {
    this.channelConfig = channelConfig;
  }

  async connect() {
    return { success: false, supported: false };
  }

  async disconnect() {
    return { success: false, supported: false };
  }

  async getStatus() {
    return {
      provider: this.channelConfig?.channel || 'unknown',
      status: this.channelConfig?.status || 'not_configured'
    };
  }

  async sendMessage() {
    return {
      success: false,
      status: 'failed',
      error: 'El adaptador de este canal todavia no implementa envios reales'
    };
  }

  verifyWebhook() {
    return { verified: false };
  }

  handleWebhook(payload, headers = {}) {
    return {
      inboundMessages: this.normalizeInboundMessage(payload),
      statusUpdates: this.normalizeStatusUpdate(payload),
      headers
    };
  }

  normalizeInboundMessage() {
    return [];
  }

  normalizeStatusUpdate() {
    return [];
  }

  async downloadMedia() {
    throw Object.assign(new Error('Este proveedor no implementa descarga de archivos'), {
      retryable: false
    });
  }

  async markAsRead() {
    return false;
  }

  async getDiagnostics() {
    return this.getStatus();
  }
}
