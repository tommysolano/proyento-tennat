export function FormField({
  label,
  htmlFor,
  hint,
  required = false,
  className = '',
  children
}) {
  return (
    <label className={`block space-y-1.5 ${className}`} htmlFor={htmlFor}>
      <span className="block text-xs font-semibold text-slate-700">
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-xs font-normal text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function FormSection({ step, title, description, children, className = '' }) {
  return (
    <fieldset className={`rounded-lg border border-slate-200 p-4 ${className}`}>
      <legend className="px-1">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
          {step ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-700 text-xs font-bold text-white">
              {step}
            </span>
          ) : null}
          {title}
        </span>
      </legend>
      {description ? <p className="mb-4 text-xs text-slate-500">{description}</p> : null}
      {children}
    </fieldset>
  );
}
