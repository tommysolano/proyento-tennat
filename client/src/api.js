import { buildApiUrl, normalizeApiBaseUrl } from './apiUrl.js';
import { normalizeMarketingPayload } from './utils/marketingPayload.js';

const API_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL, {
  dev: import.meta.env.DEV
});

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }

  const text = await response.text().catch(() => '');
  return contentType.includes('text/html') ? {} : { message: text.trim() };
}

async function request(url, options) {
  try {
    return await fetch(url, options);
  } catch (cause) {
    const error = new Error('No se pudo conectar con la API. Verifica la URL y tu conexion.');
    error.cause = cause;
    error.url = url;
    throw error;
  }
}

function queryString(filters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  return query.toString() ? `?${query}` : '';
}

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('tenantdesk_token');
  const url = buildApiUrl(API_URL, path);
  const response = await request(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const data = await parseResponse(response);
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    if (response.status === 401 && token && path !== '/auth/login') {
      window.dispatchEvent(new CustomEvent('tenantdesk:unauthorized'));
    }

    const statusLabel = response.statusText
      ? `${response.status} ${response.statusText}`
      : String(response.status);
    const error = new Error(data.message || `La API respondio HTTP ${statusLabel}`);
    error.status = response.status;
    error.url = url;
    throw error;
  }

  if (response.status !== 204 && !contentType.includes('application/json')) {
    const error = new Error(
      contentType.includes('text/html')
        ? 'La URL de la API devolvio una pagina HTML. Verifica VITE_API_URL o el proxy de /api.'
        : 'La API devolvio una respuesta con formato inesperado.'
    );
    error.status = response.status;
    error.url = url;
    throw error;
  }

  return data;
}

async function authenticatedFetch(path, options = {}) {
  const token = localStorage.getItem('tenantdesk_token');
  return request(buildApiUrl(API_URL, path), {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
}

export function connectRealtime(onEvent, onStatus = () => {}) {
  const controller = new AbortController();
  const token = localStorage.getItem('tenantdesk_token');

  async function connect() {
    onStatus('connecting');
    try {
      const response = await request(buildApiUrl(API_URL, '/realtime/events'), {
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        throw new Error(`Realtime respondio HTTP ${response.status}`);
      }
      onStatus('connected');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';
        for (const frame of frames) {
          if (!frame || frame.startsWith(':')) continue;
          const event = frame.match(/^event:\s*(.+)$/m)?.[1] || 'message';
          const rawData = frame.match(/^data:\s*(.+)$/m)?.[1];
          if (!rawData) continue;
          onEvent({ event, ...JSON.parse(rawData) });
        }
      }
      if (!controller.signal.aborted) onStatus('disconnected');
    } catch (error) {
      if (!controller.signal.aborted) onStatus('error', error);
    }
  }

  connect();
  return () => controller.abort();
}

export const getCompanies = () => apiRequest('/companies');
export const createCompany = (company) =>
  apiRequest('/companies', {
    method: 'POST',
    body: JSON.stringify(company)
  });

export const getPlans = () => apiRequest('/plans');
export const createPlan = (plan) =>
  apiRequest('/plans', {
    method: 'POST',
    body: JSON.stringify(plan)
  });
export const updatePlan = (planId, plan) =>
  apiRequest(`/plans/${planId}`, {
    method: 'PATCH',
    body: JSON.stringify(plan)
  });

export const getImpersonationTargets = (filters = {}) =>
  apiRequest(`/auth/impersonation/targets${queryString(filters)}`);

export const getUsers = () => apiRequest('/users');
export const createUser = (user) =>
  apiRequest('/users', {
    method: 'POST',
    body: JSON.stringify(user)
  });
export const getPermissionTemplates = () => apiRequest('/users/permissions/templates');
export const updateUserPermissions = (userId, payload) =>
  apiRequest(`/users/${userId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
export const applyRolePermissions = (role, payload) =>
  apiRequest(`/users/permissions/roles/${role}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const getSubscriptions = () => apiRequest('/subscriptions');
export const createSubscription = (subscription) =>
  apiRequest('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(subscription)
  });
export const updateSubscription = (subscriptionId, subscription) =>
  apiRequest(`/subscriptions/${subscriptionId}`, {
    method: 'PUT',
    body: JSON.stringify(subscription)
  });

export function getContacts(filters = {}) {
  return apiRequest(`/contacts${queryString(filters)}`);
}

export const getContact = (contactId) => apiRequest(`/contacts/${contactId}`);
export const getContactTimeline = (contactId) => apiRequest(`/contacts/${contactId}/timeline`);
export const getContactCommunicationStatus = (contactId, filters = {}) =>
  apiRequest(`/communications/contacts/${contactId}/status${queryString(filters)}`);
export const updateContactConsent = (contactId, channel, payload) =>
  apiRequest(`/communications/contacts/${contactId}/consents/${channel}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
export const updateContactDnd = (contactId, payload) =>
  apiRequest(`/communications/contacts/${contactId}/dnd`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const updateContactCommunicationPreferences = (contactId, payload) =>
  apiRequest(`/communications/contacts/${contactId}/preferences`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const evaluateCommunicationPolicy = (filters = {}) =>
  apiRequest(`/communications/policy/evaluate${queryString(filters)}`);
export const getCommunicationSettings = () => apiRequest('/communications/settings');
export const updateCommunicationSettings = (payload) =>
  apiRequest('/communications/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const getSuppressions = (filters = {}) =>
  apiRequest(`/communications/suppressions${queryString(filters)}`);
export const createSuppression = (payload) =>
  apiRequest('/communications/suppressions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
export const revokeSuppression = (id, reason = '') =>
  apiRequest(`/communications/suppressions/${id}/revoke`, {
    method: 'PATCH',
    body: JSON.stringify({ reason })
  });
export const getCommunicationReport = (filters = {}) =>
  apiRequest(`/communications/reports/overview${queryString(filters)}`);

export const createContact = (contact) =>
  apiRequest('/contacts', {
    method: 'POST',
    body: JSON.stringify(contact)
  });

export const updateContact = (contactId, contact) =>
  apiRequest(`/contacts/${contactId}`, {
    method: 'PATCH',
    body: JSON.stringify(contact)
  });

export const deleteContact = (contactId) =>
  apiRequest(`/contacts/${contactId}`, {
    method: 'DELETE'
  });

export const addContactNote = (contactId, text) =>
  apiRequest(`/contacts/${contactId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ text })
  });

