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
