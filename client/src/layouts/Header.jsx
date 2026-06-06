import { Bell, Menu, RotateCcw, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600"
          aria-label="Notificaciones"
        >
          <Bell className="h-4 w-4" />
        </button>
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
