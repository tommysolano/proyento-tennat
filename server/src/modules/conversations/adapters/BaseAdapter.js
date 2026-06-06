export class BaseAdapter {
  constructor({ channelConfig = null } = {}) {
    this.channelConfig = channelConfig;
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
}
