import { randomUUID } from 'node:crypto';
import { Job } from '../../models/Job.js';
import { sanitize, sanitizeError } from '../../utils/sanitize.js';
import { OperationalAlertService } from '../ops/OperationalAlertService.js';

const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

function retryDelay(attempts) {
  return Math.min(5 * 60 * 1000, 1000 * 2 ** Math.max(0, attempts - 1));
}

export class JobService {
  static workerId(prefix = 'worker') {
    return `${prefix}:${process.pid}:${randomUUID()}`;
  }

  static enqueue({
    type,
    payload,
    priority = 0,
    runAt = new Date(),
    maxAttempts = Number(process.env.JOB_MAX_ATTEMPTS || 5),
    companyId = null,
    distributorId = null,
    metadata = {}
  }) {
    return Job.create({
      type,
      payload,
      priority,
      runAt,
      maxAttempts,
      companyId,
      distributorId,
      metadata: sanitize(metadata)
    });
  }

  static async claim(workerId) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - DEFAULT_LOCK_TIMEOUT_MS);
    return Job.findOneAndUpdate(
      {
        runAt: { $lte: now },
        $or: [
          { status: { $in: ['pending', 'failed'] } },
          { status: 'processing', lockedAt: { $lte: staleBefore } }
        ]
      },
      {
        $set: {
          status: 'processing',
          lockedAt: now,
          lockedBy: workerId,
          failedAt: null
        },
        $inc: { attempts: 1 }
      },
      {
        new: true,
        sort: { priority: -1, runAt: 1, createdAt: 1 }
      }
    ).select('+payload');
  }

  static complete(job) {
    return Job.updateOne(
      { _id: job._id, status: 'processing', lockedBy: job.lockedBy },
      {
        $set: {
          status: 'completed',
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: '',
          error: null
        }
      }
    );
  }

  static async fail(job, error) {
    const terminal = error?.retryable === false || job.attempts >= job.maxAttempts;
    const now = new Date();
    await Job.updateOne(
      { _id: job._id, status: 'processing', lockedBy: job.lockedBy },
      {
        $set: {
          status: terminal ? 'dead' : 'failed',
          runAt: terminal ? job.runAt : new Date(now.getTime() + retryDelay(job.attempts)),
          failedAt: now,
          lockedAt: null,
          lockedBy: '',
          error: sanitizeError(error)
        }
      }
    );
    if (terminal) {
      await OperationalAlertService.create({
        companyId: job.companyId,
        distributorId: job.distributorId,
        severity: 'critical',
        type: 'dead_jobs',
        title: `Job ${job.type} en dead`,
        message: error?.message || 'El job agoto sus reintentos',
        relatedType: 'job',
        relatedId: job._id,
        metadata: { jobType: job.type, attempts: job.attempts }
      }).catch(() => {});
      if (job.companyId) {
        const { WorkflowEventEmitter } = await import(
          '../workflows/WorkflowEventEmitter.js'
        );
        await WorkflowEventEmitter.safelyEmit({
          companyId: job.companyId,
          distributorId: job.distributorId,
          eventType: 'job.dead',
          sourceModule: 'jobs',
          entityType: 'job',
          entityId: job._id,
          idempotencyKey: `job:${job._id}:dead`,
          payload: {
            jobType: job.type,
            attempts: job.attempts,
            error: sanitizeError(error)
          },
          metadata: {
            sourceWorkflowRunId: job.metadata?.runId || null,
            sourceWorkflowId: job.metadata?.workflowId || null
          }
        });
      }
    }
    return { terminal };
  }
}
