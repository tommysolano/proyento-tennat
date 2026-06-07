import { randomUUID } from 'node:crypto';
import { Appointment } from '../../models/Appointment.js';
import { Contact } from '../../models/Contact.js';
import { Conversation } from '../../models/Conversation.js';
import { Invoice } from '../../models/Invoice.js';
import { Job } from '../../models/Job.js';
import { Message } from '../../models/Message.js';
import { Opportunity } from '../../models/Opportunity.js';
import { Payment } from '../../models/Payment.js';
import { Task } from '../../models/Task.js';
import { User } from '../../models/User.js';
import { Workflow } from '../../models/Workflow.js';
import { WorkflowEvent } from '../../models/WorkflowEvent.js';
import { WorkflowRun } from '../../models/WorkflowRun.js';
import { Form } from '../../models/Form.js';
import { FormSubmission } from '../../models/FormSubmission.js';
import { LandingPage } from '../../models/LandingPage.js';
import { Funnel } from '../../models/Funnel.js';
import { FunnelStep } from '../../models/FunnelStep.js';
import { ConversionEvent } from '../../models/ConversionEvent.js';
import { sanitizeError } from '../../utils/sanitize.js';
import { checkUsageLimit, trackUsage } from '../../utils/usage.js';
import { JobService } from '../jobs/JobService.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { OperationalAlertService } from '../ops/OperationalAlertService.js';
import { RealtimeService } from '../realtime/RealtimeService.js';
import { WorkflowActionExecutor } from './WorkflowActionExecutor.js';
import { evaluateCondition, getSafePath } from './workflowValidation.js';

const ENTITY_MODELS = {
  appointment: Appointment,
  contact: Contact,
  conversation: Conversation,
  invoice: Invoice,
  job: Job,
  message: Message,
  opportunity: Opportunity,
  payment: Payment,
  task: Task,
  form: Form,
  form_submission: FormSubmission,
  landing_page: LandingPage,
  funnel: Funnel,
  funnel_step: FunnelStep,
  conversion_event: ConversionEvent
};

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function delayRunAt(action, context) {
  if (action.type === 'delay.wait_minutes') {
    const minutes = Number(action.config?.minutes);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 525600) {
      throw Object.assign(new Error('minutes debe estar entre 0 y 525600'), {
        retryable: false
      });
    }
    return new Date(Date.now() + minutes * 60000);
  }
  const until = String(action.config?.until || '').replace(
    /^\{\{([^}]+)\}\}$/,
    (_, path) => getSafePath(context, path.trim()) || ''
  );
  const date = new Date(until);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error('until debe ser fecha valida'), { retryable: false });
  }
  return date > new Date() ? date : new Date();
}

export class WorkflowService {
  static async loadEntity(event) {
    const Model = ENTITY_MODELS[event.entityType];
    if (!Model || !event.entityId) return null;
    const filter = { _id: event.entityId };
    if (!['invoice', 'payment', 'job'].includes(event.entityType)) {
      filter.companyId = event.companyId;
    } else if (event.entityType === 'invoice') {
      filter.customerType = 'company';
      filter.customerId = event.companyId;
    } else if (event.entityType === 'payment') {
      filter.payerType = 'company';
      filter.payerId = event.companyId;
    } else {
      filter.companyId = event.companyId;
    }
    return Model.findOne(filter).lean();
  }

  static async actorFor(event, workflow) {
    if (event.actorUserId) {
      const actor = await User.findOne({
        _id: event.actorUserId,
        companyId: event.companyId,
        status: 'active'
      });
      if (actor) return actor;
    }
    const preferred = workflow.createdBy
      ? await User.findOne({
          _id: workflow.createdBy,
          companyId: event.companyId,
          status: 'active'
        })
      : null;
    if (preferred) return preferred;
    return User.findOne({
      companyId: event.companyId,
      role: 'ADMIN',
      status: 'active'
    }).sort({ createdAt: 1 });
  }

