import { Inbox } from 'lucide-react';

/**
 * Estado vacio generico. `action` recibe un nodo ya construido (normalmente un
 * Button) para no imponer una forma concreta de accion.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title = 'Todavia no hay informacion',
  description,
  action,
  className = ''
}) {
  return (
    <div
      className={`flex min-h-36 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-8 text-center ${className}`}
      role="status"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      {description ? (
        <p className="mt-1 max-w-xl text-sm text-slate-600">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
