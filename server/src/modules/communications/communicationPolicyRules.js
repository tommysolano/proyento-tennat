export const MESSAGE_CATEGORIES = [
  'commercial',
  'transactional',
  'operational',
  'reply'
];

const CHANNEL_ALIASES = {
  whatsapp: 'whatsapp',
  whatsapp_cloud: 'whatsapp',
  whatsapp_qr: 'whatsapp',
  email: 'email',
  sms: 'sms',
  phone: 'call',
  call: 'call',
  facebook: 'facebook_messenger',
  messenger: 'facebook_messenger',
  facebook_messenger: 'facebook_messenger',
  instagram_dm: 'instagram_dm'
};

export function normalizeCommunicationChannel(value) {
  return CHANNEL_ALIASES[String(value || '').trim().toLowerCase()] || 'other';
}

export function normalizeKeyword(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function detectOptOutKeyword(text, keywords = [], globalKeywords = []) {
  const normalized = normalizeKeyword(text);
  if (!normalized) return null;
  const global = globalKeywords.map(normalizeKeyword).find((item) => item === normalized);
  if (global) return { keyword: global, global: true };
  const channel = keywords.map(normalizeKeyword).find((item) => item === normalized);
  return channel ? { keyword: channel, global: false } : null;
}

function validTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return 'UTC';
  }
}

function localParts(date, timeZone) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: validTimeZone(timeZone),
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(values.weekday);
  return {
    day,
    minutes: Number(values.hour) * 60 + Number(values.minute)
  };
}

function timeMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function quietHoursState(settings = {}, date = new Date(), channel = 'other') {
  if (!settings.enabled) return { quiet: false, nextAllowedAt: null };
  if (settings.channels?.length && !settings.channels.includes(channel)) {
    return { quiet: false, nextAllowedAt: null };
  }
  const start = timeMinutes(settings.startTime);
  const end = timeMinutes(settings.endTime);
  if (start === null || end === null || start === end) {
    return { quiet: false, nextAllowedAt: null };
  }
  const applies = (candidate) => {
    const local = localParts(candidate, settings.timezone || 'UTC');
    const days = new Set(settings.days?.length ? settings.days : [0, 1, 2, 3, 4, 5, 6]);
    if (start < end) return days.has(local.day) && local.minutes >= start && local.minutes < end;
    const previousDay = (local.day + 6) % 7;
    return (
      (days.has(local.day) && local.minutes >= start) ||
      (days.has(previousDay) && local.minutes < end)
    );
  };
  if (!applies(date)) return { quiet: false, nextAllowedAt: null };
  let candidate = new Date(date.getTime() + 5 * 60 * 1000);
  for (let index = 0; index < 8 * 24 * 12; index += 1) {
    if (!applies(candidate)) {
      return { quiet: true, nextAllowedAt: candidate };
    }
    candidate = new Date(candidate.getTime() + 5 * 60 * 1000);
  }
  return { quiet: true, nextAllowedAt: new Date(date.getTime() + 24 * 60 * 60 * 1000) };
}

export function evaluateCommunicationRules({
  channel,
  category,
  consentStatus = 'unknown',
  globalDnd = false,
  channelBlocked = false,
  permanentDeliveryFailure = false,
  suppressed = false,
  integrationAvailable = true,
  recentInbound = false,
  quietHours = {},
  now = new Date()
}) {
  const appliedRules = [];
  const deny = (reasonCode, reasonMessage, extra = {}) => ({
    allowed: false,
    reasonCode,
    reasonMessage,
    appliedRules,
    ...extra
  });
  const allow = (extra = {}) => ({
    allowed: true,
    reasonCode: extra.scheduled ? 'QUIET_HOURS_SCHEDULED' : 'ALLOWED',
    reasonMessage: extra.scheduled
      ? 'El mensaje se programara al terminar el horario silencioso.'
      : 'El mensaje cumple las reglas de comunicacion.',
    appliedRules,
    ...extra
  });

  if (channel === 'other') appliedRules.push('channel_other');
  if (!integrationAvailable) {
    appliedRules.push('integration_unavailable');
    return deny('INTEGRATION_UNAVAILABLE', 'El canal no esta conectado o disponible.');
  }
  if (suppressed) {
    appliedRules.push('suppression_list');
    return deny('SUPPRESSED', 'El destinatario esta en la lista de supresion.');
  }
  if (permanentDeliveryFailure) {
    appliedRules.push('permanent_delivery_failure');
    return deny(
      'PERMANENT_DELIVERY_FAILURE',
      'El canal tiene un rebote, numero invalido o fallo permanente registrado.'
    );
  }
  if (consentStatus === 'blocked') {
    appliedRules.push('consent_blocked');
    return deny('CONSENT_BLOCKED', 'El canal esta bloqueado para este contacto.');
  }
  if (channelBlocked && !['transactional', 'operational'].includes(category)) {
    appliedRules.push('contact_channel_preference');
    return deny('CHANNEL_PREFERENCE_BLOCKED', 'El contacto indico que no desea usar este canal.');
  }
  if (globalDnd && !['transactional', 'operational'].includes(category)) {
    appliedRules.push('global_dnd');
    return deny('GLOBAL_DND', 'El contacto tiene No molestar global activo.');
  }
  if (consentStatus === 'opted_out' && !['transactional', 'operational'].includes(category)) {
    appliedRules.push('channel_opted_out');
    return deny('CHANNEL_OPTED_OUT', 'El contacto retiro el consentimiento para este canal.');
  }
  if (
    consentStatus === 'transactional_only' &&
    !['transactional', 'operational'].includes(category)
  ) {
    appliedRules.push('transactional_only');
    return deny('TRANSACTIONAL_ONLY', 'Este canal solo admite mensajes transaccionales u operativos.');
  }
  if (category === 'commercial' && consentStatus !== 'opted_in') {
    appliedRules.push('commercial_requires_opt_in');
    return deny('COMMERCIAL_OPT_IN_REQUIRED', 'Se requiere consentimiento comercial explicito.');
  }
  if (
    category === 'reply' &&
    consentStatus === 'unknown' &&
    !recentInbound
  ) {
    appliedRules.push('reply_requires_recent_inbound');
    return deny(
      'REPLY_WINDOW_UNAVAILABLE',
      'No existe una conversacion reciente iniciada por el contacto.'
    );
  }

  const quiet = quietHoursState(
    { ...quietHours, timezone: quietHours.timezone || 'UTC' },
    now,
    channel
  );
  const quietApplies =
    quiet.quiet &&
    (
      category === 'commercial' ||
      (!quietHours.allowTransactional && ['transactional', 'operational'].includes(category))
    );
  if (quietApplies) {
    appliedRules.push('quiet_hours');
    if (quietHours.action === 'schedule') {
      return allow({ scheduled: true, scheduleAt: quiet.nextAllowedAt });
    }
    return deny('QUIET_HOURS_BLOCKED', 'El envio esta bloqueado por horario silencioso.');
  }

  appliedRules.push(`consent_${consentStatus}`);
  return allow();
}
