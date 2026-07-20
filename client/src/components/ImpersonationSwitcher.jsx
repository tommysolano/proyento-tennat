import { useCallback, useEffect, useState } from 'react';
import { Building2, Globe2, LogIn, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getImpersonationTargets } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { roleHome } from '../routes/roleHome.js';
import { Badge } from './Badge.jsx';
import { Button } from './Button.jsx';
import { EmptyState } from './EmptyState.jsx';
import { Modal } from './Modal.jsx';

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
export function ImpersonationSwitcher({
  open,
  onClose,
  companyId,
  distributorId,
  contextLabel,
  allowCompanyAdmin = true
}) {
  const navigate = useNavigate();
  const { impersonateUser, impersonateAdmin, user, rootActor } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  // Ampliar el alcance es siempre una decision explicita: por defecto el
  // selector se queda en el contexto desde el que se abrio, para no invitar a
  // entrar por error como un usuario de otra empresa.
  const [scopeAll, setScopeAll] = useState(false);

  const hasContext = Boolean(companyId || distributorId);
  const contextActive = hasContext && !scopeAll;

  const loadTargets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getImpersonationTargets({
        search,
        role,
        // El backend sigue validando contra el actor raiz; esto solo acota lo
        // que se muestra.
        companyId: contextActive ? companyId : undefined,
        distributorId: contextActive ? distributorId : undefined
      });
      setUsers(data.users || []);
    } catch (requestError) {
      setError(requestError.message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [search, role, companyId, distributorId, contextActive]);

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
      setScopeAll(false);
    }
  }, [open]);

  if (!open) return null;

  async function enterWith(key, request) {
    setBusyId(key);
    setError('');
    try {
      const data = await request();
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

  const handleEnter = (target) =>
    enterWith(target._id, () => impersonateUser(target._id));

  // Solo tiene sentido ofrecer "salir del contexto" a quien realmente alcanza
  // mas alla de el. Un ADMIN raiz ya esta limitado a su propia empresa.
  const widenLabel =
    rootActor?.role === 'SUPERADMIN'
      ? 'Buscar en toda la plataforma'
      : rootActor?.role === 'DISTRIBUTOR'
        ? 'Buscar en toda mi cartera'
        : '';
  const canWiden = hasContext && Boolean(widenLabel);

  const roleLabel = role ? impersonationRoleLabels[role] || role : '';
  const emptyTitle = contextActive
    ? role
      ? `Sin usuarios de rol ${roleLabel}`
      : 'Esta empresa no tiene usuarios disponibles'
    : 'No hay perfiles con estos filtros';
  const emptyDescription = contextActive
    ? `${contextLabel || 'Esta empresa'} no tiene usuarios${
        role ? ` de rol ${roleLabel}` : ''
      } que puedas asumir.${canWiden ? ` Activa "${widenLabel}" para ampliar la busqueda.` : ''}`
    : 'Prueba con otro texto de busqueda o cambia el filtro de rol.';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        contextActive && contextLabel
          ? `Entrar como usuario de ${contextLabel}`
          : 'Entrar como otro usuario'
      }
      description={
        contextActive
          ? 'Solo se listan los usuarios de este contexto.'
          : 'Solo aparecen perfiles por debajo de tu rol dentro de tu alcance.'
      }
      bodyClassName=""
    >
      <>
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

        {canWiden ? (
          <label className="flex items-center gap-2 border-b border-slate-100 px-5 py-2.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={scopeAll}
              onChange={(event) => setScopeAll(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
            />
            <span className="flex items-center gap-1.5">
              <Globe2 className="h-3.5 w-3.5 text-slate-400" />
              {widenLabel}
            </span>
            {scopeAll ? (
              <span className="ml-auto text-amber-700">
                Mostrando usuarios fuera de {contextLabel || 'este contexto'}
              </span>
            ) : null}
          </label>
        ) : null}

        {error ? (
          <p className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {/*
          Atajo equivalente al antiguo boton "Entrar" suelto de la tabla de
          empresas: entra como el ADMIN de la empresa sin tener que buscarlo.
        */}
        {companyId && allowCompanyAdmin ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-cyan-50/60 px-5 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Building2 className="h-4 w-4 shrink-0 text-cyan-700" />
                Administrador de la empresa
              </p>
              <p className="truncate text-xs text-slate-500">
                {contextLabel
                  ? `Acceso directo al ADMIN de ${contextLabel}.`
                  : 'Acceso directo al ADMIN de esta empresa.'}
              </p>
            </div>
            <Button
              className="px-3"
              disabled={Boolean(busyId)}
              onClick={() => enterWith('__company_admin__', () => impersonateAdmin(companyId))}
            >
              <LogIn className="h-4 w-4" />
              {busyId === '__company_admin__' ? 'Entrando...' : 'Entrar'}
            </Button>
          </div>
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
                    {/*
                      Con el alcance ampliado conviven usuarios de empresas
                      distintas, asi que la pertenencia se lee antes de pulsar.
                    */}
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <Badge tone="info">
                        {impersonationRoleLabels[target.role] || target.role}
                      </Badge>
                      {target.companyId?.name ? (
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          {target.companyId.name}
                        </span>
                      ) : null}
                      {target.distributorId?.name ? (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <Globe2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          {target.distributorId.name}
                        </span>
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
            <EmptyState
              icon={contextActive ? Building2 : Search}
              title={emptyTitle}
              description={emptyDescription}
              className="m-4 min-h-0 border-dashed"
              action={
                canWiden && contextActive ? (
                  <Button variant="secondary" onClick={() => setScopeAll(true)}>
                    <Globe2 className="h-4 w-4" />
                    {widenLabel}
                  </Button>
                ) : null
              }
            />
          )}
        </div>
      </>
    </Modal>
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
  distributorId,
  contextLabel,
  allowCompanyAdmin = true
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
        contextLabel={contextLabel}
        allowCompanyAdmin={allowCompanyAdmin}
      />
    </>
  );
}
