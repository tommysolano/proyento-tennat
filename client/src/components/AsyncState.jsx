import {
  AlertCircle,
  Ban,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  RefreshCcw
} from 'lucide-react';
import { Button } from './Button.jsx';
import { SkeletonMetrics, SkeletonTable } from './Skeleton.jsx';

export { EmptyState } from './EmptyState.jsx';

const variants = {
  empty: {
    icon: Inbox,
    iconClass: 'bg-slate-100 text-slate-500',
    borderClass: 'border-slate-200 bg-white'
  },
  error: {
    icon: AlertCircle,
    iconClass: 'bg-rose-100 text-rose-700',
    borderClass: 'border-rose-200 bg-rose-50/60'
  },
  permission: {
    icon: LockKeyhole,
    iconClass: 'bg-amber-100 text-amber-700',
    borderClass: 'border-amber-200 bg-amber-50/60'
  },
  unavailable: {
    icon: Ban,
    iconClass: 'bg-slate-100 text-slate-500',
    borderClass: 'border-slate-200 bg-slate-50'
  }
};

/**
 * Estado de carga. Por defecto muestra el spinner clasico; con
 * `variant="table"` o `variant="page"` dibuja skeletons con la forma del
 * contenido que va a llegar, que se percibe mas rapido que un spinner.
 */
export function LoadingState({
  label = 'Cargando informacion...',
  variant = 'spinner',
  rows = 5,
  columns = 4
}) {
  if (variant === 'table') {
    return <SkeletonTable rows={rows} columns={columns} />;
  }

  if (variant === 'page') {
    return (
      <div className="space-y-6">
        <SkeletonMetrics />
        <SkeletonTable rows={rows} columns={columns} />
      </div>
    );
  }

  return (
    <div
      className="flex min-h-36 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-500"
      role="status"
    >
      <LoaderCircle className="h-5 w-5 animate-spin text-cyan-700" />
      <span>{label}</span>
    </div>
  );
}

export function AsyncState({
  type = 'empty',
  title,
  description,
  actionLabel,
  onAction
}) {
  const variant = variants[type] || variants.empty;
  const Icon = variant.icon;

  return (
    <div
      className={`flex min-h-36 flex-col items-center justify-center rounded-lg border p-8 text-center ${variant.borderClass}`}
      role={type === 'error' ? 'alert' : 'status'}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${variant.iconClass}`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      {description ? (
        <p className="mt-1 max-w-xl text-sm text-slate-600">{description}</p>
      ) : null}
      {onAction ? (
        <Button className="mt-4" variant="secondary" onClick={onAction}>
          <RefreshCcw className="h-4 w-4" />
          {actionLabel || 'Reintentar'}
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorState(props) {
  return (
    <AsyncState
      type="error"
      title="No pudimos cargar esta informacion"
      actionLabel="Reintentar"
      {...props}
    />
  );
}

export function PermissionState(props) {
  return (
    <AsyncState
      type="permission"
      title="No tienes permiso para ver esta seccion"
      {...props}
    />
  );
}

export function ModuleUnavailableState(props) {
  return (
    <AsyncState
      type="unavailable"
      title="Modulo no disponible"
      description="El plan o la configuracion actual no incluye esta funcion."
      {...props}
    />
  );
}
