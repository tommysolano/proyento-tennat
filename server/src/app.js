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
import { logger } from './utils/logger.js';
import { sanitizeError, sanitizeUrl } from './utils/sanitize.js';

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
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
