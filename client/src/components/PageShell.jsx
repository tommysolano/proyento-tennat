export function PageShell({ eyebrow, title, description, children }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">{eyebrow}</p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">{title}</h1>
            {description ? <p className="mt-2 max-w-3xl text-sm text-slate-500">{description}</p> : null}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
