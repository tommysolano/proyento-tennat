import { connectDB } from '../config/db.js';
import { loadEnv, validateEnv } from '../config/env.js';
import { ensureSuperAdmin } from './superAdminBootstrap.js';
import { logger } from '../utils/logger.js';

loadEnv();

try {
  validateEnv({ requireSuperAdmin: true });
  await connectDB();
  const { user, created } = await ensureSuperAdmin();
  logger.info('superadmin.bootstrap_complete', {
    userId: user._id,
    email: user.email,
    created
  });
  process.exit(0);
} catch (error) {
  logger.error('superadmin.bootstrap_failed', error);
  process.exit(1);
}
