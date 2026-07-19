import { Navigate, useLocation } from 'react-router-dom';

/**
 * Compatibilidad con los enlaces guardados de la epoca en que estas paginas
 * eran una sola con navegacion por anclas. `/distributor/dashboard#planes`
 * sigue funcionando y aterriza en `/distributor/plans`.
 */
export function HashRedirect({ map, children }) {
  const location = useLocation();
  const hash = String(location.hash || '').replace(/^#/, '');
  const target = hash ? map[hash] : null;

  if (target) return <Navigate to={target} replace />;
  return children;
}

export const DISTRIBUTOR_HASH_ROUTES = {
  planes: '/distributor/plans',
  suscripciones: '/distributor/subscriptions',
  'modulos-autorizados': '/distributor/modules',
  plataforma: '/distributor/platform',
  admins: '/distributor/admins',
  empresas: '/distributor/companies',
  'crear-empresa': '/distributor/companies'
};

export const SUPERADMIN_HASH_ROUTES = {
  distributors: '/superadmin/distributors',
  'platform-plans': '/superadmin/platform-plans',
  subscriptions: '/superadmin/subscriptions',
  billing: '/superadmin/billing',
  modules: '/superadmin/modules',
  audit: '/superadmin/audit'
};
