import { loadEnv, validateEnv } from './config/env.js';
import { connectDB } from './config/db.js';
import { ensureSuperAdmin } from './data/superAdminBootstrap.js';
import { startJobWorker } from './modules/jobs/JobWorker.js';
import { logger } from './utils/logger.js';
import { WhatsAppQrSessionManager } from './modules/conversations/WhatsAppQrSessionManager.js';
import { warnWhatsAppQrConfig } from './modules/conversations/whatsappQrConfig.js';

loadEnv();

const port = process.env.PORT || 4000;

try {
  validateEnv();
  await connectDB();

  if (
    process.env.NODE_ENV === 'production' ||
    process.env.SUPERADMIN_EMAIL ||
    process.env.SUPERADMIN_PASSWORD
  ) {
    const { user, created } = await ensureSuperAdmin();
    logger.info('superadmin.bootstrap_complete', {
      userId: user._id,
      email: user.email,
      created
    });
  } else {
    logger.warn('superadmin.bootstrap_skipped', {
      reason: 'SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD no estan configurados'
    });
  }

  const { app } = await import('./app.js');

  const worker = startJobWorker();
  // Aviso claro si el QR esta activado pero la clave de cifrado falta/es debil.
  warnWhatsAppQrConfig();
  // Auto-restore: reconecta sesiones con authState guardado (Mongo ya conectado).
  await WhatsAppQrSessionManager.restoreSessions();
  const server = app.listen(port, () => {
    logger.info('server.started', { port });
  });
  async function shutdown(signal) {
    logger.info('server.shutdown', { signal });
    server.close();
    await worker?.stop?.();
    await WhatsAppQrSessionManager.stop();
    process.exit(0);
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
} catch (error) {
  logger.error('server.start_failed', error);
  process.exit(1);
}
