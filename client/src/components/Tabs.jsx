import { NavLink } from 'react-router-dom';

/**
 * Sub-navegacion de pagina enlazada a rutas reales. Scrollea en horizontal
 * en movil en vez de apilarse, para que la pagina no crezca de alto.
 */
export function PageTabs({ items = [], className = '' }) {
  if (!items.length) return null;

  return (
    <nav
      className={`scrollbar-thin -mb-px overflow-x-auto border-b border-slate-200 ${className}`}
      aria-label="Secciones de la pagina"
    >
      <ul className="flex min-w-max gap-1">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end ?? true}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition ${
                  isActive
                    ? 'border-cyan-700 text-cyan-800'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                }`
              }
            >
              {item.icon ? <item.icon className="h-4 w-4" /> : null}
              {item.label}
              {item.badge ? (
                <span className="rounded-full bg-slate-100 px-2 text-xs font-bold text-slate-600">
                  {item.badge}
                </span>
              ) : null}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
