const OUTBOUND_TYPES = new Set([
  'text',
  'image',
  'audio',
  'video',
  'document',
  'location',
  'template'
]);

const truthyDndValues = new Set([true, 'true', 'active', 'enabled', 'on']);

function badRequest(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function mediaConfigured(media = {}) {
  return Boolean(
    media.url ||
    media.storageKey ||
    media.providerMediaId ||
    media.externalMediaId
  );
}

export function contactDndStatus(contact) {
  const metadata = contact?.metadata || {};
  const candidates = [
    contact?.communicationPreferences?.globalDnd,
    metadata.doNotDisturb,
    metadata.dnd,
    metadata.optOut,
    metadata.preferences?.doNotDisturb,
    metadata.communicationPreferences?.doNotDisturb
  ];
  const configured = candidates.some((value) => value !== undefined && value !== null);
  const active = candidates.some((value) =>
    truthyDndValues.has(typeof value === 'string' ? value.toLowerCase() : value)
  );
  return { configured, active };
}

export function assertOutboundAllowed({
  conversation,
  contact,
  text = '',
  type = 'text',
  template = null,
  media = {}
}) {
  if (['resolved', 'closed', 'archived'].includes(conversation?.status)) {
    throw badRequest('Reabre la conversacion antes de enviar mensajes', 409);
  }
  if (!OUTBOUND_TYPES.has(type)) {
    throw badRequest('type de mensaje invalido');
  }
  if (type === 'text' && !String(text).trim() && !template) {
    throw badRequest('El mensaje no puede estar vacio');
  }
  if (!['text', 'template'].includes(type) && !mediaConfigured(media)) {
    throw badRequest('El mensaje multimedia requiere un archivo o URL');
  }
  if (type === 'template' && !template) {
    throw badRequest('La plantilla del proveedor es requerida');
  }
}
