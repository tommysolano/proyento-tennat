import { AlertTriangle, Bell, Menu, RotateCcw, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { getNotifications, getOpsAlerts } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { roleHome } from '../routes/roleHome.js';

const roleLabels = {
  SUPERADMIN: 'Programador / Superadmin',
  DISTRIBUTOR: 'Distribuidor',
  ADMIN: 'Administrador / Empresa',
  SUPERVISOR: 'Supervisor Call Center',
  CALLCENTER: 'Call Center'
};

export function Header({ onMenuClick }) {
  const navigate = useNavigate();
  const { user, tenant, impersonator, returnToOriginalSession } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [criticalAlertCount, setCriticalAlertCount] = useState(0);
  const canReceiveNotifications = ['ADMIN', 'SUPERVISOR', 'CALLCENTER'].includes(user?.role);
  const canReadOpsAlerts = ['SUPERADMIN', 'ADMIN'].includes(user?.role);

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

  async function handleReturn() {
    const originalUser = await returnToOriginalSession();
    if (originalUser) navigate(roleHome[originalUser.role] || '/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-600 lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{roleLabels[user?.role]}</p>
          <p className="truncate text-xs text-slate-500">
            {impersonator
              ? `Impersonando desde ${impersonator.email}`
              : tenant?.company?.name || tenant?.distributor?.name || 'Sesion multi-tenant activa'}
          </p>
        </div>
      </div>

      <div className="hidden w-full max-w-md items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 md:flex">
        <Search className="h-4 w-4 text-slate-400" />
        <span className="text-sm text-slate-400">Buscar empresas, contactos o conversaciones</span>
      </div>

      <div className="flex items-center gap-3">
        {impersonator ? (
          <button
            type="button"
            onClick={handleReturn}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 text-sm font-semibold text-cyan-800"
          >
            <RotateCcw className="h-4 w-4" />
            Volver a {roleLabels[impersonator.role] || impersonator.role}
          </button>
        ) : null}
        {canReceiveNotifications ? (
          <Link
            to="/notifications"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600"
            aria-label="Notificaciones"
          >
            <Bell className="h-4 w-4" />
            {unreadCount ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-5 text-white">{Math.min(unreadCount, 99)}</span> : null}
          </Link>
        ) : null}
        {canReadOpsAlerts ? (
          <Link
            to="/ops"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600"
            aria-label="Alertas operativas"
          >
            <AlertTriangle className="h-4 w-4" />
            {criticalAlertCount ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-5 text-white">{Math.min(criticalAlertCount, 99)}</span> : null}
          </Link>
        ) : null}
        <div
          className="flex h-10 w-10 items-center justify-center rounded-md text-sm font-bold text-white"
          style={{ backgroundColor: 'var(--tenant-secondary)' }}
        >
          {user?.name?.slice(0, 2).toUpperCase() || 'TD'}
        </div>
      </div>
    </header>
  );
}
