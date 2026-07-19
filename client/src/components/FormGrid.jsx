/**
 * Seccion de formulario. El grid nunca pasa de 2 columnas: mas columnas
 * comprimen los campos hasta hacerlos ilegibles. Un campo puede ocupar el
 * ancho completo envolviendolo en <FormGridFull>.
 */
export function FormGrid({
  title,
  description,
  step,
  columns = 2,
  className = '',
  children
}) {
  const gridClass = columns === 1 ? 'grid gap-4' : 'grid gap-4 md:grid-cols-2';

  return (
    <section className={`space-y-4 ${className}`}>
      {title || description ? (
        <div className="flex items-start gap-3">
          {step ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-bold text-cyan-800">
              {step}
            </span>
          ) : null}
          <div>
            {title ? (
              <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={gridClass}>{children}</div>
    </section>
  );
}

export function FormGridFull({ className = '', children }) {
  return <div className={`md:col-span-2 ${className}`}>{children}</div>;
}
