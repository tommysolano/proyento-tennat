import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Overlay } from './Overlay.jsx';

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl'
};

/**
 * Dialogo centrado para confirmaciones y selectores cortos. Comparte overlay,
 * bloqueo de scroll y cierre por Escape con el Drawer via `Overlay`.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  bodyClassName = 'px-5 py-5',
  children
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <Overlay open={open} onClose={onClose} align="center">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[85vh] w-full flex-col rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/40 outline-none ${
          sizeClasses[size] || sizeClasses.md
        }`}
      >
        {title ? (
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-950">{title}</h2>
              {description ? (
                <p className="mt-1 text-xs text-slate-500">{description}</p>
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
        ) : null}

        <div className={`scrollbar-thin min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>
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