  static async emitEvent(input) {
    let event;
    try {
      event = await WorkflowEvent.create({
        companyId: input.companyId,
        distributorId: input.distributorId || null,
        eventType: input.eventType,
        sourceModule: input.sourceModule,
        entityType: input.entityType,
        entityId: input.entityId || null,
        actorUserId: input.actorUserId || null,
        idempotencyKey: input.idempotencyKey || `event:${randomUUID()}`,
        payload: input.payload || {},
        metadata: input.metadata || {}
      });
    } catch (error) {
      if (error.code === 11000) {
        return WorkflowEvent.findOne({
          idempotencyKey: input.idempotencyKey
        });
      }
      throw error;
    }

    try {
      const workflows = await Workflow.find({
        companyId: event.companyId,
        status: 'active',
        'trigger.eventType': event.eventType,
        'trigger.sourceModule': event.sourceModule
      });
      let queued = 0;
      for (const workflow of workflows) {
        if (await this.queueRun(workflow, event)) queued += 1;
      }
      event.status = queued ? 'processed' : 'ignored';
      event.processedAt = new Date();
      event.metadata = { ...(event.metadata || {}), matchedWorkflows: workflows.length, queuedRuns: queued };
      event.markModified('metadata');
      await event.save();
      return event;
    } catch (error) {
      event.status = 'failed';
      event.error = sanitizeError(error);
      event.processedAt = new Date();
      await event.save().catch(() => {});
      throw error;
    }
  }

  static async queueRun(workflow, event) {
    const sourceWorkflowId = event.metadata?.sourceWorkflowId;
    const chainDepth = Number(event.metadata?.chainDepth || 0);
    if (
      workflow.settings.preventSelfTrigger &&
      sourceWorkflowId &&
      String(sourceWorkflowId) === String(workflow._id)
    ) {
      return null;
    }
    if (chainDepth >= workflow.settings.maxChainDepth) return null;

    const baseFilter = {
      workflowId: workflow._id,
      entityType: event.entityType,
      entityId: event.entityId
    };
    if (
      workflow.settings.runOncePerEntity &&
      event.entityId &&
      await WorkflowRun.exists({
        ...baseFilter,
        status: { $in: ['queued', 'running', 'waiting', 'completed'] }
      })
    ) {
      return null;
    }
    if (
      !workflow.settings.allowReentry &&
      event.entityId &&
      await WorkflowRun.exists({
        ...baseFilter,
        status: { $in: ['queued', 'running', 'waiting'] }
      })
    ) {
      return null;
    }
    if (workflow.settings.cooldownMinutes > 0) {
      const after = new Date(Date.now() - workflow.settings.cooldownMinutes * 60000);
      if (await WorkflowRun.exists({ ...baseFilter, createdAt: { $gte: after } })) return null;
    }
    if (workflow.settings.maxRunsPerDay > 0) {
      const count = await WorkflowRun.countDocuments({
        workflowId: workflow._id,
        createdAt: { $gte: startOfUtcDay() }
      });
      if (count >= workflow.settings.maxRunsPerDay) return null;
    }

    await checkUsageLimit({
      companyId: workflow.companyId,
      distributorId: workflow.distributorId,
      metric: 'workflow_runs'
    });
    const idempotencyKey = `workflow:${workflow._id}:event:${event._id}`;
    let run;
    try {
      run = await WorkflowRun.create({
        companyId: workflow.companyId,
        distributorId: workflow.distributorId,
        workflowId: workflow._id,
        workflowVersion: workflow.version,
        status: 'queued',
        triggerType: workflow.trigger.type,
        eventType: event.eventType,
        eventId: event._id,
        entityType: event.entityType,
        entityId: event.entityId,
        actorUserId: event.actorUserId,
        idempotencyKey,
        metadata: { cursor: 0, chainDepth }
      });
    } catch (error) {
      if (error.code === 11000) return null;
      throw error;
    }
    await Promise.all([
      JobService.enqueue({
        type: 'workflow.run',
        payload: { runId: run._id },
        companyId: run.companyId,
        distributorId: run.distributorId,
        metadata: { workflowId: workflow._id, runId: run._id }
      }),
      trackUsage({
        companyId: workflow.companyId,
        distributorId: workflow.distributorId,
        metric: 'workflow_runs',
        metadata: { workflowId: workflow._id, runId: run._id }
      })
    ]);
    RealtimeService.publish('workflow.run_queued', {
      companyId: run.companyId,
      data: { workflowId: workflow._id, runId: run._id, eventType: event.eventType }
    });
    return run;
  }

