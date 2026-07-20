import { UserX } from 'lucide-react';

export const ASSIGNABLE_ROLES = ['SUPERVISOR', 'CALLCENTER'];

/** Usuarios que pueden recibir la asignacion de un contacto u oportunidad. */
export function assignableUsers(users = []) {
  return users.filter((item) => ASSIGNABLE_ROLES.includes(item.role));
}

/**
 * Selector de responsable. Cuando no hay a quien asignar, un `<select>` con la
 * unica opcion "Sin asignar" no comunica nada: parece que falta cargar algo.
 * En ese caso se muestra el motivo real y se conserva un campo oculto vacio
 * para que el payload enviado siga siendo identico.
 *
 * Recibe `options` ya preparadas a proposito: cada pantalla decide su propio
 * criterio (unas asignan a supervisores y agentes, otras solo a agentes) y no
 * conviene que este componente lo reinterprete.
 */
export function AssigneeSelect({
  id,
  name = 'assignedTo',
  options = [],
  defaultValue = '',
  className = '',
  emptyHint = 'No hay agentes en esta empresa'
}) {
  if (!options.length) {
    return (
      <>
        <input type="hidden" name={name} defaultValue="" />
        <p
          id={id}
          className="flex items-center gap-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
        >
          <UserX className="h-4 w-4 shrink-0 text-slate-400" />
          {emptyHint}
        </p>
      </>
    );
  }

  return (
    <select id={id} name={name} defaultValue={defaultValue} className={className}>
      <option value="">Sin asignar</option>
      {options.map((item) => (
        <option key={item._id} value={item._id}>
          {item.name}
        </option>
      ))}
    </select>
  );
}
