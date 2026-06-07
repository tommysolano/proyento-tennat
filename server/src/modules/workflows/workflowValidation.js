import mongoose from 'mongoose';
import { CONDITION_OPERATORS, WORKFLOW_ACTIONS, WORKFLOW_TRIGGERS } from './workflowCatalog.js';

const BLOCKED_PATH_SEGMENTS = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'password',
  'credentials',
  'token',
  'secret',
  'providerPayload'
]);

export function isSafeWorkflowPath(path) {
  if (typeof path !== 'string' || path.length > 160) return false;
  const segments = path.split('.');
  if (!['event', 'entity', 'payload'].includes(segments[0])) return false;
  return segments.every(
    (segment) =>
      /^[A-Za-z0-9_]+$/.test(segment) &&
      !BLOCKED_PATH_SEGMENTS.has(segment.toLowerCase())
  );
}

export function getSafePath(context, path) {
  if (!isSafeWorkflowPath(path)) return undefined;
  return path.split('.').reduce((value, key) => value?.[key], context);
}

export function evaluateCondition(condition, context) {
  const actual = getSafePath(context, condition.field);
  const expected = condition.value;
  let matched = false;
  switch (condition.operator) {
    case 'equals': matched = String(actual ?? '') === String(expected ?? ''); break;
    case 'not_equals': matched = String(actual ?? '') !== String(expected ?? ''); break;
    case 'contains': matched = Array.isArray(actual)
      ? actual.map(String).includes(String(expected))
      : String(actual ?? '').includes(String(expected ?? '')); break;
    case 'not_contains': matched = Array.isArray(actual)
      ? !actual.map(String).includes(String(expected))
      : !String(actual ?? '').includes(String(expected ?? '')); break;
    case 'in': matched = Array.isArray(expected) && expected.map(String).includes(String(actual)); break;
    case 'not_in': matched = Array.isArray(expected) && !expected.map(String).includes(String(actual)); break;
    case 'exists': matched = actual !== undefined && actual !== null && actual !== ''; break;
    case 'not_exists': matched = actual === undefined || actual === null || actual === ''; break;
    case 'greater_than': matched = Number(actual) > Number(expected); break;
    case 'greater_or_equal': matched = Number(actual) >= Number(expected); break;
    case 'less_than': matched = Number(actual) < Number(expected); break;
    case 'less_or_equal': matched = Number(actual) <= Number(expected); break;
    case 'before': matched = new Date(actual).getTime() < new Date(expected).getTime(); break;
    case 'after': matched = new Date(actual).getTime() > new Date(expected).getTime(); break;
    default: matched = false;
  }
  return {
    field: condition.field,
    operator: condition.operator,
    expected,
    actual,
    matched
  };
}

function assertObjectId(value, field) {
  if (value && !mongoose.isValidObjectId(value)) {
    throw Object.assign(new Error(`${field} debe ser ObjectId valido`), { status: 400 });
  }
}

export function validateWorkflowDefinition(input, { requireActions = false } = {}) {
  const trigger = WORKFLOW_TRIGGERS.find(
    (item) => item.eventType === input?.trigger?.eventType
  );
  if (
    !trigger ||
    trigger.status !== 'active' ||
    trigger.sourceModule !== input?.trigger?.sourceModule
  ) {
    throw Object.assign(new Error('Trigger no soportado o sourceModule incorrecto'), {
      status: 400
    });
  }
  for (const condition of input.conditions || []) {
    if (!isSafeWorkflowPath(condition.field)) {
      throw Object.assign(new Error(`Ruta de condicion no permitida: ${condition.field}`), {
        status: 400
      });
    }
    if (!CONDITION_OPERATORS.includes(condition.operator)) {
      throw Object.assign(new Error(`Operador no soportado: ${condition.operator}`), {
        status: 400
      });
    }
  }
  if (requireActions && !(input.actions || []).some((item) => item.enabled !== false)) {
    throw Object.assign(new Error('Un workflow activo requiere al menos una accion'), {
      status: 400
    });
  }
  for (const action of input.actions || []) {
    const definition = WORKFLOW_ACTIONS.find((item) => item.type === action.type);
    if (!definition) {
      throw Object.assign(new Error(`Accion no implementada: ${action.type}`), {
        status: 400
      });
    }
    for (const field of definition.requiredConfig) {
      if (action.config?.[field] === undefined || action.config?.[field] === '') {
        throw Object.assign(
          new Error(`La accion ${action.type} requiere config.${field}`),
          { status: 400 }
        );
      }
    }
    for (const field of [
      'userId',
      'tagId',
      'stageId',
      'pipelineId',
      'taskId',
      'appointmentId',
      'contactId',
      'opportunityId',
      'conversationId'
    ]) {
      assertObjectId(action.config?.[field], `config.${field}`);
    }
    if (
      action.type === 'delay.wait_until' &&
      /^\{\{[^}]+\}\}$/.test(action.config?.until || '') &&
      !isSafeWorkflowPath(String(action.config.until).slice(2, -2).trim())
    ) {
      throw Object.assign(new Error('Ruta insegura en config.until'), { status: 400 });
    }
  }
  return true;
}
