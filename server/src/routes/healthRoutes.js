import { Router } from 'express';
import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { getJobWorkerState } from '../modules/jobs/JobWorker.js';
import { getStorageProvider } from '../modules/storage/index.js';

const router = Router();

router.get('/', async (req, res) => {
  const mongoConnected = mongoose.connection.readyState === 1;
  const [pendingJobs, failedJobs, deadJobs] = mongoConnected
    ? await Promise.all([
        Job.countDocuments({ status: { $in: ['pending', 'processing'] } }),
        Job.countDocuments({ status: 'failed' }),
        Job.countDocuments({ status: 'dead' })
      ]).catch(() => [null, null, null])
    : [null, null, null];
  res.status(mongoConnected ? 200 : 503).json({
    status: mongoConnected ? 'ok' : 'degraded',
    service: 'multi-tenant-mern-server',
    api: 'ok',
    mongodb: mongoConnected ? 'connected' : 'disconnected',
    worker: getJobWorkerState(),
    jobs: { pending: pendingJobs, failed: failedJobs, dead: deadJobs },
    storage: {
      provider: getStorageProvider().name,
      maxSizeMb: Number(process.env.MEDIA_MAX_SIZE_MB || 25)
    },
    realtimeEnabled: process.env.REALTIME_ENABLED !== 'false',
    whatsappSignatureRequired: process.env.REQUIRE_WEBHOOK_SIGNATURE === 'true',
    alertsEnabled: process.env.ALERTS_ENABLED !== 'false',
    version: process.env.npm_package_version || '0.1.0',
    timestamp: new Date().toISOString()
  });
});

export default router;
