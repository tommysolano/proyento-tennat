import { NavLink } from 'react-router-dom';
import { LogOut, PanelsTopLeft } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { sidebarItemsByRole } from './sidebarItems.js';

export function Sidebar({ open, onClose }) {
  const { user, impersonator, logout } = useAuth();
  const items = sidebarItemsByRole[user?.role] || [];

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-slate-950/30 transition lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-700 text-white">
            <PanelsTopLeft className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-950">TenantDesk</p>
            <p className="text-xs text-slate-500">SaaS multi-tenant</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-cyan-50 text-cyan-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-950">{user?.name}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
            <p className="mt-1 text-xs font-semibold text-cyan-700">{user?.role}</p>
            {impersonator ? (
              <p className="mt-2 rounded-md bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-800">
                Vista iniciada desde {impersonator.email}
              </p>
            ) : null}
          </div>
          <Button className="w-full" variant="secondary" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
        </div>
      </aside>
    </>
  );
}