  static async executeWorkflowRun(runId) {
    const run = await WorkflowRun.findById(runId);
    if (!run || ['completed', 'failed', 'skipped', 'cancelled'].includes(run.status)) {
      return run;
    }
    const [workflow, event] = await Promise.all([
      Workflow.findOne({ _id: run.workflowId, companyId: run.companyId }),
      WorkflowEvent.findOne({ _id: run.eventId, companyId: run.companyId }).select('+payload')
    ]);
    if (!workflow || !event) {
      throw Object.assign(new Error('Workflow o evento no disponible'), { retryable: false });
    }
    if (workflow.status !== 'active') {
      run.status = 'skipped';
      run.completedAt = new Date();
      run.error = { message: `Workflow ${workflow.status}` };
      await run.save();
      return run;
    }
    const entity = await this.loadEntity(event);
    const actor = await this.actorFor(event, workflow);
    if (!actor) {
      throw Object.assign(new Error('No existe actor interno para ejecutar el workflow'), {
        retryable: false
      });
    }
    const context = {
      companyId: run.companyId,
      distributorId: run.distributorId,
      workflowId: workflow._id,
      runId: run._id,
      event: event.toObject({ getters: false }),
      payload: event.payload || {},
      entity: entity || {},
      actor,
      chainDepth: Number(run.metadata?.chainDepth || 0)
    };
    const started = Date.now();
    run.status = 'running';
    run.startedAt ||= new Date();
    await run.save();

    try {
      const cursor = Number(run.metadata?.cursor || 0);
      if (cursor === 0) {
        run.matchedConditions = (workflow.conditions || []).map((condition) =>
          evaluateCondition(condition.toObject(), context)
        );
        if (run.matchedConditions.some((item) => !item.matched)) {
          run.status = 'skipped';
          run.completedAt = new Date();
          run.durationMs = Date.now() - started;
          await run.save();
          return run;
        }
      }

      for (let index = cursor; index < workflow.actions.length; index += 1) {
        const action = workflow.actions[index];
        if (!action.enabled) {
          run.executedActions.push({
            actionIndex: index,
            actionType: action.type,
            status: 'skipped',
            completedAt: new Date()
          });
          continue;
        }
        const actionStarted = Date.now();
        await checkUsageLimit({
          companyId: run.companyId,
          distributorId: run.distributorId,
          metric: 'workflow_actions'
        });
        await trackUsage({
          companyId: run.companyId,
          distributorId: run.distributorId,
          metric: 'workflow_actions',
          metadata: { workflowId: workflow._id, runId: run._id, actionType: action.type }
        });
        if (['delay.wait_minutes', 'delay.wait_until'].includes(action.type)) {
          const runAt = delayRunAt(action, context);
          run.executedActions.push({
            actionIndex: index,
            actionType: action.type,
            status: 'scheduled',
            result: { runAt },
            completedAt: new Date(),
            durationMs: Date.now() - actionStarted
          });
          run.status = 'waiting';
          run.metadata = { ...(run.metadata || {}), cursor: index + 1, waitingUntil: runAt };
          run.markModified('metadata');
          await run.save();
          await JobService.enqueue({
            type: 'workflow.run',
            payload: { runId: run._id },
            runAt,
            companyId: run.companyId,
            distributorId: run.distributorId,
            metadata: { workflowId: workflow._id, runId: run._id, resumed: true }
          });
          return run;
        }

        try {
          const result = await WorkflowActionExecutor.execute(action, context);
          run.executedActions.push({
            actionIndex: index,
            actionType: action.type,
            status: 'completed',
            result,
            completedAt: new Date(),
            durationMs: Date.now() - actionStarted
          });
        } catch (error) {
          run.executedActions.push({
            actionIndex: index,
            actionType: action.type,
            status: 'failed',
            error: sanitizeError(error),
            completedAt: new Date(),
            durationMs: Date.now() - actionStarted
          });
          if (workflow.settings.stopOnError) throw error;
        }
        run.metadata = { ...(run.metadata || {}), cursor: index + 1 };
        run.markModified('metadata');
        await run.save();
      }

      run.status = 'completed';
      run.completedAt = new Date();
      run.durationMs = Date.now() - started;
      run.error = null;
      workflow.lastRunAt = run.completedAt;
      await Promise.all([run.save(), workflow.save()]);
      if (workflow.settings.notifyOnComplete) {
        await NotificationService.create({
          companyId: run.companyId,
          distributorId: run.distributorId,
          userId: actor._id,
          type: 'workflow_completed',
          title: `Workflow completado: ${workflow.name}`,
          body: `${run.executedActions.length} acciones procesadas`,
          relatedType: 'workflow_run',
          relatedId: run._id
        });
      }
      RealtimeService.publish('workflow.run_completed', {
        companyId: run.companyId,
        data: { workflowId: workflow._id, runId: run._id, status: run.status }
      });
      return run;
    } catch (error) {
      if (error.retryable !== false) {
        run.status = 'queued';
        run.error = sanitizeError(error);
        await run.save();
        throw error;
      }
      await this.markTerminalFailure(run._id, error, { actor, workflow });
      throw error;
    }
  }

