import { CustomField } from '../models/CustomField.js';
import { EMAIL_PATTERN } from './validation.js';

function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function validateValue(field, value) {
  if (value === undefined || value === null || value === '') return value;
  if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    invalid(`${field.label} debe ser numerico`);
  }
  if (field.type === 'boolean' && typeof value !== 'boolean') invalid(`${field.label} debe ser booleano`);
  if (field.type === 'date' && Number.isNaN(new Date(value).getTime())) invalid(`${field.label} debe ser fecha`);
  if (field.type === 'email' && !EMAIL_PATTERN.test(String(value))) invalid(`${field.label} debe ser email`);
  if (field.type === 'url') {
    try {
      new URL(String(value));
    } catch {
      invalid(`${field.label} debe ser URL`);
    }
  }
  if (field.type === 'select' && !field.options.includes(String(value))) invalid(`${field.label} tiene una opcion invalida`);
  if (
    field.type === 'multiselect' &&
    (!Array.isArray(value) || value.some((item) => !field.options.includes(String(item))))
  ) {
    invalid(`${field.label} tiene opciones invalidas`);
  }
  return value;
}

export async function validateCustomFieldValues(companyId, entityType, values = {}, { requireAll = false } = {}) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) invalid('customFields debe ser un objeto');
  const definitions = await CustomField.find({ companyId, entityType, status: 'active' }).lean();
  const byKey = new Map(definitions.map((field) => [field.key, field]));
  const clean = {};

  for (const [key, value] of Object.entries(values)) {
    const definition = byKey.get(key);
    if (!definition) invalid(`Campo personalizado desconocido: ${key}`);
    clean[key] = validateValue(definition, value);
  }
  if (requireAll) {
    for (const field of definitions.filter((item) => item.required)) {
      if (clean[field.key] === undefined || clean[field.key] === null || clean[field.key] === '') {
        invalid(`${field.label} es requerido`);
      }
    }
  }
  return clean;
}
