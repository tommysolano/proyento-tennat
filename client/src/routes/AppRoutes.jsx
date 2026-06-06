import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute.jsx';
import { RoleBasedRoute } from '../components/RoleBasedRoute.jsx';
import { Layout } from '../layouts/Layout.jsx';
import { Login } from '../pages/Login.jsx';
import { NotFound } from '../pages/NotFound.jsx';
import { AdminDashboard } from '../pages/admin/AdminDashboard.jsx';
import { CallCenterDashboard } from '../pages/callcenter/CallCenterDashboard.jsx';
import { DistributorDashboard } from '../pages/distributor/DistributorDashboard.jsx';
import { SupervisorDashboard } from '../pages/supervisor/SupervisorDashboard.jsx';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/login" replace />
  },
  {
    path: '/login',
    element: <Login />
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <Layout />,
        children: [
          {
            element: <RoleBasedRoute allowedRoles={['DISTRIBUTOR']} />,
            children: [{ path: '/distributor/dashboard', element: <DistributorDashboard /> }]
          },
          {
            element: <RoleBasedRoute allowedRoles={['ADMIN']} />,
            children: [{ path: '/admin/dashboard', element: <AdminDashboard /> }]
          },
          {
            element: <RoleBasedRoute allowedRoles={['SUPERVISOR']} />,
            children: [{ path: '/supervisor/dashboard', element: <SupervisorDashboard /> }]
          },
          {
            element: <RoleBasedRoute allowedRoles={['CALLCENTER']} />,
            children: [{ path: '/callcenter/dashboard', element: <CallCenterDashboard /> }]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    element: <NotFound />
  }
]);