  static async markTerminalFailure(runId, error, loaded = {}) {
    const run = await WorkflowRun.findById(runId);
    if (!run || ['completed', 'failed', 'skipped', 'cancelled'].includes(run.status)) {
      return run;
    }
    const workflow = loaded.workflow || await Workflow.findById(run.workflowId);
    const actor = loaded.actor || (
      run.actorUserId
        ? await User.findOne({ _id: run.actorUserId, companyId: run.companyId })
        : null
    ) || await User.findOne({
      companyId: run.companyId,
      role: 'ADMIN',
      status: 'active'
    }).sort({ createdAt: 1 });
    run.status = 'failed';
    run.failedAt = new Date();
    run.durationMs = run.startedAt ? Date.now() - run.startedAt.getTime() : 0;
    run.error = sanitizeError(error);
    await run.save();
    await OperationalAlertService.create({
      companyId: run.companyId,
      distributorId: run.distributorId,
      severity: 'critical',
      type: 'workflow_failure',
      title: `Workflow fallido: ${workflow?.name || run.workflowId}`,
      message: error.message,
      relatedType: 'workflow_run',
      relatedId: run._id,
      metadata: { workflowId: run.workflowId, eventType: run.eventType }
    }).catch(() => {});
    if (actor) {
      await NotificationService.create({
        companyId: run.companyId,
        distributorId: run.distributorId,
        userId: actor._id,
        type: 'workflow_failed',
        title: `Workflow fallido: ${workflow?.name || run.workflowId}`,
        body: error.message,
        relatedType: 'workflow_run',
        relatedId: run._id
      }).catch(() => {});
    }
    RealtimeService.publish('workflow.run_failed', {
      companyId: run.companyId,
      data: { workflowId: run.workflowId, runId: run._id, status: run.status }
    });
    return run;
  }

  static async preview(workflow, input = {}) {
    const event = {
      companyId: workflow.companyId,
      distributorId: workflow.distributorId,
      eventType: input.eventType || workflow.trigger.eventType,
      sourceModule: workflow.trigger.sourceModule,
      entityType: input.entityType || workflow.trigger.eventType.split('.')[0],
      entityId: input.entityId || null,
      actorUserId: input.actorUserId || null,
      payload: input.payload || {},
      metadata: { dryRun: true }
    };
    const entity = await this.loadEntity(event);
    const context = { event, entity: entity || {}, payload: event.payload };
    const conditions = (workflow.conditions || []).map((condition) =>
      evaluateCondition(condition.toObject?.() || condition, context)
    );
    return {
      dryRun: true,
      matched: conditions.every((item) => item.matched),
      conditions,
      actions: (workflow.actions || [])
        .filter((action) => action.enabled !== false)
        .map((action, index) => ({
          index,
          type: action.type,
          config: action.config,
          wouldExecute: conditions.every((item) => item.matched)
        }))
    };
  }
}
