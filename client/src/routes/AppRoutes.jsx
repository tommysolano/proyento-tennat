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
import { ContactDetailPage } from '../pages/crm/ContactDetailPage.jsx';
import { ContactsPage } from '../pages/crm/ContactsPage.jsx';
import { CrmDashboardPage } from '../pages/crm/CrmDashboardPage.jsx';
import {
  CustomFieldsPage,
  ImportContactsPage,
  PipelinesPage,
  SegmentsPage,
  TagsPage
} from '../pages/crm/CrmAdminPages.jsx';
import { OpportunitiesPage } from '../pages/crm/OpportunitiesPage.jsx';
import { OpportunityDetailPage } from '../pages/crm/OpportunityDetailPage.jsx';
import { PipelineKanbanPage } from '../pages/crm/PipelineKanbanPage.jsx';
import { TasksPage } from '../pages/crm/TasksPage.jsx';
import { InboxPage } from '../pages/inbox/InboxPage.jsx';
import { ChannelSettingsPage } from '../pages/inbox/ChannelSettingsPage.jsx';
import { MessageTemplatesPage } from '../pages/inbox/MessageTemplatesPage.jsx';

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
          },
          {
            element: <RoleBasedRoute allowedRoles={['ADMIN', 'SUPERVISOR', 'CALLCENTER']} />,
            children: [
              { path: '/crm', element: <CrmDashboardPage /> },
              { path: '/crm/contacts', element: <ContactsPage /> },
              { path: '/crm/contacts/:id', element: <ContactDetailPage /> },
              { path: '/crm/opportunities', element: <OpportunitiesPage /> },
              { path: '/crm/opportunities/:id', element: <OpportunityDetailPage /> },
              { path: '/crm/pipeline', element: <PipelineKanbanPage /> },
              { path: '/crm/tasks', element: <TasksPage /> },
              { path: '/crm/segments', element: <SegmentsPage /> },
              { path: '/inbox', element: <InboxPage /> }
            ]
          },
          {
            element: <RoleBasedRoute allowedRoles={['ADMIN']} />,
            children: [
              { path: '/crm/tags', element: <TagsPage /> },
              { path: '/crm/custom-fields', element: <CustomFieldsPage /> },
              { path: '/crm/import', element: <ImportContactsPage /> },
              { path: '/crm/pipelines', element: <PipelinesPage /> },
              { path: '/inbox/channels', element: <ChannelSettingsPage /> },
              { path: '/inbox/templates', element: <MessageTemplatesPage /> }
            ]
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
