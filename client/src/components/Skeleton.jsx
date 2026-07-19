export function SkeletonLine({ className = 'h-4 w-full' }) {
  return <span className={`block animate-pulse rounded bg-slate-200 ${className}`} />;
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5" role="status">
      <SkeletonLine className="h-5 w-1/3" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <SkeletonLine
            key={index}
            className={`h-4 ${index === lines - 1 ? 'w-2/3' : 'w-full'}`}
          />
        ))}
      </div>
      <span className="sr-only">Cargando contenido</span>
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
      role="status"
    >
      <div className="flex gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <SkeletonLine key={index} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4 px-5 py-4">
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <SkeletonLine key={columnIndex} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando tabla</span>
    </div>
  );
}

export function SkeletonMetrics({ count = 4 }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" role="status">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-lg border border-slate-200 bg-white p-5">
          <SkeletonLine className="h-3 w-1/2" />
          <SkeletonLine className="mt-3 h-7 w-2/3" />
          <SkeletonLine className="mt-3 h-3 w-1/3" />
        </div>
      ))}
      <span className="sr-only">Cargando metricas</span>
    </div>
  );
}
