import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute.jsx';
import { RoleBasedRoute } from '../components/RoleBasedRoute.jsx';
import { Layout } from '../layouts/Layout.jsx';
import { Login } from '../pages/Login.jsx';
import { NotFound } from '../pages/NotFound.jsx';
import { AdminDashboard } from '../pages/admin/AdminDashboard.jsx';
import { CallCenterDashboard } from '../pages/callcenter/CallCenterDashboard.jsx';
import { CompanyDetailForDistributor } from '../pages/distributor/CompanyDetailForDistributor.jsx';
import {
  DistributorAdminsPage,
  DistributorBrandingPage,
  DistributorCompaniesPage,
  DistributorDashboardPage,
  DistributorFinancePage,
  DistributorInvoicesPage,
  DistributorModulesPage,
  DistributorOnboardingPage,
  DistributorPaymentsPage,
  DistributorPlansPage,
  DistributorPlatformPage,
  DistributorSettingsPage,
  DistributorSubscriptionsPage
} from '../pages/distributor/DistributorPages.jsx';
import { SupervisorDashboard } from '../pages/supervisor/SupervisorDashboard.jsx';
import {
  SuperAdminAuditPage,
  SuperAdminBillingPage,
  SuperAdminDistributorsPage,
  SuperAdminModulesPage,
  SuperAdminOverviewPage,
  SuperAdminPlansPage,
  SuperAdminSubscriptionsPage
} from '../pages/superadmin/SuperAdminPages.jsx';
import {
  DISTRIBUTOR_HASH_ROUTES,
  HashRedirect,
  SUPERADMIN_HASH_ROUTES
} from './HashRedirect.jsx';
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
import { WhatsAppNumbersPage } from '../pages/inbox/WhatsAppNumbersPage.jsx';
import { MessageTemplatesPage } from '../pages/inbox/MessageTemplatesPage.jsx';
import { NotificationsPage } from '../pages/inbox/NotificationsPage.jsx';
import { RoutingRulesPage } from '../pages/inbox/RoutingRulesPage.jsx';
import { CommunicationSettingsPage } from '../pages/inbox/CommunicationSettingsPage.jsx';
import { OpsPage } from '../pages/ops/OpsPage.jsx';
import { CalendarPage } from '../pages/calendar/CalendarPage.jsx';
import { CalendarSettingsPage } from '../pages/calendar/CalendarSettingsPage.jsx';
import { PublicBookingPage } from '../pages/calendar/PublicBookingPage.jsx';
import {
  WorkflowBuilderPage,
  WorkflowRunsPage,
  WorkflowsPage
} from '../pages/workflows/WorkflowsPage.jsx';
import {
  FormBuilderPage,
  FormsPage,
  PublicFormPage
} from '../pages/marketing/FormsPage.jsx';
import {
  LandingPageBuilderPage,
  LandingPagesPage,
  PublicLandingPage
} from '../pages/marketing/LandingPagesPage.jsx';
import {
  FunnelBuilderPage,
  FunnelsPage,
  PublicFunnelPage
} from '../pages/marketing/FunnelsPage.jsx';
import {
  CampaignsPage,
  IntegrationsPage,
  MarketingReportsPage
} from '../pages/marketing/MarketingOperationsPage.jsx';
import {
  ReputationPage,
  ReviewRequestsPage,
  ReviewsPage,
  ReviewWidgetsPage,
  SurveysPage,
  TestimonialsPage
} from '../pages/reputation/ReputationPages.jsx';
import { CouponsPage, ReferralsPage } from '../pages/reputation/LoyaltyPages.jsx';
import {
  PublicReferralPage,
  PublicReviewPage,
  PublicReviewWidgetPage,
  PublicSurveyPage
} from '../pages/reputation/PublicReputationPages.jsx';

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
    path: '/book/:slug',
    element: <PublicBookingPage />
  },
  {
    path: '/forms/:slug',
    element: <PublicFormPage />
  },
  {
    path: '/p/:slug',
    element: <PublicLandingPage />
  },
  {
    path: '/f/:funnelSlug',
    element: <PublicFunnelPage />
  },
  {
    path: '/f/:funnelSlug/:stepSlug',
    element: <PublicFunnelPage />
  },
  {
    path: '/r/:token',
    element: <PublicReviewPage />
  },
  {
    path: '/widgets/reviews/:slug',
    element: <PublicReviewWidgetPage />
  },
  {
    path: '/surveys/:slug',
    element: <PublicSurveyPage />
  },
  {
    path: '/ref/:programSlug/:code',
    element: <PublicReferralPage />
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <Layout />,
        children: [
          {
            element: <RoleBasedRoute allowedRoles={['SUPERADMIN', 'ADMIN']} />,
            children: [{ path: '/ops', element: <OpsPage /> }]
          },
          {
            element: <RoleBasedRoute allowedRoles={['SUPERADMIN']} />,
            children: [
              {
                path: '/superadmin',
                element: (
                  <HashRedirect map={SUPERADMIN_HASH_ROUTES}>
                    <SuperAdminOverviewPage />
                  </HashRedirect>
                )
              },
              { path: '/superadmin/distributors', element: <SuperAdminDistributorsPage /> },
              { path: '/superadmin/platform-plans', element: <SuperAdminPlansPage /> },
              { path: '/superadmin/subscriptions', element: <SuperAdminSubscriptionsPage /> },
              { path: '/superadmin/billing', element: <SuperAdminBillingPage /> },
              { path: '/superadmin/modules', element: <SuperAdminModulesPage /> },
              { path: '/superadmin/audit', element: <SuperAdminAuditPage /> }
            ]
          },
          {
            element: <RoleBasedRoute allowedRoles={['DISTRIBUTOR']} />,
            children: [
              {
                path: '/distributor/dashboard',
                element: (
                  <HashRedirect map={DISTRIBUTOR_HASH_ROUTES}>
                    <DistributorDashboardPage />
                  </HashRedirect>
                )
              },
              { path: '/distributor/admins', element: <DistributorAdminsPage /> },
              { path: '/distributor/plans', element: <DistributorPlansPage /> },
              { path: '/distributor/subscriptions', element: <DistributorSubscriptionsPage /> },
              { path: '/distributor/modules', element: <DistributorModulesPage /> },
              { path: '/distributor/platform', element: <DistributorPlatformPage /> },
              { path: '/distributor/companies', element: <DistributorCompaniesPage /> },
              { path: '/distributor/companies/:id', element: <CompanyDetailForDistributor /> },
              { path: '/distributor/finance', element: <DistributorFinancePage /> },
              { path: '/distributor/invoices', element: <DistributorInvoicesPage /> },
              { path: '/distributor/payments', element: <DistributorPaymentsPage /> },
              { path: '/distributor/branding', element: <DistributorBrandingPage /> },
              { path: '/distributor/settings', element: <DistributorSettingsPage /> },
              { path: '/distributor/onboarding', element: <DistributorOnboardingPage /> }
            ]
          },
          {
            element: <RoleBasedRoute allowedRoles={['ADMIN']} />,
            children: [
              { path: '/admin/dashboard', element: <AdminDashboard /> },
              { path: '/workflows/new', element: <WorkflowBuilderPage /> },
              { path: '/workflows/:id', element: <WorkflowBuilderPage /> },
              { path: '/marketing', element: <FormsPage /> },
              { path: '/marketing/analytics', element: <FormsPage mode="analytics" /> },
              { path: '/marketing/forms/new', element: <FormBuilderPage /> },
              { path: '/marketing/forms/:id', element: <FormBuilderPage /> },
              { path: '/marketing/landing-pages', element: <LandingPagesPage /> },
              { path: '/marketing/landing-pages/new', element: <LandingPageBuilderPage /> },
              { path: '/marketing/landing-pages/:id', element: <LandingPageBuilderPage /> },
              { path: '/marketing/funnels/:id', element: <FunnelBuilderPage /> },
              { path: '/reputation/testimonials', element: <TestimonialsPage /> },
              { path: '/reputation/widgets', element: <ReviewWidgetsPage /> },
              { path: '/reputation/surveys', element: <SurveysPage /> }
            ]
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
              { path: '/inbox', element: <InboxPage /> },
              { path: '/notifications', element: <NotificationsPage /> },
              { path: '/calendar', element: <CalendarPage /> }
              ,
              { path: '/reputation', element: <ReputationPage /> },
              { path: '/reputation/requests', element: <ReviewRequestsPage /> },
              { path: '/reputation/reviews', element: <ReviewsPage /> },
              { path: '/reputation/coupons', element: <CouponsPage /> }
            ]
          },
          {
            element: <RoleBasedRoute allowedRoles={['ADMIN', 'SUPERVISOR']} />,
            children: [
              { path: '/workflows', element: <WorkflowsPage /> },
              { path: '/workflow-runs', element: <WorkflowRunsPage /> },
              { path: '/marketing/forms', element: <FormsPage /> },
              { path: '/marketing/submissions', element: <FormsPage mode="submissions" /> },
              { path: '/marketing/funnels', element: <FunnelsPage /> }
              ,
              { path: '/marketing/campaigns', element: <CampaignsPage /> },
              { path: '/marketing/integrations', element: <IntegrationsPage /> },
              { path: '/marketing/reports', element: <MarketingReportsPage /> },
              { path: '/inbox/communication-policy', element: <CommunicationSettingsPage /> },
              { path: '/reputation/referrals', element: <ReferralsPage /> }
            ]
          },
          {
            element: <RoleBasedRoute allowedRoles={['ADMIN']} />,
            children: [
              { path: '/crm/tags', element: <TagsPage /> },
              { path: '/crm/custom-fields', element: <CustomFieldsPage /> },
              { path: '/crm/import', element: <ImportContactsPage /> },
              { path: '/crm/pipelines', element: <PipelinesPage /> },
              { path: '/inbox/whatsapp-numbers', element: <WhatsAppNumbersPage /> },
              { path: '/inbox/channels', element: <ChannelSettingsPage /> },
              { path: '/inbox/templates', element: <MessageTemplatesPage /> },
              { path: '/inbox/routing', element: <RoutingRulesPage /> },
              { path: '/calendar/settings', element: <CalendarSettingsPage /> }
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
