import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute.jsx';
import { RoleBasedRoute } from '../components/RoleBasedRoute.jsx';
import { Layout } from '../layouts/Layout.jsx';
import { Login } from '../pages/Login.jsx';
import { NotFound } from '../pages/NotFound.jsx';
import { AdminDashboard } from '../pages/admin/AdminDashboard.jsx';
import { CallCenterDashboard } from '../pages/callcenter/CallCenterDashboard.jsx';
import { DistributorDashboard } from '../pages/distributor/DistributorDashboard.jsx';
import { CompanyDetailForDistributor } from '../pages/distributor/CompanyDetailForDistributor.jsx';
import { DistributorCommercePage } from '../pages/distributor/DistributorCommercePage.jsx';
import { SupervisorDashboard } from '../pages/supervisor/SupervisorDashboard.jsx';
import { SuperAdminDashboard } from '../pages/superadmin/SuperAdminDashboard.jsx';

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
            element: <RoleBasedRoute allowedRoles={['SUPERADMIN']} />,
            children: [
              { path: '/superadmin', element: <SuperAdminDashboard /> },
              { path: '/superadmin/distributors', element: <SuperAdminDashboard section="distributors" /> },
              { path: '/superadmin/platform-plans', element: <SuperAdminDashboard section="plans" /> },
              { path: '/superadmin/subscriptions', element: <SuperAdminDashboard section="subscriptions" /> },
              { path: '/superadmin/billing', element: <SuperAdminDashboard section="billing" /> },
              { path: '/superadmin/modules', element: <SuperAdminDashboard section="modules" /> },
              { path: '/superadmin/audit', element: <SuperAdminDashboard section="audit" /> }
            ]
          },
          {
            element: <RoleBasedRoute allowedRoles={['DISTRIBUTOR']} />,
            children: [
              { path: '/distributor/dashboard', element: <DistributorDashboard /> },
              { path: '/distributor/companies', element: <DistributorCommercePage section="companies" /> },
              { path: '/distributor/companies/:id', element: <CompanyDetailForDistributor /> },
              { path: '/distributor/finance', element: <DistributorCommercePage section="finance" /> },
              { path: '/distributor/invoices', element: <DistributorCommercePage section="invoices" /> },
              { path: '/distributor/payments', element: <DistributorCommercePage section="payments" /> },
              { path: '/distributor/branding', element: <DistributorCommercePage section="branding" /> },
              { path: '/distributor/settings', element: <DistributorCommercePage section="settings" /> },
              { path: '/distributor/onboarding', element: <DistributorCommercePage section="onboarding" /> }
            ]
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
