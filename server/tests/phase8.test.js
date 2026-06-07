import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { hasPermission } from '../src/core/permissions/permissions.js';
import { MODULE_REGISTRY } from '../src/core/modules/moduleRegistry.js';
import { Job } from '../src/models/Job.js';
import { Notification } from '../src/models/Notification.js';
import { OperationalAlert } from '../src/models/OperationalAlert.js';
import { Workflow } from '../src/models/Workflow.js';
import { WorkflowEvent } from '../src/models/WorkflowEvent.js';
import { WorkflowRun } from '../src/models/WorkflowRun.js';
import {
  CONDITION_OPERATORS,
  PLANNED_ACTIONS,
  WORKFLOW_ACTIONS,
  WORKFLOW_TRIGGERS
} from '../src/modules/workflows/workflowCatalog.js';
import {
  evaluateCondition,
  isSafeWorkflowPath,
  validateWorkflowDefinition
} from '../src/modules/workflows/workflowValidation.js';

const objectId = () => new mongoose.Types.ObjectId();

function validDefinition() {
  return {
    trigger: {
      type: 'event',
      eventType: 'contact.created',
      sourceModule: 'contacts',
      config: {}
    },
    conditions: [
      { field: 'entity.status', operator: 'equals', value: 'nuevo' }
    ],
    actions: [
      { type: 'activity_log.create', config: { summary: 'Contacto recibido' }, enabled: true }
    ]
  };
}

test('workflow catalog exposes the required internal surface and planned external actions', () => {
  for (const eventType of [
    'contact.created',
    'contact.status_changed',
    'opportunity.stage_changed',
    'task.completed',
    'message.inbound_received',
    'appointment.created',
    'appointment.no_show',
    'invoice.paid',
    'job.dead'
  ]) {
    assert.equal(WORKFLOW_TRIGGERS.some((item) => item.eventType === eventType), true);
  }
  for (const actionType of [
    'contact.update_status',
    'opportunity.move_stage',
    'task.create',
    'conversation.close',
    'appointment.create_internal_reminder',
    'delay.wait_minutes'
  ]) {
    assert.equal(WORKFLOW_ACTIONS.some((item) => item.type === actionType), true);
  }
  assert.equal(PLANNED_ACTIONS.some((item) => item.type === 'webhook.call'), true);
  assert.equal(CONDITION_OPERATORS.includes('greater_or_equal'), true);
});

test('workflow paths and conditions reject prototype or credential traversal', () => {
  assert.equal(isSafeWorkflowPath('entity.status'), true);
  assert.equal(isSafeWorkflowPath('payload.credentials.token'), false);
  assert.equal(isSafeWorkflowPath('entity.__proto__.polluted'), false);
  assert.deepEqual(
    evaluateCondition(
      { field: 'entity.value', operator: 'greater_than', value: 10 },
      { event: {}, payload: {}, entity: { value: 25 } }
    ).matched,
    true
  );
  assert.throws(
    () => validateWorkflowDefinition({
      ...validDefinition(),
      conditions: [{ field: 'payload.secret', operator: 'exists' }]
    }),
    /Ruta de condicion no permitida/
  );
  assert.throws(
    () => validateWorkflowDefinition({
      ...validDefinition(),
      actions: [{ type: 'webhook.call', config: { url: 'https://example.com' } }]
    }),
    /Accion no implementada/
  );
});

test('workflow documents validate defaults and hide durable event payloads', async () => {
  const companyId = objectId();
  const userId = objectId();
  const definition = validDefinition();
  const workflow = new Workflow({
    companyId,
    name: 'Alta de contacto',
    ...definition,
    createdBy: userId
  });
  await workflow.validate();
  assert.equal(workflow.status, 'draft');
  assert.equal(workflow.settings.preventSelfTrigger, true);
  assert.equal(workflow.settings.maxChainDepth, 5);

  const event = new WorkflowEvent({
    companyId,
    eventType: 'contact.created',
    sourceModule: 'contacts',
    entityType: 'contact',
    entityId: objectId(),
    idempotencyKey: 'phase8-event',
    payload: { password: 'hidden', name: 'Visible' }
  });
  await event.validate();
  assert.equal(event.payload.password, '[REDACTED]');
  assert.equal('payload' in event.toJSON(), false);

  const run = new WorkflowRun({
    companyId,
    workflowId: workflow._id,
    workflowVersion: 1,
    eventType: 'contact.created',
    entityType: 'contact',
    entityId: event.entityId,
    idempotencyKey: 'phase8-run',
    error: { token: 'hidden' }
  });
  await run.validate();
  assert.equal(run.error.token, '[REDACTED]');
});

test('phase 8 roles, modules, jobs, notifications and alerts preserve boundaries', async () => {
  assert.equal(hasPermission('ADMIN', 'workflows:manage'), true);
  assert.equal(hasPermission('ADMIN', 'workflow_runs:read'), true);
  assert.equal(hasPermission('SUPERVISOR', 'workflows:read_team'), true);
  assert.equal(hasPermission('SUPERVISOR', 'workflows:manage'), false);
  assert.equal(hasPermission('CALLCENTER', 'workflows:read_team'), false);
  for (const key of ['automations', 'workflows']) {
    const module = MODULE_REGISTRY.find((item) => item.key === key);
    assert.equal(module?.status, 'active');
    assert.equal(module?.enabledByDefault, true);
  }
  await new Job({
    type: 'workflow.run',
    payload: { runId: objectId() },
    companyId: objectId()
  }).validate();
  await new Notification({
    companyId: objectId(),
    userId: objectId(),
    type: 'workflow_completed',
    title: 'Workflow completado'
  }).validate();
  await new OperationalAlert({
    scopeType: 'company',
    scopeId: objectId(),
    companyId: objectId(),
    severity: 'critical',
    type: 'workflow_failure',
    title: 'Workflow fallido',
    message: 'Error sanitizado'
  }).validate();
});
