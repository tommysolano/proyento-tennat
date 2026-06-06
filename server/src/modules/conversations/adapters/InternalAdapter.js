import { BaseAdapter } from './BaseAdapter.js';

export class InternalAdapter extends BaseAdapter {
  async sendMessage({ text }) {
    return {
      success: true,
      status: 'sent',
      externalMessageId: '',
      providerPayload: { transport: 'internal', accepted: true },
      text
    };
  }
}
