import { CheckSquare, Columns3, ListPlus, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './Button.jsx';
import { FormField } from './FormField.jsx';
import { inputClass } from './CrmCommon.jsx';

export function ColumnSelector({
  columns,
  selected,
  defaults,
  busy = false,
  onSave
}) {
  const [draft, setDraft] = useState(selected);

  useEffect(() => {
    setDraft(selected);
  }, [selected]);

  function toggle(column) {
    if (column.required) return;
    setDraft((current) =>
      current.includes(column.key)
        ? current.filter((key) => key !== column.key)
        : [...current, column.key]
    );
  }

  return (
    <details className="relative">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        <Columns3 className="h-4 w-4" />
        Columnas
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
        <p className="text-sm font-semibold text-slate-900">Campos visibles</p>
        <p className="mt-1 text-xs text-slate-500">Esta preferencia solo afecta a tu usuario.</p>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {columns.map((column) => (
            <label key={column.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={draft.includes(column.key)}
                disabled={column.required}
                onChange={() => toggle(column)}
              />
              <span>{column.label}</span>
              {column.required ? <span className="text-xs text-slate-400">(fija)</span> : null}
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={() => onSave(draft)}>
            Guardar
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setDraft(defaults);
              onSave(defaults);
            }}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </details>
  );
}

export function BulkActionsBar({
  selectedCount,
  lists,
  tags,
  users,
  statuses,
  busy = false,
  canAssign = false,
  allowDnd = false,
  onRun,
  onClear
}) {
  const [action, setAction] = useState('add_to_list');
  const [target, setTarget] = useState('');

  useEffect(() => {
    setTarget('');
  }, [action]);

  if (!selectedCount) return null;

  const targetOptions = action === 'set_dnd'
    ? [{ _id: 'true', name: 'Activar DND' }, { _id: 'false', name: 'Retirar DND' }]
    : action.includes('list')
    ? lists
    : action.includes('tag')
      ? tags
      : action === 'assign'
        ? users
        : statuses.map((status) => ({ _id: status, name: status }));
  const targetField = action.includes('list')
    ? 'listId'
    : action.includes('tag')
      ? 'tagId'
      : action === 'assign'
        ? 'userId'
        : action === 'set_dnd'
          ? 'active'
          : 'status';

  async function run() {
    if (!target) return;
    if (
      ['remove_from_list', 'remove_tag', 'change_status'].includes(action) &&
      !window.confirm(`Aplicar esta accion a ${selectedCount} elementos?`)
    ) return;
    await onRun({
      action,
      [targetField]: action === 'set_dnd' ? target === 'true' : target,
      ...(action === 'set_dnd' ? { reason: 'Accion masiva desde CRM' } : {})
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-cyan-200 bg-cyan-50 p-4 lg:flex-row lg:items-end">
      <div className="flex min-w-44 items-center gap-2 text-sm font-semibold text-cyan-900">
        <CheckSquare className="h-4 w-4" />
        {selectedCount} seleccionados
      </div>
      <FormField className="flex-1" label="Accion masiva" htmlFor="crm-bulk-action">
        <select id="crm-bulk-action" className={inputClass} value={action} onChange={(event) => setAction(event.target.value)}>
          <option value="add_to_list">Agregar a lista</option>
          <option value="remove_from_list">Quitar de lista</option>
          <option value="add_tag">Agregar tag</option>
          <option value="remove_tag">Quitar tag</option>
          {canAssign ? <option value="assign">Asignar responsable</option> : null}
          <option value="change_status">Cambiar estado</option>
          {allowDnd ? <option value="set_dnd">Activar o retirar DND</option> : null}
        </select>
      </FormField>
      <FormField className="flex-1" label="Destino o valor" htmlFor="crm-bulk-target">
        <select id="crm-bulk-target" className={inputClass} value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">Seleccionar</option>
          {targetOptions.map((option) => (
            <option key={option._id} value={option._id}>{option.name}</option>
          ))}
        </select>
      </FormField>
      <Button disabled={busy || !target} onClick={run}>Aplicar</Button>
      <Button variant="secondary" disabled={busy} onClick={onClear}>
        <X className="h-4 w-4" />
        Limpiar
      </Button>
    </div>
  );
}

export function CreateCrmListForm({ entityType, busy = false, onCreate }) {
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await onCreate({
      entityType,
      name: data.get('name'),
      description: data.get('description')
    });
    if (created !== false) form.reset();
  }

  return (
    <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={submit}>
      <FormField label="Nombre de la lista" htmlFor={`${entityType}-list-name`} required>
        <input id={`${entityType}-list-name`} required name="name" className={inputClass} />
      </FormField>
      <FormField label="Descripcion" htmlFor={`${entityType}-list-description`}>
        <input id={`${entityType}-list-description`} name="description" className={inputClass} />
      </FormField>
      <div className="flex items-end">
        <Button className="w-full" type="submit" disabled={busy}>
          <ListPlus className="h-4 w-4" />
          Crear lista
        </Button>
      </div>
    </form>
  );
}
