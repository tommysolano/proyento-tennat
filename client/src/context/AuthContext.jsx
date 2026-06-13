import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('tenantdesk_token'));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('tenantdesk_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [tenant, setTenant] = useState(() => {
    const stored = localStorage.getItem('tenantdesk_tenant');
    return stored ? JSON.parse(stored) : { distributor: null, company: null };
  });
  const [access, setAccess] = useState(() => {
    const stored = localStorage.getItem('tenantdesk_access');
    return stored ? JSON.parse(stored) : { permissions: [], modules: [] };
  });
  const [impersonator, setImpersonator] = useState(() => {
    const stored = localStorage.getItem('tenantdesk_original_session');
    if (!stored) return null;

    try {
      return JSON.parse(stored).user;
    } catch (error) {
      localStorage.removeItem('tenantdesk_original_session');
      return null;
    }
  });
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    function handleUnauthorized() {
      logout();
    }

    window.addEventListener('tenantdesk:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('tenantdesk:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadSession() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const data = await apiRequest('/auth/me');
        if (!ignore) {
          setUser(data.user);
          setTenant(data.tenant || { distributor: null, company: null });
          setAccess(data.access || { permissions: [], modules: [] });
          setImpersonator(data.impersonation || null);
          localStorage.setItem('tenantdesk_user', JSON.stringify(data.user));
          localStorage.setItem('tenantdesk_tenant', JSON.stringify(data.tenant || {}));
          localStorage.setItem('tenantdesk_access', JSON.stringify(data.access || {}));
        }
      } catch (error) {
        if (!ignore) {
          localStorage.removeItem('tenantdesk_token');
          localStorage.removeItem('tenantdesk_user');
          localStorage.removeItem('tenantdesk_original_session');
          localStorage.removeItem('tenantdesk_tenant');
          localStorage.removeItem('tenantdesk_access');
          setToken(null);
          setUser(null);
          setTenant({ distributor: null, company: null });
          setAccess({ permissions: [], modules: [] });
          setImpersonator(null);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadSession();
    return () => {
      ignore = true;
    };
  }, [token]);

  async function login(email, password) {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    localStorage.setItem('tenantdesk_token', data.token);
    localStorage.setItem('tenantdesk_user', JSON.stringify(data.user));
    localStorage.setItem('tenantdesk_tenant', JSON.stringify(data.tenant || {}));
    localStorage.setItem('tenantdesk_access', JSON.stringify(data.access || {}));
    localStorage.removeItem('tenantdesk_original_session');
    setToken(data.token);
    setUser(data.user);
    setTenant(data.tenant || { distributor: null, company: null });
    setAccess(data.access || { permissions: [], modules: [] });
    setImpersonator(null);
    return data;
  }

  async function startImpersonation(payload) {
    const data = await apiRequest('/auth/impersonate', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    localStorage.setItem(
      'tenantdesk_original_session',
      JSON.stringify({ token, user, tenant, access })
    );
    localStorage.setItem('tenantdesk_token', data.token);
    localStorage.setItem('tenantdesk_user', JSON.stringify(data.user));
    localStorage.setItem('tenantdesk_tenant', JSON.stringify(data.tenant || {}));
    localStorage.setItem('tenantdesk_access', JSON.stringify(data.access || {}));
    setImpersonator(user);
    setToken(data.token);
    setUser(data.user);
    setTenant(data.tenant || { distributor: null, company: null });
    setAccess(data.access || { permissions: [], modules: [] });
    return data;
  }

  const impersonateAdmin = (companyId) => startImpersonation({ companyId });
  const impersonateDistributor = (distributorId) =>
    startImpersonation({ distributorId });

  async function returnToOriginalSession() {
    const stored = localStorage.getItem('tenantdesk_original_session');

    if (!stored) return null;

    await apiRequest('/auth/impersonation/end', { method: 'POST' }).catch(() => null);
    const originalSession = JSON.parse(stored);
    localStorage.setItem('tenantdesk_token', originalSession.token);
    localStorage.setItem('tenantdesk_user', JSON.stringify(originalSession.user));
    localStorage.setItem(
      'tenantdesk_tenant',
      JSON.stringify(originalSession.tenant || {})
    );
    localStorage.setItem(
      'tenantdesk_access',
      JSON.stringify(originalSession.access || {})
    );
    localStorage.removeItem('tenantdesk_original_session');
    setToken(originalSession.token);
    setUser(originalSession.user);
    setTenant(originalSession.tenant || { distributor: null, company: null });
    setAccess(originalSession.access || { permissions: [], modules: [] });
    setImpersonator(null);
    return originalSession.user;
  }

  function logout() {
    localStorage.removeItem('tenantdesk_token');
    localStorage.removeItem('tenantdesk_user');
    localStorage.removeItem('tenantdesk_original_session');
    localStorage.removeItem('tenantdesk_tenant');
    localStorage.removeItem('tenantdesk_access');
    setToken(null);
    setUser(null);
    setTenant({ distributor: null, company: null });
    setAccess({ permissions: [], modules: [] });
    setImpersonator(null);
  }

  const value = useMemo(
    () => ({
      token,
      user,
      tenant,
      access,
      impersonator,
      loading,
      isAuthenticated: Boolean(token && user),
      login,
      impersonateAdmin,
      impersonateDistributor,
      returnToOriginalSession,
      refreshSession: async () => {
        const data = await apiRequest('/auth/me');
        setUser(data.user);
        setTenant(data.tenant || { distributor: null, company: null });
        setAccess(data.access || { permissions: [], modules: [] });
        localStorage.setItem('tenantdesk_user', JSON.stringify(data.user));
        localStorage.setItem('tenantdesk_tenant', JSON.stringify(data.tenant || {}));
        localStorage.setItem('tenantdesk_access', JSON.stringify(data.access || {}));
        return data;
      },
      logout
    }),
    [token, user, tenant, access, impersonator, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }

  return context;
}
