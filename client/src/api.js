const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

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
  const query = new URLSearchParams();
  if (filters.status) query.set('status', filters.status);
  if (filters.search) query.set('search', filters.search);
  const suffix = query.toString() ? `?${query}` : '';
  return apiRequest(`/contacts${suffix}`);
}

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
