import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('tenantdesk_token'));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('tenantdesk_user');
    return stored ? JSON.parse(stored) : null;
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
          localStorage.setItem('tenantdesk_user', JSON.stringify(data.user));
        }
      } catch (error) {
        if (!ignore) {
          localStorage.removeItem('tenantdesk_token');
          localStorage.removeItem('tenantdesk_user');
          localStorage.removeItem('tenantdesk_original_session');
          setToken(null);
          setUser(null);
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
    localStorage.removeItem('tenantdesk_original_session');
    setToken(data.token);
    setUser(data.user);
    setImpersonator(null);
    return data;
  }

  async function impersonateAdmin(companyId) {
    const data = await apiRequest('/auth/impersonate', {
      method: 'POST',
      body: JSON.stringify({ companyId })
    });

    localStorage.setItem('tenantdesk_original_session', JSON.stringify({ token, user }));
    localStorage.setItem('tenantdesk_token', data.token);
    localStorage.setItem('tenantdesk_user', JSON.stringify(data.user));
    setImpersonator(user);
    setToken(data.token);
    setUser(data.user);
    return data;
  }

  function returnToOriginalSession() {
    const stored = localStorage.getItem('tenantdesk_original_session');

    if (!stored) return null;

    const originalSession = JSON.parse(stored);
    localStorage.setItem('tenantdesk_token', originalSession.token);
    localStorage.setItem('tenantdesk_user', JSON.stringify(originalSession.user));
    localStorage.removeItem('tenantdesk_original_session');
    setToken(originalSession.token);
    setUser(originalSession.user);
    setImpersonator(null);
    return originalSession.user;
  }

  function logout() {
    localStorage.removeItem('tenantdesk_token');
    localStorage.removeItem('tenantdesk_user');
    localStorage.removeItem('tenantdesk_original_session');
    setToken(null);
    setUser(null);
    setImpersonator(null);
  }

  const value = useMemo(
    () => ({
      token,
      user,
      impersonator,
      loading,
      isAuthenticated: Boolean(token && user),
      login,
      impersonateAdmin,
      returnToOriginalSession,
      logout
    }),
    [token, user, impersonator, loading]
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
