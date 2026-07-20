import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Overlay } from './Overlay.jsx';

const sizeClasses = {
  md: 'max-w-[480px]',
  lg: 'max-w-[640px]'
};

/**
 * Panel lateral para formularios largos. Sustituye al modal estrecho: el
 * header y el footer quedan fijos y solo scrollea el cuerpo, asi la accion
 * de guardar nunca se pierde debajo de 10 campos.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <Overlay open={open} onClose={onClose} align="end">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex h-full w-full flex-col bg-white shadow-2xl shadow-slate-950/40 outline-none ${
          sizeClasses[size] || sizeClasses.md
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-950">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>

        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </Overlay>
  );
}
