import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { roleHome } from '../routes/roleHome.js';

export function RoleBasedRoute({ allowedRoles }) {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to={roleHome[user?.role] || '/login'} replace />;
  }

  return <Outlet />;
}