export const importContacts = (contacts, updateDuplicates = false) =>
  apiRequest('/contacts/import', {
    method: 'POST',
    body: JSON.stringify({ contacts, updateDuplicates })
  });

export async function exportContacts(filters = {}) {
  const token = localStorage.getItem('tenantdesk_token');
  const response = await request(
    buildApiUrl(API_URL, `/contacts/export${queryString(filters)}`),
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'No se pudo exportar');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'contactos.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export const getTags = (scope = '') => apiRequest(`/crm/tags${queryString({ scope })}`);
export const createTag = (payload) => apiRequest('/crm/tags', { method: 'POST', body: JSON.stringify(payload) });
export const updateTag = (id, payload) => apiRequest(`/crm/tags/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const deleteTag = (id) => apiRequest(`/crm/tags/${id}`, { method: 'DELETE' });

export const getCrmLists = (entityType = '') =>
  apiRequest(`/crm/lists${queryString({ entityType })}`);
export const createCrmList = (payload) =>
  apiRequest('/crm/lists', { method: 'POST', body: JSON.stringify(payload) });
export const updateCrmList = (id, payload) =>
  apiRequest(`/crm/lists/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const deleteCrmList = (id) =>
  apiRequest(`/crm/lists/${id}`, { method: 'DELETE' });
export const getCrmListMembers = (id) => apiRequest(`/crm/lists/${id}/members`);
export const runCrmBulkAction = (entityType, payload) =>
  apiRequest(`/crm/bulk/${entityType}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
export const getCrmViewPreference = (module) =>
  apiRequest(`/crm/view-preferences/${module}`);
export const updateCrmViewPreference = (module, visibleColumns) =>
  apiRequest(`/crm/view-preferences/${module}`, {
    method: 'PUT',
    body: JSON.stringify({ visibleColumns })
  });
export const getCommercialRelations = (filters) =>
  apiRequest(`/crm/relations${queryString(filters)}`);
export const createCommercialRelation = (payload) =>
  apiRequest('/crm/relations', { method: 'POST', body: JSON.stringify(payload) });
export const deleteCommercialRelation = (id) =>
  apiRequest(`/crm/relations/${id}`, { method: 'DELETE' });

export const getCustomFields = (entityType = '') => apiRequest(`/crm/custom-fields${queryString({ entityType })}`);
export const createCustomField = (payload) => apiRequest('/crm/custom-fields', { method: 'POST', body: JSON.stringify(payload) });
export const updateCustomField = (id, payload) => apiRequest(`/crm/custom-fields/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const deleteCustomField = (id) => apiRequest(`/crm/custom-fields/${id}`, { method: 'DELETE' });

export const getSegments = () => apiRequest('/crm/segments');
export const createSegment = (payload) => apiRequest('/crm/segments', { method: 'POST', body: JSON.stringify(payload) });
export const updateSegment = (id, payload) => apiRequest(`/crm/segments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const deleteSegment = (id) => apiRequest(`/crm/segments/${id}`, { method: 'DELETE' });

export const getPipelines = () => apiRequest('/pipelines');
export const createPipeline = (payload) => apiRequest('/pipelines', { method: 'POST', body: JSON.stringify(payload) });
export const updatePipeline = (id, payload) => apiRequest(`/pipelines/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const getPipelineStages = (id) => apiRequest(`/pipelines/${id}/stages`);
export const createPipelineStage = (id, payload) => apiRequest(`/pipelines/${id}/stages`, { method: 'POST', body: JSON.stringify(payload) });
export const updatePipelineStage = (pipelineId, stageId, payload) => apiRequest(`/pipelines/${pipelineId}/stages/${stageId}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const reorderPipelineStages = (id, stageIds) => apiRequest(`/pipelines/${id}/stages/reorder`, { method: 'PUT', body: JSON.stringify({ stageIds }) });

export const getOpportunities = (filters = {}) => apiRequest(`/opportunities${queryString(filters)}`);
export const getOpportunity = (id) => apiRequest(`/opportunities/${id}`);
export const getOpportunityTimeline = (id) => apiRequest(`/opportunities/${id}/timeline`);
export const createOpportunity = (payload) => apiRequest('/opportunities', { method: 'POST', body: JSON.stringify(payload) });
export const updateOpportunity = (id, payload) => apiRequest(`/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const moveOpportunityStage = (id, stageId) => apiRequest(`/opportunities/${id}/move`, { method: 'PATCH', body: JSON.stringify({ stageId }) });
export const markOpportunityWon = (id) => apiRequest(`/opportunities/${id}/won`, { method: 'PATCH', body: '{}' });
export const markOpportunityLost = (id, lostReason = '') => apiRequest(`/opportunities/${id}/lost`, { method: 'PATCH', body: JSON.stringify({ lostReason }) });

export const getTasks = (filters = {}) => apiRequest(`/tasks${queryString(filters)}`);
export const createTask = (payload) => apiRequest('/tasks', { method: 'POST', body: JSON.stringify(payload) });
export const updateTask = (id, payload) => apiRequest(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const completeTask = (id) => apiRequest(`/tasks/${id}/complete`, { method: 'PATCH', body: '{}' });

export const getNotes = (relatedType, relatedId) => apiRequest(`/notes${queryString({ relatedType, relatedId })}`);
export const createNote = (payload) => apiRequest('/notes', { method: 'POST', body: JSON.stringify(payload) });
export const getCrmDashboard = () => apiRequest('/crm/dashboard');

export const getConversations = (filters = {}) =>
  apiRequest(`/conversations${queryString(filters)}`);
export const getConversation = (id) => apiRequest(`/conversations/${id}`);
export const createConversation = (payload) =>
  apiRequest('/conversations', { method: 'POST', body: JSON.stringify(payload) });
export const updateConversation = (id, payload) =>
  apiRequest(`/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const assignConversation = (id, assignedTo) =>
  apiRequest(`/conversations/${id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ assignedTo })
  });
export const closeConversation = (id) =>
  apiRequest(`/conversations/${id}/close`, { method: 'PATCH', body: '{}' });
export const reopenConversation = (id) =>
  apiRequest(`/conversations/${id}/reopen`, { method: 'PATCH', body: '{}' });
export const archiveConversation = (id) =>
  apiRequest(`/conversations/${id}/archive`, { method: 'PATCH', body: '{}' });
export const markConversationRead = (id) =>
  apiRequest(`/conversations/${id}/read`, { method: 'PATCH', body: '{}' });
export const getConversationMessages = (id) =>
  apiRequest(`/conversations/${id}/messages`);
export const sendMessage = (id, payload) =>
  apiRequest(`/conversations/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
export const createConversationInternalNote = (id, text) =>
  apiRequest(`/conversations/${id}/internal-note`, {
    method: 'POST',
    body: JSON.stringify({ text })
  });
export const retryMessage = (id) =>
  apiRequest(`/messages/${id}/retry`, { method: 'POST', body: '{}' });
export const getMessageMedia = (id) => apiRequest(`/messages/${id}/media`);
export const retryMessageMedia = (id) =>
  apiRequest(`/messages/${id}/media/retry-download`, { method: 'POST', body: '{}' });
export const getInboxMetrics = () => apiRequest('/conversations/metrics');

export async function getMediaContentObjectUrl(messageId) {
  const response = await authenticatedFetch(`/messages/${messageId}/media/content`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'No se pudo cargar la media');
  }
  return URL.createObjectURL(await response.blob());
}

export async function uploadConversationMedia(conversationId, file, caption = '', category = '') {
  const form = new FormData();
  form.append('file', file);
  if (caption) form.append('caption', caption);
  if (category) form.append('category', category);
  const response = await authenticatedFetch(
    `/conversations/${conversationId}/messages/media`,
    { method: 'POST', body: form }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'No se pudo subir la media');
  return data;
}

export const getChannelConfigs = () => apiRequest('/channel-configs');
export const getChannelConfig = (id) => apiRequest(`/channel-configs/${id}`);
export const createChannelConfig = (payload) =>
  apiRequest('/channel-configs', { method: 'POST', body: JSON.stringify(payload) });
export const updateChannelConfig = (id, payload) =>
  apiRequest(`/channel-configs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const disableChannelConfig = (id) =>
  apiRequest(`/channel-configs/${id}/disable`, { method: 'PATCH', body: '{}' });
export const testChannelConfig = (id, live = false) =>
  apiRequest(`/channel-configs/${id}/test`, {
    method: 'PATCH',
    body: JSON.stringify({ live })
  });
export const getChannelDiagnostics = (id) =>
  apiRequest(`/channel-configs/${id}/diagnostics`);
export const rotateChannelSecrets = (id, payload) =>
  apiRequest(`/channel-configs/${id}/rotate-secret`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getWhatsAppSessions = (filters = {}) =>
  apiRequest(`/whatsapp-sessions${queryString(filters)}`);
export const createWhatsAppSession = (payload) =>
  apiRequest('/whatsapp-sessions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
export const connectWhatsAppSession = (id, reconnect = false) =>
  apiRequest(`/whatsapp-sessions/${id}/${reconnect ? 'reconnect' : 'connect'}`, {
    method: 'POST',
    body: '{}'
  });
export const regenerateWhatsAppSessionQr = (id) =>
  apiRequest(`/whatsapp-sessions/${id}/regenerate-qr`, {
    method: 'POST',
    body: '{}'
  });
export const getWhatsAppSessionQr = (id) =>
  apiRequest(`/whatsapp-sessions/${id}/qr`);
export const getWhatsAppSessionDiagnostics = (id) =>
  apiRequest(`/whatsapp-sessions/${id}/diagnostics`);
export const disconnectWhatsAppSession = (id, confirmation) =>
  apiRequest(`/whatsapp-sessions/${id}/disconnect`, {
    method: 'POST',
    body: JSON.stringify({ confirmation })
  });
export const logoutWhatsAppSession = (id, confirmation) =>
  apiRequest(`/whatsapp-sessions/${id}/logout`, {
    method: 'POST',
    body: JSON.stringify({ confirmation })
  });
export const setWhatsAppSessionEnabled = (id, enabled, confirmation = '') =>
  apiRequest(`/whatsapp-sessions/${id}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled, confirmation })
  });
export const getConversationProviders = () =>
  apiRequest('/conversations/providers');

export const getNotifications = (filters = {}) =>
  apiRequest(`/notifications${queryString(filters)}`);
export const markNotificationRead = (id) =>
  apiRequest(`/notifications/${id}/read`, { method: 'PATCH', body: '{}' });
export const markAllNotificationsRead = () =>
  apiRequest('/notifications/read-all', { method: 'PATCH', body: '{}' });

export const getRoutingRules = () => apiRequest('/routing-rules');
export const createRoutingRule = (payload) =>
  apiRequest('/routing-rules', { method: 'POST', body: JSON.stringify(payload) });
export const updateRoutingRule = (id, payload) =>
  apiRequest(`/routing-rules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const toggleRoutingRule = (id) =>
  apiRequest(`/routing-rules/${id}/toggle`, { method: 'PATCH', body: '{}' });

export const getOpsJobs = (filters = {}) =>
  apiRequest(`/ops/jobs${queryString(filters)}`);
export const replayOpsJob = (id) =>
  apiRequest(`/ops/jobs/${id}/replay`, { method: 'POST', body: '{}' });
export const getOpsAlerts = (filters = {}) =>
  apiRequest(`/ops/alerts${queryString(filters)}`);
export const acknowledgeOpsAlert = (id) =>
  apiRequest(`/ops/alerts/${id}/acknowledge`, { method: 'PATCH', body: '{}' });
export const getHealth = () => apiRequest('/health');

export const getMessageTemplates = (filters = {}) =>
  apiRequest(`/message-templates${queryString(filters)}`);
export const createMessageTemplate = (payload) =>
  apiRequest('/message-templates', { method: 'POST', body: JSON.stringify(payload) });
export const updateMessageTemplate = (id, payload) =>
  apiRequest(`/message-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const disableMessageTemplate = (id) =>
  apiRequest(`/message-templates/${id}/disable`, { method: 'PATCH', body: '{}' });

export function webhookUrl(channelConfigId) {
  const apiBase = API_URL.replace(/\/api\/?$/, '');
  return `${apiBase}/api/webhooks/whatsapp/${channelConfigId}`;
}

export const getActivityLogs = () => apiRequest('/activity-logs');

export const getCalendars = (filters = {}) =>
  apiRequest(`/calendars${queryString(filters)}`);
export const getCalendar = (id) => apiRequest(`/calendars/${id}`);
export const getCalendarProfiles = () =>
  apiRequest('/calendars/configuration-profiles');
export const createCalendar = (payload) =>
  apiRequest('/calendars', { method: 'POST', body: JSON.stringify(payload) });
export const updateCalendar = (id, payload) =>
  apiRequest(`/calendars/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const archiveCalendar = (id) =>
  apiRequest(`/calendars/${id}/archive`, { method: 'PATCH', body: '{}' });
export const applyCalendarProfile = (id, profileKey, confirmOverwrite = false) =>
  apiRequest(`/calendars/${id}/apply-profile`, {
    method: 'POST',
    body: JSON.stringify({ profileKey, confirmOverwrite })
  });
export const getCalendarAvailability = (id, filters = {}) =>
  apiRequest(`/calendars/${id}/availability${queryString(filters)}`);
export const getAvailabilityRules = (id) =>
  apiRequest(`/calendars/${id}/availability-rules`);
export const createAvailabilityRule = (id, payload) =>
  apiRequest(`/calendars/${id}/availability-rules`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
export const updateAvailabilityRule = (id, payload) =>
  apiRequest(`/availability-rules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const deleteAvailabilityRule = (id) =>
  apiRequest(`/availability-rules/${id}`, { method: 'DELETE' });
export const getAvailabilityExceptions = (id) =>
  apiRequest(`/calendars/${id}/exceptions`);
export const createAvailabilityException = (id, payload) =>
  apiRequest(`/calendars/${id}/exceptions`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
export const updateAvailabilityException = (id, payload) =>
  apiRequest(`/availability-exceptions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const deleteAvailabilityException = (id) =>
  apiRequest(`/availability-exceptions/${id}`, { method: 'DELETE' });

export const getAppointments = (filters = {}) =>
  apiRequest(`/appointments${queryString(filters)}`);
export const getAppointmentMetrics = () => apiRequest('/appointments/metrics');
export const getAppointmentAnalytics = (filters = {}) =>
  apiRequest(`/appointments/analytics${queryString(filters)}`);
export const createAppointment = (payload) =>
  apiRequest('/appointments', { method: 'POST', body: JSON.stringify(payload) });
export const updateAppointment = (id, payload) =>
  apiRequest(`/appointments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const updateAppointmentStatus = (id, status, reason = '') =>
  apiRequest(`/appointments/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason })
  });
export const rescheduleAppointment = (id, payload) =>
  apiRequest(`/appointments/${id}/reschedule`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const cancelAppointment = (id, reason = '') =>
  apiRequest(`/appointments/${id}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ reason })
  });
export const completeAppointment = (id) =>
  apiRequest(`/appointments/${id}/complete`, { method: 'PATCH', body: '{}' });
export const markNoShowAppointment = (id) =>
  apiRequest(`/appointments/${id}/no-show`, { method: 'PATCH', body: '{}' });

export const getBookingLinks = (filters = {}) =>
  apiRequest(`/booking-links${queryString(filters)}`);
export const createBookingLink = (payload) =>
  apiRequest('/booking-links', { method: 'POST', body: JSON.stringify(payload) });
export const updateBookingLink = (id, payload) =>
  apiRequest(`/booking-links/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const archiveBookingLink = (id) =>
  apiRequest(`/booking-links/${id}/archive`, { method: 'PATCH', body: '{}' });

export const getPublicBookingLink = (slug, filters = {}) =>
  apiRequest(
    `/public/bookings/${encodeURIComponent(slug)}${queryString(filters)}`
  );
export const getPublicBookingAvailability = (slug, filters = {}) =>
  apiRequest(
    `/public/bookings/${encodeURIComponent(slug)}/availability${queryString(filters)}`
  );
export const createPublicAppointment = (slug, payload) =>
  apiRequest(`/public/bookings/${encodeURIComponent(slug)}/appointments`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getAvailability = getCalendarAvailability;
export const getPublicBooking = getPublicBookingLink;
export const getPublicAvailability = getPublicBookingAvailability;

export const getSuperAdminOverview = () => apiRequest('/superadmin/overview');
export const getDistributors = () => apiRequest('/superadmin/distributors');
export const createDistributor = (payload) =>
  apiRequest('/superadmin/distributors', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
export const updateDistributor = (id, payload) =>
  apiRequest(`/superadmin/distributors/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const getPlatformPlans = () => apiRequest('/superadmin/platform-plans');
export const createPlatformPlan = (payload) =>
  apiRequest('/superadmin/platform-plans', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
export const updatePlatformPlan = (id, payload) =>
  apiRequest(`/superadmin/platform-plans/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const getPlatformSubscriptions = () =>
  apiRequest('/superadmin/platform-subscriptions');
export const createPlatformSubscription = (payload) =>
  apiRequest('/superadmin/platform-subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
export const updatePlatformSubscription = (id, payload) =>
  apiRequest(`/superadmin/platform-subscriptions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const getPlatformInvoices = () => apiRequest('/superadmin/invoices');
export const createPlatformInvoice = (payload) =>
  apiRequest('/superadmin/invoices', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
export const updatePlatformInvoice = (id, payload) =>
  apiRequest(`/superadmin/invoices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const getPlatformPayments = () => apiRequest('/superadmin/payments');
export const createPlatformPayment = (payload) =>
  apiRequest('/superadmin/payments', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getModules = () => apiRequest('/superadmin/modules');
export const updateModuleEntitlement = (payload) =>
  apiRequest('/superadmin/modules/entitlements', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
export const getAuditLog = () => apiRequest('/superadmin/audit');

export const getMyPlatformSubscription = () =>
  apiRequest('/billing/my-platform-subscription');
export const getMyPlatformInvoices = () => apiRequest('/billing/my-platform-invoices');
export const getMyPlatformPayments = () => apiRequest('/billing/my-platform-payments');
export const getMyUsage = () => apiRequest('/billing/my-usage');

export const getDistributorBillingOverview = () =>
  apiRequest('/distributor/billing/overview');
export const getDistributorModules = () => apiRequest('/distributor/modules');
export const getDistributorCompanies = () => apiRequest('/distributor/companies');
export const getDistributorCompanyDetail = (companyId) =>
  apiRequest(`/distributor/companies/${companyId}/detail`);
export const suspendCompany = (companyId) =>
  apiRequest(`/distributor/companies/${companyId}/suspend`, { method: 'POST' });
export const reactivateCompany = (companyId) =>
  apiRequest(`/distributor/companies/${companyId}/reactivate`, { method: 'POST' });
export const setCompanySubscription = (companyId, payload) =>
  apiRequest(`/distributor/companies/${companyId}/subscription`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export function getDistributorInvoices(filters = {}) {
  const query = new URLSearchParams();
  if (filters.companyId) query.set('companyId', filters.companyId);
  if (filters.status) query.set('status', filters.status);
  return apiRequest(`/distributor/invoices${query.toString() ? `?${query}` : ''}`);
}
export const getDistributorInvoice = (invoiceId) =>
  apiRequest(`/distributor/invoices/${invoiceId}`);
export const createDistributorInvoice = (payload) =>
  apiRequest('/distributor/invoices', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
export const updateDistributorInvoice = (invoiceId, payload) =>
  apiRequest(`/distributor/invoices/${invoiceId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export function getDistributorPayments(filters = {}) {
  const query = new URLSearchParams();
  if (filters.companyId) query.set('companyId', filters.companyId);
  if (filters.status) query.set('status', filters.status);
  return apiRequest(`/distributor/payments${query.toString() ? `?${query}` : ''}`);
}
export const createDistributorPayment = (payload) =>
  apiRequest('/distributor/payments', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getDistributorSettings = () => apiRequest('/distributor/settings');
export const updateDistributorSettings = (payload) =>
  apiRequest('/distributor/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const updateDistributorBranding = (payload) =>
  apiRequest('/distributor/branding', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const getDistributorOnboarding = () => apiRequest('/distributor/onboarding');

export const getCompanyInvoices = () => apiRequest('/company/billing/invoices');
export const getCompanyPayments = () => apiRequest('/company/billing/payments');
export const getCompanySettings = () => apiRequest('/company/settings');
export const getCompanyOnboarding = () => apiRequest('/company/onboarding');
export const updateCompanyOnboarding = (payload) =>
  apiRequest('/company/onboarding', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const getWorkflowCatalog = () => apiRequest('/workflows/catalog');
export const getWorkflows = (filters = {}) =>
  apiRequest(`/workflows${queryString(filters)}`);
export const getWorkflow = (id) => apiRequest(`/workflows/${id}`);
export const createWorkflow = (payload) =>
  apiRequest('/workflows', { method: 'POST', body: JSON.stringify(payload) });
export const updateWorkflow = (id, payload) =>
  apiRequest(`/workflows/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const activateWorkflow = (id) =>
  apiRequest(`/workflows/${id}/activate`, { method: 'PATCH', body: '{}' });
export const pauseWorkflow = (id) =>
  apiRequest(`/workflows/${id}/pause`, { method: 'PATCH', body: '{}' });
export const archiveWorkflow = (id) =>
  apiRequest(`/workflows/${id}/archive`, { method: 'PATCH', body: '{}' });
export const testWorkflow = (id, payload) =>
  apiRequest(`/workflows/${id}/test`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
export const getWorkflowRuns = (filters = {}) =>
  apiRequest(`/workflow-runs${queryString(filters)}`);
export const getWorkflowRun = (id) => apiRequest(`/workflow-runs/${id}`);

export const getForms = (filters = {}) => apiRequest(`/forms${queryString(filters)}`);
export const getForm = (id) => apiRequest(`/forms/${id}`);
export const createFormDefinition = (payload) =>
  apiRequest('/forms', {
    method: 'POST',
    body: JSON.stringify(normalizeMarketingPayload(payload))
  });
export const updateFormDefinition = (id, payload) =>
  apiRequest(`/forms/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(normalizeMarketingPayload(payload))
  });
export const publishForm = (id) =>
  apiRequest(`/forms/${id}/publish`, { method: 'PATCH', body: '{}' });
export const pauseForm = (id) =>
  apiRequest(`/forms/${id}/pause`, { method: 'PATCH', body: '{}' });
export const archiveFormDefinition = (id) =>
  apiRequest(`/forms/${id}/archive`, { method: 'PATCH', body: '{}' });
export const getFormSubmissions = (id, filters = {}) =>
  apiRequest(`/forms/${id}/submissions${queryString(filters)}`);
export const getFormAnalytics = (id) => apiRequest(`/forms/${id}/analytics`);
export const getPublicForm = (slug, tracking = {}) =>
  apiRequest(`/public/forms/${encodeURIComponent(slug)}${queryString(tracking)}`);
export const submitPublicForm = (slug, payload) =>
  apiRequest(`/public/forms/${encodeURIComponent(slug)}/submit`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getLandingPages = (filters = {}) =>
  apiRequest(`/landing-pages${queryString(filters)}`);
export const getLandingPage = (id) => apiRequest(`/landing-pages/${id}`);
export const createLandingPage = (payload) =>
  apiRequest('/landing-pages', {
    method: 'POST',
    body: JSON.stringify(normalizeMarketingPayload(payload))
  });
export const updateLandingPage = (id, payload) =>
  apiRequest(`/landing-pages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(normalizeMarketingPayload(payload))
  });
export const publishLandingPage = (id) =>
  apiRequest(`/landing-pages/${id}/publish`, { method: 'PATCH', body: '{}' });
export const pauseLandingPage = (id) =>
  apiRequest(`/landing-pages/${id}/pause`, { method: 'PATCH', body: '{}' });
export const archiveLandingPage = (id) =>
  apiRequest(`/landing-pages/${id}/archive`, { method: 'PATCH', body: '{}' });
export const getLandingPageAnalytics = (id) =>
  apiRequest(`/landing-pages/${id}/analytics`);
export const getPublicLandingPage = (slug, tracking = {}) =>
  apiRequest(`/public/pages/${encodeURIComponent(slug)}${queryString(tracking)}`);
export const trackLandingPageEvent = (slug, payload) =>
  apiRequest(`/public/pages/${encodeURIComponent(slug)}/events`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getFunnels = (filters = {}) => apiRequest(`/funnels${queryString(filters)}`);
export const getFunnel = (id) => apiRequest(`/funnels/${id}`);
export const createFunnel = (payload) =>
  apiRequest('/funnels', {
    method: 'POST',
    body: JSON.stringify(normalizeMarketingPayload(payload))
  });
export const updateFunnel = (id, payload) =>
  apiRequest(`/funnels/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(normalizeMarketingPayload(payload))
  });
export const publishFunnel = (id) =>
  apiRequest(`/funnels/${id}/publish`, { method: 'PATCH', body: '{}' });
export const pauseFunnel = (id) =>
  apiRequest(`/funnels/${id}/pause`, { method: 'PATCH', body: '{}' });
export const archiveFunnel = (id) =>
  apiRequest(`/funnels/${id}/archive`, { method: 'PATCH', body: '{}' });
export const getFunnelSteps = (id) => apiRequest(`/funnels/${id}/steps`);
export const createFunnelStep = (id, payload) =>
  apiRequest(`/funnels/${id}/steps`, {
    method: 'POST',
    body: JSON.stringify(normalizeMarketingPayload(payload))
  });
export const updateFunnelStep = (id, payload) =>
  apiRequest(`/funnel-steps/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(normalizeMarketingPayload(payload))
  });
export const publishFunnelStep = (id) =>
  apiRequest(`/funnel-steps/${id}/publish`, { method: 'PATCH', body: '{}' });
export const archiveFunnelStep = (id) =>
  apiRequest(`/funnel-steps/${id}/archive`, { method: 'PATCH', body: '{}' });
export const getFunnelAnalytics = (id) => apiRequest(`/funnels/${id}/analytics`);
export const getPublicFunnel = (funnelSlug, stepSlug = '', tracking = {}) =>
  apiRequest(
    `/public/funnels/${encodeURIComponent(funnelSlug)}${
      stepSlug ? `/${encodeURIComponent(stepSlug)}` : ''
    }${queryString(tracking)}`
  );
export const trackFunnelEvent = (funnelSlug, stepSlug, payload) =>
  apiRequest(
    `/public/funnels/${encodeURIComponent(funnelSlug)}/${encodeURIComponent(stepSlug)}/events`,
    { method: 'POST', body: JSON.stringify(payload) }
  );

export const getCampaigns = (filters = {}) =>
  apiRequest(`/campaigns${queryString(filters)}`);
export const createCampaign = (payload) =>
  apiRequest('/campaigns', { method: 'POST', body: JSON.stringify(payload) });
export const updateCampaign = (id, payload) =>
  apiRequest(`/campaigns/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
export const getIntegrations = (filters = {}) =>
  apiRequest(`/integrations${queryString(filters)}`);
export const createIntegration = (payload) =>
  apiRequest('/integrations', {
    method: 'POST',
    body: JSON.stringify(normalizeMarketingPayload(payload))
  });
export const updateIntegration = (id, payload) =>
  apiRequest(`/integrations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(normalizeMarketingPayload(payload))
  });
export const getIntegrationEvents = (id, filters = {}) =>
  apiRequest(`/integrations/${id}/events${queryString(filters)}`);
export const getMarketingReport = (filters = {}) =>
  apiRequest(`/marketing/reports/overview${queryString(filters)}`);

export const getReputationOverview = () => apiRequest('/reputation/overview');
export const getContactReputation = (contactId) =>
  apiRequest(`/reputation/contacts/${contactId}`);
export const getReviewRequests = (filters = {}) =>
  apiRequest(`/review-requests${queryString(filters)}`);
export const createReviewRequest = (payload) =>
  apiRequest('/review-requests', { method: 'POST', body: JSON.stringify(payload) });
export const cancelReviewRequest = (id) =>
  apiRequest(`/review-requests/${id}/cancel`, { method: 'PATCH', body: '{}' });
export const getReviews = (filters = {}) => apiRequest(`/reviews${queryString(filters)}`);
export const approveReview = (id) => apiRequest(`/reviews/${id}/approve`, { method: 'PATCH', body: '{}' });
export const rejectReview = (id) => apiRequest(`/reviews/${id}/reject`, { method: 'PATCH', body: '{}' });
export const publishReview = (id) => apiRequest(`/reviews/${id}/publish`, { method: 'PATCH', body: '{}' });
export const archiveReview = (id) => apiRequest(`/reviews/${id}/archive`, { method: 'PATCH', body: '{}' });
export const respondToReview = (id, responseText) =>
  apiRequest(`/reviews/${id}/respond`, { method: 'POST', body: JSON.stringify({ responseText }) });

export const getTestimonials = () => apiRequest('/testimonials');
export const createTestimonialFromReview = (reviewId, payload = {}) =>
  apiRequest(`/testimonials/from-review/${reviewId}`, { method: 'POST', body: JSON.stringify(payload) });
export const updateTestimonial = (id, payload) =>
  apiRequest(`/testimonials/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const publishTestimonial = (id) =>
  apiRequest(`/testimonials/${id}/publish`, { method: 'PATCH', body: '{}' });
export const archiveTestimonial = (id) =>
  apiRequest(`/testimonials/${id}/archive`, { method: 'PATCH', body: '{}' });

export const getReviewWidgets = () => apiRequest('/review-widgets');
export const createReviewWidget = (payload) =>
  apiRequest('/review-widgets', { method: 'POST', body: JSON.stringify(payload) });
export const updateReviewWidget = (id, payload) =>
  apiRequest(`/review-widgets/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const publishReviewWidget = (id) =>
  apiRequest(`/review-widgets/${id}/publish`, { method: 'PATCH', body: '{}' });
export const archiveReviewWidget = (id) =>
  apiRequest(`/review-widgets/${id}/archive`, { method: 'PATCH', body: '{}' });

export const getSatisfactionSurveys = () => apiRequest('/satisfaction-surveys');
export const getSatisfactionSurvey = (id) => apiRequest(`/satisfaction-surveys/${id}`);
export const createSatisfactionSurvey = (payload) =>
  apiRequest('/satisfaction-surveys', { method: 'POST', body: JSON.stringify(payload) });
export const updateSatisfactionSurvey = (id, payload) =>
  apiRequest(`/satisfaction-surveys/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const publishSatisfactionSurvey = (id) =>
  apiRequest(`/satisfaction-surveys/${id}/publish`, { method: 'PATCH', body: '{}' });
export const pauseSatisfactionSurvey = (id) =>
  apiRequest(`/satisfaction-surveys/${id}/pause`, { method: 'PATCH', body: '{}' });
export const archiveSatisfactionSurvey = (id) =>
  apiRequest(`/satisfaction-surveys/${id}/archive`, { method: 'PATCH', body: '{}' });
export const getSurveyResponses = (id) => apiRequest(`/satisfaction-surveys/${id}/responses`);
export const getSurveyAnalytics = (id) => apiRequest(`/satisfaction-surveys/${id}/analytics`);

export const getCoupons = (filters = {}) => apiRequest(`/coupons${queryString(filters)}`);
export const createCoupon = (payload) =>
  apiRequest('/coupons', { method: 'POST', body: JSON.stringify(payload) });
export const updateCoupon = (id, payload) =>
  apiRequest(`/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const activateCoupon = (id) => apiRequest(`/coupons/${id}/activate`, { method: 'PATCH', body: '{}' });
export const disableCoupon = (id) => apiRequest(`/coupons/${id}/disable`, { method: 'PATCH', body: '{}' });
export const archiveCoupon = (id) => apiRequest(`/coupons/${id}/archive`, { method: 'PATCH', body: '{}' });
export const issueCoupon = (id, contactId) =>
  apiRequest(`/coupons/${id}/issue`, { method: 'POST', body: JSON.stringify({ contactId }) });
export const redeemCoupon = (id, contactId, redemptionId = null) =>
  apiRequest(`/coupons/${id}/redeem`, { method: 'POST', body: JSON.stringify({ contactId, redemptionId }) });
export const getCouponRedemptions = (filters = {}) =>
  apiRequest(`/coupon-redemptions${queryString(filters)}`);

export const getReferralPrograms = () => apiRequest('/referral-programs');
export const createReferralProgram = (payload) =>
  apiRequest('/referral-programs', { method: 'POST', body: JSON.stringify(payload) });
export const updateReferralProgram = (id, payload) =>
  apiRequest(`/referral-programs/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const activateReferralProgram = (id) =>
  apiRequest(`/referral-programs/${id}/activate`, { method: 'PATCH', body: '{}' });
export const pauseReferralProgram = (id) =>
  apiRequest(`/referral-programs/${id}/pause`, { method: 'PATCH', body: '{}' });
export const archiveReferralProgram = (id) =>
  apiRequest(`/referral-programs/${id}/archive`, { method: 'PATCH', body: '{}' });
export const getReferrals = (filters = {}) => apiRequest(`/referrals${queryString(filters)}`);
export const createReferral = (payload) =>
  apiRequest('/referrals', { method: 'POST', body: JSON.stringify(payload) });
export const convertReferral = (id) => apiRequest(`/referrals/${id}/convert`, { method: 'PATCH', body: '{}' });
export const rewardReferral = (id, rewardStatus) =>
  apiRequest(`/referrals/${id}/reward`, { method: 'PATCH', body: JSON.stringify({ rewardStatus }) });

export const getPublicReviewRequest = (token) =>
  apiRequest(`/public/reviews/request/${encodeURIComponent(token)}`);
export const submitPublicReview = (token, payload) =>
  apiRequest(`/public/reviews/request/${encodeURIComponent(token)}/submit`, { method: 'POST', body: JSON.stringify(payload) });
export const getPublicReviewWidget = (slug) =>
  apiRequest(`/public/review-widgets/${encodeURIComponent(slug)}`);
export const getPublicSatisfactionSurvey = (slug) =>
  apiRequest(`/public/surveys/${encodeURIComponent(slug)}`);
export const submitPublicSatisfactionSurvey = (slug, payload) =>
  apiRequest(`/public/surveys/${encodeURIComponent(slug)}/submit`, { method: 'POST', body: JSON.stringify(payload) });
export const getPublicReferral = (programSlug, code) =>
  apiRequest(`/public/referrals/${encodeURIComponent(programSlug)}/${encodeURIComponent(code)}`);
export const submitPublicReferral = (programSlug, code, payload) =>
  apiRequest(`/public/referrals/${encodeURIComponent(programSlug)}/${encodeURIComponent(code)}/submit`, { method: 'POST', body: JSON.stringify(payload) });
