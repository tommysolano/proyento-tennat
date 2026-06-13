import { isValidObjectId } from './validation.js';

export const CRM_VIEW_COLUMNS = {
  contacts: [
    'name',
    'phone',
    'email',
    'source',
    'channel',
    'campaign',
    'medium',
    'consultedProduct',
    'purchasedProduct',
    'marketingOrigin',
    'city',
    'assignedTo',
    'tags',
    'lists',
    'priority',
    'status',
    'lastContactAt',
    'createdAt',
    'action'
  ],
  opportunities: [
    'title',
    'contact',
    'pipeline',
    'stage',
    'value',
    'source',
    'channel',
    'campaign',
    'medium',
    'consultedProduct',
    'purchasedProduct',
    'marketingOrigin',
    'assignedTo',
    'tags',
    'lists',
    'priority',
    'status',
    'expectedCloseDate',
    'updatedAt',
    'action'
  ]
};

export const CRM_REQUIRED_COLUMNS = {
  contacts: ['name', 'assignedTo', 'status', 'action'],
  opportunities: ['title', 'assignedTo', 'status', 'action']
};

export function normalizeObjectIdArray(values, field = 'ids', { max = 500 } = {}) {
  if (!Array.isArray(values) || !values.length) {
    throw Object.assign(new Error(`${field} debe ser un arreglo no vacio`), { status: 400 });
  }
  if (values.length > max) {
    throw Object.assign(new Error(`${field} permite un maximo de ${max} elementos`), {
      status: 400
    });
  }
  const normalized = [...new Set(values.map((value) => String(value || '').trim()))];
  if (normalized.some((value) => !value || !isValidObjectId(value))) {
    throw Object.assign(new Error(`${field} contiene IDs invalidos o vacios`), {
      status: 400
    });
  }
  return normalized;
}

export function sanitizeVisibleColumns(module, values, extraAllowed = []) {
  const baseAllowed = CRM_VIEW_COLUMNS[module];
  if (!baseAllowed) {
    throw Object.assign(new Error('Modulo de preferencias invalido'), { status: 400 });
  }
  const allowed = [...baseAllowed, ...extraAllowed];
  if (!Array.isArray(values)) {
    throw Object.assign(new Error('visibleColumns debe ser un arreglo'), { status: 400 });
  }
  const selected = [...new Set(values.map(String))].filter((column) =>
    allowed.includes(column)
  );
  return [
    ...CRM_REQUIRED_COLUMNS[module],
    ...selected.filter((column) => !CRM_REQUIRED_COLUMNS[module].includes(column))
  ];
}

export function contactTagScopeFilter() {
  return {
    $or: [
      { scope: 'contact' },
      { scope: { $exists: false } },
      { scope: null }
    ]
  };
}

export function tagScopeFilter(scope) {
  return scope === 'contact' ? contactTagScopeFilter() : { scope };
}
