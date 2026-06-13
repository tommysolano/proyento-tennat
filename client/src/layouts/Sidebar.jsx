import { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, PanelsTopLeft, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getSidebarGroups,
  isSidebarItemActive
} from './sidebarItems.js';

export function Sidebar({ open, onClose }) {
  const location = useLocation();
  const { user, tenant, access, impersonator } = useAuth();
  const [expandedGroups, setExpandedGroups] = useState({});
  const groups = useMemo(
    () => getSidebarGroups(user?.role, access),
    [user?.role, access]
  );
  const branding = tenant?.distributor?.branding || {};
  const brandName = branding.companyName || tenant?.distributor?.name || 'TenantDesk';
  const activeGroupId = groups.find((group) =>
    group.items.some((item) => isSidebarItemActive(item.to, location))
  )?.id;

  function toggleGroup(group) {
    const defaultExpanded = group.kind !== 'settings' || group.id === activeGroupId;
    setExpandedGroups((current) => ({
      ...current,
      [group.id]: !(current[group.id] ?? defaultExpanded)
    }));
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-slate-950/30 transition lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh w-72 flex-col overflow-hidden border-r border-slate-200 bg-white transition-transform lg:static lg:shrink-0 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navegacion principal"
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-100 px-5">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={brandName}
              className="h-10 w-10 rounded-md border border-slate-200 object-contain"
            />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-md text-white"
              style={{ backgroundColor: 'var(--tenant-primary)' }}
            >
              <PanelsTopLeft className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-950">{brandName}</p>
            <p className="text-xs text-slate-500">SaaS multi-tenant</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Cerrar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
          <div className="space-y-3">
            {groups.map((group) => {
              const defaultExpanded =
                group.kind !== 'settings' || group.id === activeGroupId;
              const expanded = expandedGroups[group.id] ?? defaultExpanded;

              return (
                <section key={group.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                    onClick={() => toggleGroup(group)}
                    aria-expanded={expanded}
                  >
                    <span>{group.label}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${
                        expanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {expanded ? (
                    <div className="mt-1 space-y-1">
                      {group.items.map((item) => {
                        const active = isSidebarItemActive(item.to, location);
                        return (
                          <NavLink
                            key={`${group.id}-${item.to}`}
                            to={item.to}
                            onClick={onClose}
                            aria-current={active ? 'page' : undefined}
                            className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                              active
                                ? 'bg-cyan-50 text-cyan-800'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                            }`}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </nav>

        <div className="shrink-0 border-t border-slate-100 p-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="truncate text-sm font-semibold text-slate-950">{user?.name}</p>
            <p className="mt-0.5 text-xs font-semibold text-cyan-700">{user?.role}</p>
            {impersonator ? (
              <p className="mt-2 text-xs font-medium text-cyan-800">
                Acceso delegado activo
              </p>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
