function unwrapMessage(message = {}) {
  return (
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.documentWithCaptionMessage?.message ||
    message
  );
}

function textContent(content = {}) {
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    content.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  );
}

function mediaContent(content = {}) {
  const candidates = [
    ['image', content.imageMessage],
    ['audio', content.audioMessage],
    ['video', content.videoMessage],
    ['document', content.documentMessage]
  ];
  const [type, value] = candidates.find(([, candidate]) => candidate) || [];
  if (!type) return null;
  return {
    type,
    value,
    mimeType: value.mimetype || '',
    filename: value.fileName || '',
    caption: value.caption || ''
  };
}

function locationText(content = {}) {
  const location =
    content.locationMessage || content.liveLocationMessage || null;
  if (!location) return '';
  const latitude = location.degreesLatitude;
  const longitude = location.degreesLongitude;
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? `${latitude},${longitude}`
    : '';
}

export function phoneFromJid(jid = '') {
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

export function normalizeQrInboundMessage(message) {
  const remoteJid = String(message?.key?.remoteJid || '');
  const content = unwrapMessage(message?.message || {});
  const media = mediaContent(content);
  const location = locationText(content);
  const type = media?.type || (location ? 'location' : 'text');
  const timestamp = Number(message?.messageTimestamp || 0);
  return {
    eventId: message?.key?.id || '',
    externalMessageId: message?.key?.id || '',
    externalConversationId: remoteJid,
    phone: phoneFromJid(remoteJid),
    contactName: message?.pushName || '',
    channel: 'whatsapp_qr',
    provider: 'whatsapp_qr',
    type,
    text: textContent(content) || location || (media ? `[${media.type}]` : ''),
    timestamp: timestamp ? new Date(timestamp * 1000) : new Date(),
    providerPayload: {
      key: {
        id: message?.key?.id || '',
        remoteJid,
        participant: message?.key?.participant || ''
      },
      messageTimestamp: timestamp,
      pushName: message?.pushName || '',
      messageType: Object.keys(content)[0] || ''
    },
    metadata: { remoteJid },
    mediaDescriptor: media
  };
}
