import { logger } from '../../utils/logger.js';
import { JobService } from './JobService.js';
import { handleJob, handleTerminalJobFailure } from './jobHandlers.js';

let activeWorker = null;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function startJobWorker() {
  if (process.env.JOB_WORKER_ENABLED === 'false') {
    logger.info('job.worker_disabled');
    return null;
  }
  if (activeWorker) return activeWorker;

  const concurrency = Number(process.env.JOB_WORKER_CONCURRENCY || 2);
  const state = { stopped: false, runners: [] };

  async function run(index) {
    const workerId = JobService.workerId(`job-${index}`);
    while (!state.stopped) {
      let job = null;
      try {
        job = await JobService.claim(workerId);
        if (!job) {
          await wait(500);
          continue;
        }
        logger.info('job.processing', {
          jobId: job._id,
          type: job.type,
          attempt: job.attempts,
          companyId: job.companyId
        });
        await handleJob(job);
        await JobService.complete(job);
        logger.info('job.completed', { jobId: job._id, type: job.type });
      } catch (error) {
        if (!job) {
          logger.error('job.worker_error', error, { workerId });
          await wait(1000);
          continue;
        }
        const { terminal } = await JobService.fail(job, error);
        if (terminal) await handleTerminalJobFailure(job, error).catch(() => {});
        logger.error('job.failed', error, {
          jobId: job._id,
          type: job.type,
          attempt: job.attempts,
          terminal
        });
      }
    }
  }

  state.runners = Array.from({ length: concurrency }, (_, index) => run(index));
  state.stop = async () => {
    state.stopped = true;
    await Promise.allSettled(state.runners);
    activeWorker = null;
  };
  activeWorker = state;
  logger.info('job.worker_started', { concurrency });
  return state;
}

export function getJobWorkerState() {
  return {
    enabled: process.env.JOB_WORKER_ENABLED !== 'false',
    running: Boolean(activeWorker && !activeWorker.stopped),
    concurrency: Number(process.env.JOB_WORKER_CONCURRENCY || 2)
  };
}
