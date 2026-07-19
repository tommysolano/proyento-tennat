import { PageTabs } from './Tabs.jsx';

const widthClasses = {
  // Tope generoso por defecto: aprovecha el monitor sin dejar lineas de texto
  // ilegibles de punta a punta.
  default: 'max-w-screen-2xl',
  // Sin tope: inbox, kanban y tablas anchas.
  full: 'max-w-none',
  // Paginas de configuracion con una sola columna de campos.
  narrow: 'max-w-4xl'
};

export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  tabs,
  width = 'default',
  // `fill` entrega al contenido la altura restante del viewport en vez de
  // dejar que la pagina crezca: necesario para layouts tipo inbox o kanban,
  // donde cada panel scrollea por su cuenta.
  fill = false,
  children
}) {
  return (
    <div
      className={`mx-auto w-full ${
        fill ? 'flex h-full flex-col gap-4' : 'space-y-6'
      } ${widthClasses[width] || widthClasses.default}`}
    >
      <div className="flex shrink-0 flex-col gap-2">
        {eyebrow ? (
          <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">{title}</h1>
            {description ? (
              <p className="mt-2 max-w-3xl text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
      {tabs?.length ? <PageTabs items={tabs} className="shrink-0" /> : null}
      {fill ? (
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
