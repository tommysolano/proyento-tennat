import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Capa base compartida por Drawer y Modal.
 *
 * Se monta con `createPortal` directamente en <body> a proposito: dentro del
 * arbol de la pagina, cualquier ancestro con `transform`, `filter` o
 * `backdrop-filter` (el header lo usa) convierte a `position: fixed` en
 * relativo a ese ancestro y el fondo deja de cubrir el viewport completo.
 * Portando el nodo fuera de esa cadena el problema no puede reaparecer aunque
 * cambien los layouts.
 */
export function Overlay({ open, onClose, children, align = 'end', className = '' }) {
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose?.();
    }

    // Se congelan body y html: en iOS el scroll se escapa por <html> aunque
    // <body> este bloqueado.
    const { body, documentElement: html } = document;
    const previous = {
      bodyOverflow: body.style.overflow,
      htmlOverflow: html.style.overflow,
      paddingRight: body.style.paddingRight
    };
    // Compensa el ancho de la scrollbar para que el fondo no salte al abrir.
    const scrollbarWidth = window.innerWidth - html.clientWidth;
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      body.style.overflow = previous.bodyOverflow;
      html.style.overflow = previous.htmlOverflow;
      body.style.paddingRight = previous.paddingRight;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const alignClasses = {
    end: 'justify-end',
    center: 'items-center justify-center p-4'
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex ${alignClasses[align] || alignClasses.end} ${className}`}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60"
      />
      {children}
    </div>,
    document.body
  );
}
