import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import activityLogRoutes from './routes/activityLogRoutes.js';
import authRoutes from './routes/authRoutes.js';
import channelConfigRoutes from './routes/channelConfigRoutes.js';
import companyRoutes from './routes/companyRoutes.js';
import companyPortalRoutes from './routes/companyPortalRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import conversationRoutes from './routes/conversationRoutes.js';
import distributorRoutes from './routes/distributorRoutes.js';
import distributorCommercialRoutes from './routes/distributorCommercialRoutes.js';
import planRoutes from './routes/planRoutes.js';
import platformBillingRoutes from './routes/platformBillingRoutes.js';
import superAdminRoutes from './routes/superAdminRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import userRoutes from './routes/userRoutes.js';
import crmCatalogRoutes from './routes/crmCatalogRoutes.js';
import crmDashboardRoutes from './routes/crmDashboardRoutes.js';
import noteRoutes from './routes/noteRoutes.js';
import opportunityRoutes from './routes/opportunityRoutes.js';
import pipelineRoutes from './routes/pipelineRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import messageTemplateRoutes from './routes/messageTemplateRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import opsRoutes from './routes/opsRoutes.js';
import realtimeRoutes from './routes/realtimeRoutes.js';
import routingRuleRoutes from './routes/routingRuleRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import availabilityRoutes from './routes/availabilityRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import bookingLinkRoutes from './routes/bookingLinkRoutes.js';
import publicBookingRoutes from './routes/publicBookingRoutes.js';
import workflowRoutes from './routes/workflowRoutes.js';
import workflowRunRoutes from './routes/workflowRunRoutes.js';
import formRoutes from './routes/formRoutes.js';
import publicFormRoutes from './routes/publicFormRoutes.js';
import landingPageRoutes from './routes/landingPageRoutes.js';
import publicLandingPageRoutes from './routes/publicLandingPageRoutes.js';
import funnelRoutes, { funnelStepRoutes } from './routes/funnelRoutes.js';
import publicFunnelRoutes from './routes/publicFunnelRoutes.js';
import reputationRoutes from './routes/reputationRoutes.js';
import reviewRequestRoutes from './routes/reviewRequestRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import testimonialRoutes from './routes/testimonialRoutes.js';
import reviewWidgetRoutes from './routes/reviewWidgetRoutes.js';
import publicReviewRoutes, { publicReviewWidgetRoutes } from './routes/publicReviewRoutes.js';
import satisfactionSurveyRoutes from './routes/satisfactionSurveyRoutes.js';
import publicSurveyRoutes from './routes/publicSurveyRoutes.js';
import couponRoutes, { couponRedemptionRoutes } from './routes/couponRoutes.js';
import referralProgramRoutes, { referralRoutes } from './routes/referralRoutes.js';
import publicReferralRoutes from './routes/publicReferralRoutes.js';
import { logger } from './utils/logger.js';
import { sanitizeError, sanitizeUrl } from './utils/sanitize.js';

export const app = express();

function corsOrigins() {
  const configured = [
    process.env.CLIENT_URL,
    ...(process.env.CORS_ORIGINS || '').split(',')
  ]
    .map((value) => String(value || '').trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (process.env.NODE_ENV !== 'production') {
    configured.push('http://localhost:5173', 'http://127.0.0.1:5173');
  }
  return new Set(configured);
}

const allowedOrigins = corsOrigins();

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) {
        return callback(null, true);
      }
      return callback(Object.assign(new Error('Origen no permitido por CORS'), { status: 403 }));
    },
    credentials: true
  })
);
app.use(
  express.json({
    limit: '2mb',
    verify: (req, res, buffer) => {
      if (req.originalUrl.startsWith('/api/webhooks/whatsapp/')) {
        req.rawBody = Buffer.from(buffer);
      }
    }
  })
);
morgan.token('safe-url', (req) => sanitizeUrl(req.originalUrl));
app.use(morgan(':method :safe-url :status :response-time ms - :res[content-length]'));

app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/superadmin', superAdminRoutes);
app.use('/api/billing', platformBillingRoutes);
app.use('/api/distributor', distributorCommercialRoutes);
app.use('/api/company', companyPortalRoutes);
app.use('/api/users', userRoutes);
app.use('/api/distributors', distributorRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/crm', crmCatalogRoutes);
app.use('/api/crm', crmDashboardRoutes);
app.use('/api/pipelines', pipelineRoutes);
app.use('/api/opportunities', opportunityRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/message-templates', messageTemplateRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/channel-configs', channelConfigRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/routing-rules', routingRuleRoutes);
app.use('/api/ops', opsRoutes);
app.use('/api/calendars', calendarRoutes);
app.use('/api', availabilityRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/booking-links', bookingLinkRoutes);
app.use('/api/public/booking', publicBookingRoutes);
app.use('/api/public/bookings', publicBookingRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/workflow-runs', workflowRunRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/public/forms', publicFormRoutes);
app.use('/api/landing-pages', landingPageRoutes);
app.use('/api/public/pages', publicLandingPageRoutes);
app.use('/api/funnels', funnelRoutes);
app.use('/api/funnel-steps', funnelStepRoutes);
app.use('/api/public/funnels', publicFunnelRoutes);
app.use('/api/reputation', reputationRoutes);
app.use('/api/review-requests', reviewRequestRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/testimonials', testimonialRoutes);
app.use('/api/review-widgets', reviewWidgetRoutes);
app.use('/api/public/reviews', publicReviewRoutes);
app.use('/api/public/review-widgets', publicReviewWidgetRoutes);
app.use('/api/satisfaction-surveys', satisfactionSurveyRoutes);
app.use('/api/public/surveys', publicSurveyRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/coupon-redemptions', couponRedemptionRoutes);
app.use('/api/referral-programs', referralProgramRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/public/referrals', publicReferralRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

app.use((error, req, res, next) => {
  logger.error('http.request_failed', error, {
    method: req.method,
    path: req.originalUrl,
    userId: req.user?._id,
    companyId: req.user?.companyId
  });
  const status =
    error.status ||
    (error.code === 11000
      ? 409
      : error.code === 'LIMIT_FILE_SIZE'
        ? 413
        : error.name === 'MulterError' ||
            error.name === 'ValidationError' ||
            error.name === 'CastError'
          ? 400
          : 500);
  const duplicateField = error.code === 11000 ? Object.keys(error.keyPattern || {})[0] : null;
  const safeError = sanitizeError(error);
  res.status(status).json({
    message:
      duplicateField
        ? `${duplicateField} ya esta registrado`
        : status >= 500 && process.env.NODE_ENV === 'production'
          ? 'Error interno del servidor'
          : safeError.message || 'Error interno del servidor'
  });
});
