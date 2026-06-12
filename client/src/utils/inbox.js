export function mergeById(current = [], incoming = []) {
  const items = new Map(current.map((item) => [String(item._id), item]));
  for (const item of incoming || []) {
    if (item?._id) items.set(String(item._id), item);
  }
  return [...items.values()].sort(
    (left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0)
  );
}

export function templatesForConversation(templates = [], channel = '') {
  const canonical = channel === 'whatsapp' ? 'whatsapp_cloud' : channel;
  const available = templates.filter(
    (template) =>
      template.status === 'active' &&
      (template.channel === 'internal' || template.channel === canonical)
  );
  return {
    quickReplies: available.filter((template) => template.type === 'quick_reply'),
    providerTemplates: available.filter((template) =>
      ['whatsapp_template', 'email_template', 'sms_template'].includes(template.type)
    )
  };
}

export function validateMessageDraft({
  text = '',
  type = 'text',
  templateId = '',
  mediaUrl = '',
  fileSize = 0,
  conversationStatus = 'open',
  dndActive = false,
  channel = ''
}) {
  if (['resolved', 'closed', 'archived'].includes(conversationStatus)) {
    return 'Reabre la conversacion antes de enviar mensajes.';
  }
  if (channel !== 'internal' && dndActive) {
    return 'El contacto tiene No molestar activo.';
  }
  if (type === 'text' && !String(text).trim() && !templateId) {
    return 'Escribe un mensaje o selecciona una plantilla.';
  }
  if (type !== 'text' && !fileSize && !String(mediaUrl).trim()) {
    return 'Selecciona un archivo o indica una URL publica.';
  }
  return '';
}

export function contactDndStatus(contact) {
  const metadata = contact?.metadata || {};
  const candidates = [
    metadata.doNotDisturb,
    metadata.dnd,
    metadata.optOut,
    metadata.preferences?.doNotDisturb,
    metadata.communicationPreferences?.doNotDisturb
  ];
  const configured = candidates.some((value) => value !== undefined && value !== null);
  const active = candidates.some((value) =>
    [true, 'true', 'active', 'enabled', 'on'].includes(
      typeof value === 'string' ? value.toLowerCase() : value
    )
  );
  return { configured, active };
}

export function buildInboxAppointmentPayload({
  conversation,
  calendar,
  actorId,
  title,
  startAt,
  durationMinutes,
  assignedTo
}) {
  const start = new Date(startAt);
  const duration = Number(durationMinutes || calendar?.settings?.appointmentDurationMinutes || 30);
  const members = [
    calendar?.ownerUserId?._id || calendar?.ownerUserId,
    ...(calendar?.teamUserIds || []).map((item) => item?._id || item)
  ].filter(Boolean);
  const assignee = assignedTo || members.find((id) => String(id) === String(actorId)) || members[0];

  return {
    calendarId: calendar?._id,
    contactId: conversation?.contactId?._id || conversation?.contactId,
    assignedTo: assignee,
    title: String(title || '').trim(),
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + duration * 60000).toISOString(),
    source: 'inbox',
    metadata: { conversationId: conversation?._id }
  };
}
