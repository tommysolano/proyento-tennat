import { EmailAdapter, FacebookMessengerAdapter, InstagramDMAdapter, SmsAdapter } from './PlaceholderAdapters.js';
import { InternalAdapter } from './InternalAdapter.js';
import { WhatsAppCloudAdapter } from './WhatsAppCloudAdapter.js';

export function canonicalChannel(channel) {
  return {
    whatsapp: 'whatsapp_cloud',
    whatsapp_cloud_api: 'whatsapp_cloud',
    facebook: 'facebook_messenger',
    messenger: 'facebook_messenger',
    phone: 'internal'
  }[channel] || channel;
}

export function getChannelAdapter(channel, options = {}) {
  const adapters = {
    internal: InternalAdapter,
    whatsapp_cloud: WhatsAppCloudAdapter,
    facebook_messenger: FacebookMessengerAdapter,
    instagram_dm: InstagramDMAdapter,
    email: EmailAdapter,
    sms: SmsAdapter
  };
  const Adapter = adapters[canonicalChannel(channel)];
  if (!Adapter) throw Object.assign(new Error(`Canal no soportado: ${channel}`), { status: 400 });
  return new Adapter(options);
}
