import {
  AlertTriangle,
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  RotateCcw,
  UserRound
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getNotifications, getOpsAlerts } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { roleHome } from '../routes/roleHome.js';
import { canAccessPath } from '../utils/access.js';
import { getSidebarGroups, isSidebarItemActive } from './sidebarItems.js';

const roleLabels = {
  SUPERADMIN: 'Programador / Superadmin',
  DISTRIBUTOR: 'Distribuidor',
  ADMIN: 'Administrador / Empresa',
  SUPERVISOR: 'Supervisor Call Center',
  CALLCENTER: 'Call Center'
};

export function Header({ onMenuClick }) {
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);
  const { user, tenant, access, impersonator, returnToOriginalSession, logout } =
    useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [criticalAlertCount, setCriticalAlertCount] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const canReceiveNotifications = canAccessPath('/notifications', access);
  const canReadOpsAlerts = ['SUPERADMIN', 'ADMIN'].includes(user?.role);
  const currentSection = useMemo(() => {
    const groups = getSidebarGroups(user?.role, access);
    for (const group of groups) {
      const item = group.items.find((candidate) =>
        isSidebarItemActive(candidate.to, location)
      );
      if (item) return { group: group.label, page: item.label };
    }
    return { group: 'TenantDesk', page: roleLabels[user?.role] || 'Panel' };
  }, [user?.role, access, location]);

  const loadUnread = useCallback(() => {
    if (!canReceiveNotifications) return;
    getNotifications({ unread: true, limit: 1 })
      .then((data) => setUnreadCount(data.unreadCount || 0))
      .catch(() => null);
  }, [canReceiveNotifications]);

  const loadCriticalAlerts = useCallback(() => {
    if (!canReadOpsAlerts) return;
    getOpsAlerts({ status: 'open', severity: 'critical' })
      .then((data) => setCriticalAlertCount(data.length))
      .catch(() => null);
  }, [canReadOpsAlerts]);

  useEffect(() => {
    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    window.addEventListener('tenantdesk:notifications-changed', loadUnread);
    return () => {
      clearInterval(interval);
      window.removeEventListener('tenantdesk:notifications-changed', loadUnread);
    };
  }, [loadUnread]);

  useEffect(() => {
    loadCriticalAlerts();
    const interval = setInterval(loadCriticalAlerts, 30000);
    return () => clearInterval(interval);
  }, [loadCriticalAlerts]);

  useEffect(() => {
    function closeMenu(event) {
      if (!menuRef.current?.contains(event.target)) setUserMenuOpen(false);
    }
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, []);

  async function handleReturn() {
    const originalUser = await returnToOriginalSession();
    if (originalUser) {
      navigate(roleHome[originalUser.role] || '/login', { replace: true });
    }
  }

  function handleLogout() {
    setUserMenuOpen(false);
    logout();
  }

  return (
    <header className="relative z-20 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">
            {currentSection.page}
          </p>
          <p className="truncate text-xs text-slate-500">
            {currentSection.group}
            <span className="hidden sm:inline">
              {' / '}
              {tenant?.company?.name ||
                tenant?.distributor?.name ||
                roleLabels[user?.role] ||
                'Sesion activa'}
            </span>
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {impersonator ? (
          <div className="hidden rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 xl:block">
            <p className="text-xs font-semibold text-cyan-900">Acceso delegado</p>
            <p className="max-w-48 truncate text-[11px] text-cyan-700">
              Desde {impersonator.email}
            </p>
          </div>
        ) : null}
        {impersonator ? (
          <button
            type="button"
            onClick={handleReturn}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 text-sm font-semibold text-cyan-800 hover:bg-cyan-100"
            aria-label={`Volver a ${roleLabels[impersonator.role] || impersonator.role}`}
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden md:inline">
              Volver a {roleLabels[impersonator.role] || impersonator.role}
            </span>
          </button>
        ) : null}
        {canReceiveNotifications ? (
          <Link
            to="/notifications"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Notificaciones"
          >
            <Bell className="h-4 w-4" />
            {unreadCount ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-5 text-white">
                {Math.min(unreadCount, 99)}
              </span>
            ) : null}
          </Link>
        ) : null}
        {canReadOpsAlerts ? (
          <Link
            to="/ops"
            className="relative hidden h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 sm:inline-flex"
            aria-label="Alertas operativas"
          >
            <AlertTriangle className="h-4 w-4" />
            {criticalAlertCount ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-5 text-white">
                {Math.min(criticalAlertCount, 99)}
              </span>
            ) : null}
          </Link>
        ) : null}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setUserMenuOpen((current) => !current)}
            className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white pl-1 pr-2 text-slate-700 hover:bg-slate-50"
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded text-xs font-bold text-white"
              style={{ backgroundColor: 'var(--tenant-secondary)' }}
            >
              {user?.name?.slice(0, 2).toUpperCase() || 'TD'}
            </span>
            <ChevronDown className="hidden h-4 w-4 sm:block" />
          </button>
          {userMenuOpen ? (
            <div
              className="absolute right-0 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
              role="menu"
            >
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="truncate text-sm font-semibold text-slate-950">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
                <p className="mt-1 text-xs font-semibold text-cyan-700">
                  {roleLabels[user?.role] || user?.role}
                </p>
              </div>
              {impersonator ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleReturn}
                  className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-cyan-800 hover:bg-cyan-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Terminar acceso delegado
                </button>
              ) : null}
              <div className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-500">
                <UserRound className="h-4 w-4" />
                Sesion y perfil
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesion
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
