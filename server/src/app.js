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

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
  })
);
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'multi-tenant-mern-server',
    timestamp: new Date().toISOString()
  });
});

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
app.use('/api/conversations', conversationRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/channel-configs', channelConfigRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

app.use((error, req, res, next) => {
  console.error(error);
  const status =
    error.status ||
    (error.code === 11000 ? 409 : error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500);
  const duplicateField = error.code === 11000 ? Object.keys(error.keyPattern || {})[0] : null;
  res.status(status).json({
    message: duplicateField ? `${duplicateField} ya esta registrado` : error.message || 'Error interno del servidor'
  });
});
