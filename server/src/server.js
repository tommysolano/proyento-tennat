import { loadEnv, validateEnv } from './config/env.js';
import { connectDB } from './config/db.js';
import { seedDemoData } from './data/demoData.js';
import { startJobWorker } from './modules/jobs/JobWorker.js';
import { logger } from './utils/logger.js';

loadEnv();

const port = process.env.PORT || 4000;

try {
  validateEnv();
  await connectDB();
  const { app } = await import('./app.js');

  if (process.env.DEMO_SEED === 'true') {
    const result = await seedDemoData();
    logger.info('demo.seed_ready', { result });
  }

  const worker = startJobWorker();
  const server = app.listen(port, () => {
    logger.info('server.started', { port });
  });
  async function shutdown(signal) {
    logger.info('server.shutdown', { signal });
    server.close();
    await worker?.stop?.();
    process.exit(0);
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
} catch (error) {
  logger.error('server.start_failed', error);
  process.exit(1);
}
