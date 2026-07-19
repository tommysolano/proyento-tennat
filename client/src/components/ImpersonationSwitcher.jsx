import { useCallback, useEffect, useState } from 'react';
import { LogIn, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getImpersonationTargets } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { roleHome } from '../routes/roleHome.js';
import { Badge } from './Badge.jsx';
import { Button } from './Button.jsx';

export const impersonationRoleLabels = {
  SUPERADMIN: 'Programador / Superadmin',
  DISTRIBUTOR: 'Distribuidor',
  ADMIN: 'Administrador / Empresa',
  SUPERVISOR: 'Supervisor Call Center',
  CALLCENTER: 'Call Center'
};

const roleRank = {
  SUPERADMIN: 0,
  DISTRIBUTOR: 1,
  ADMIN: 2,
  SUPERVISOR: 3,
  CALLCENTER: 4
};

function idOf(value) {
  if (!value) return '';
  return String(typeof value === 'object' ? value._id || '' : value);
}

/**
 * Espejo en cliente de `impersonationScope.js`. Solo decide si mostrar la
 * accion: el backend vuelve a validar el alcance contra el actor raiz.
 */
export function canImpersonateTarget(rootActor, target) {
  if (!rootActor || !target) return false;
  if (!['SUPERADMIN', 'DISTRIBUTOR', 'ADMIN'].includes(rootActor.role)) return false;
  if (target.status !== 'active') return false;
  if (idOf(rootActor._id || rootActor.id) === idOf(target._id)) return false;
  if ((roleRank[target.role] ?? 99) <= (roleRank[rootActor.role] ?? 99)) return false;
  if (rootActor.role === 'SUPERADMIN') return true;
  if (idOf(rootActor.distributorId) !== idOf(target.distributorId)) return false;
  if (rootActor.role === 'ADMIN') {
    return idOf(rootActor.companyId) === idOf(target.companyId);
  }
  return true;
}

/**
 * Accion "Entrar como" para una fila concreta de usuario.
 */
export function ImpersonateUserButton({
  target,
  label = 'Entrar como',
  className = 'px-3',
  variant = 'secondary',
  onError
}) {
  const navigate = useNavigate();
  const { impersonateUser, rootActor } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!canImpersonateTarget(rootActor, target)) return null;

  async function handleClick() {
    setBusy(true);
    try {
      const data = await impersonateUser(target._id);
      navigate(data.redirectPath || roleHome[data.user.role] || '/login', {
        replace: true
      });
    } catch (requestError) {
      if (onError) onError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button className={className} variant={variant} disabled={busy} onClick={handleClick}>
      <LogIn className="h-4 w-4" />
      {busy ? 'Entrando...' : label}
    </Button>
  );
}

/**
 * Selector de objetivo de impersonacion. El backend decide el universo real
 * segun el actor raiz; aqui solo se listan y filtran los candidatos.
 */
export function ImpersonationSwitcher({ open, onClose, companyId, distributorId }) {
  const navigate = useNavigate();
  const { impersonateUser, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const loadTargets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getImpersonationTargets({
        search,
        role,
        companyId,
        distributorId
      });
      setUsers(data.users || []);
    } catch (requestError) {
      setError(requestError.message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [search, role, companyId, distributorId]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(loadTargets, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [open, loadTargets, search]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setRole('');
      setError('');
    }
  }, [open]);

  if (!open) return null;

  async function handleEnter(target) {
    setBusyId(target._id);
    setError('');
    try {
      const data = await impersonateUser(target._id);
      onClose();
      navigate(data.redirectPath || roleHome[data.user.role] || '/login', {
        replace: true
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 pt-16"
      role="dialog"
      aria-modal="true"
      aria-label="Entrar como otro usuario"
    >
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Entrar como otro usuario</h2>
            <p className="text-xs text-slate-500">
              Solo aparecen perfiles por debajo de tu rol dentro de tu alcance.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
          <label className="relative flex-1" htmlFor="impersonation-search">
            <span className="sr-only">Buscar usuario</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="impersonation-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre o email"
              className="min-h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none"
            />
          </label>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            aria-label="Filtrar por rol"
            className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none"
          >
            <option value="">Todos los roles</option>
            <option value="DISTRIBUTOR">Distribuidor</option>
            <option value="ADMIN">Administrador</option>
            <option value="SUPERVISOR">Supervisor</option>
            <option value="CALLCENTER">Call center</option>
          </select>
        </div>

        {error ? (
          <p className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="min-h-32 flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Cargando perfiles...</p>
          ) : users.length ? (
            <ul className="divide-y divide-slate-100">
              {users.map((target) => (
                <li
                  key={target._id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {target.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">{target.email}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge tone="info">
                        {impersonationRoleLabels[target.role] || target.role}
                      </Badge>
                      {target.companyId?.name ? <span>{target.companyId.name}</span> : null}
                      {target.distributorId?.name ? (
                        <span>{target.distributorId.name}</span>
                      ) : null}
                    </p>
                  </div>
                  <Button
                    className="px-3"
                    variant="secondary"
                    disabled={Boolean(busyId) || target._id === user?._id}
                    onClick={() => handleEnter(target)}
                  >
                    <LogIn className="h-4 w-4" />
                    {busyId === target._id ? 'Entrando...' : 'Entrar como'}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              No hay perfiles disponibles con estos filtros.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Boton reutilizable que abre el selector desde cualquier panel.
 */
export function ImpersonationSwitcherButton({
  label = 'Entrar como usuario',
  className = 'px-3',
  variant = 'secondary',
  companyId,
  distributorId
}) {
  const { canImpersonate } = useAuth();
  const [open, setOpen] = useState(false);

  if (!canImpersonate) return null;

  return (
    <>
      <Button className={className} variant={variant} onClick={() => setOpen(true)}>
        <LogIn className="h-4 w-4" />
        {label}
      </Button>
      <ImpersonationSwitcher
        open={open}
        onClose={() => setOpen(false)}
        companyId={companyId}
        distributorId={distributorId}
      />
    </>
  );
}
