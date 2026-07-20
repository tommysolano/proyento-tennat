import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api.js';
import { tokenIsExpired } from '../utils/session.js';

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
    // Un 401 suelto NO debe cerrar la sesion: un poll en segundo plano (las
    // notificaciones se refrescan cada 30s) o un endpoint puntual podian
    // desloguear al usuario aunque su token siguiera vigente. Solo cerramos si
    // el token realmente expiro; y si expira una sesion impersonada, se vuelve
    // al actor raiz en vez de tirar toda la sesion.
    function handleUnauthorized() {
      const current = localStorage.getItem('tenantdesk_token');
      if (!current || !tokenIsExpired(current)) return;

      const stored = localStorage.getItem('tenantdesk_original_session');
      if (stored) {
        try {
          const root = JSON.parse(stored);
          if (root?.token && !tokenIsExpired(root.token)) {
            returnToOriginalSession();
            return;
          }
        } catch {
          // sesion raiz ilegible: se cae al logout normal
        }
      }
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

    // En una cadena (ej. SUPERADMIN -> ADMIN -> CALLCENTER) la sesion guardada
    // debe seguir siendo la del actor raiz, nunca la del objetivo intermedio.
    if (!localStorage.getItem('tenantdesk_original_session')) {
      localStorage.setItem(
        'tenantdesk_original_session',
        JSON.stringify({ token, user, tenant, access })
      );
    }
    localStorage.setItem('tenantdesk_token', data.token);
    localStorage.setItem('tenantdesk_user', JSON.stringify(data.user));
    localStorage.setItem('tenantdesk_tenant', JSON.stringify(data.tenant || {}));
    localStorage.setItem('tenantdesk_access', JSON.stringify(data.access || {}));
    setImpersonator(data.impersonatedBy || impersonator || user);
    setToken(data.token);
    setUser(data.user);
    setTenant(data.tenant || { distributor: null, company: null });
    setAccess(data.access || { permissions: [], modules: [] });
    return data;
  }

  const impersonateAdmin = (companyId) => startImpersonation({ companyId });
  const impersonateDistributor = (distributorId) =>
    startImpersonation({ distributorId });
  const impersonateUser = (targetUserId) => startImpersonation({ targetUserId });

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

  // El alcance de impersonacion siempre se mide contra el actor raiz, no
  // contra el usuario que se esta impersonando en este momento.
  const rootActor = impersonator || user;
  const canImpersonate = ['SUPERADMIN', 'DISTRIBUTOR', 'ADMIN'].includes(
    rootActor?.role
  );

  const value = useMemo(
    () => ({
      token,
      user,
      tenant,
      access,
      impersonator,
      rootActor,
      canImpersonate,
      loading,
      isAuthenticated: Boolean(token && user),
      login,
      impersonateAdmin,
      impersonateDistributor,
      impersonateUser,
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
    [token, user, tenant, access, impersonator, rootActor, canImpersonate, loading]
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
