const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function queryString(filters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  return query.toString() ? `?${query}` : '';
}

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('tenantdesk_token');
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token && path !== '/auth/login') {
      window.dispatchEvent(new CustomEvent('tenantdesk:unauthorized'));
    }

    const error = new Error(data.message || 'Error de comunicacion con la API');
    error.status = response.status;
    throw error;
  }

  return data;
}

export function connectRealtime(onEvent, onStatus = () => {}) {
  const controller = new AbortController();
  const token = localStorage.getItem('tenantdesk_token');

  async function connect() {
    onStatus('connecting');
    try {
      const response = await fetch(`${API_URL}/realtime/events`, {
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

export const getUsers = () => apiRequest('/users');
export const createUser = (user) =>
  apiRequest('/users', {
    method: 'POST',
    body: JSON.stringify(user)
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
  const response = await fetch(`${API_URL}/contacts/export${queryString(filters)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
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

export const getTags = () => apiRequest('/crm/tags');
export const createTag = (payload) => apiRequest('/crm/tags', { method: 'POST', body: JSON.stringify(payload) });
export const updateTag = (id, payload) => apiRequest(`/crm/tags/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const deleteTag = (id) => apiRequest(`/crm/tags/${id}`, { method: 'DELETE' });

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
