import {
  CheckCircle2,
  LogOut,
  Power,
  QrCode,
  RefreshCw,
  RotateCw,
  ShieldAlert
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  connectWhatsAppSession,
  createWhatsAppSession,
  disconnectWhatsAppSession,
  getWhatsAppSessionDiagnostics,
  getWhatsAppSessionQr,
  getWhatsAppSessions,
  logoutWhatsAppSession,
  regenerateWhatsAppSessionQr,
  setWhatsAppSessionEnabled
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, inputClass, localDate } from '../../components/CrmCommon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { whatsappQrErrorMessage } from '../../utils/whatsappQrErrors.js';

const transientStatuses = new Set([
  'initializing',
  'qr_pending',
  'authenticating',
  'reconnecting'
]);

function confirmationFor(session, action) {
  const value = window.prompt(
    `${action} puede interrumpir el canal. Escribe "${session.name}" para confirmar.`
  );
  return value === session.name ? value : '';
}

export function WhatsAppQrSessionsPanel({ focusSessionId = '', compact = false } = {}) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPERADMIN';
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(focusSessionId || '');
  const [qr, setQr] = useState(null);
  const [qrCountdown, setQrCountdown] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const selected = useMemo(
    () => sessions.find((item) => item._id === selectedId) || null,
    [selectedId, sessions]
  );

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const data = await getWhatsAppSessions();
      setSessions(data);
      setSelectedId((current) => {
        if (focusSessionId && data.some((item) => item._id === focusSessionId)) {
          return focusSessionId;
        }
        return current && data.some((item) => item._id === current)
          ? current
          : data[0]?._id || '';
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [focusSessionId]);

  const loadQr = useCallback(async (session) => {
    if (!session || session.status !== 'qr_pending') {
      setQr(null);
      return;
    }
    try {
      setQr(await getWhatsAppSessionQr(session._id));
    } catch (requestError) {
      if (requestError.status === 410) setQr(null);
      else setError(requestError.message);
    }
  }, []);

  const loadDiagnostics = useCallback(async (id) => {
    if (!id) {
      setDiagnostics(null);
      return;
    }
    try {
      const result = await getWhatsAppSessionDiagnostics(id);
      setDiagnostics(result.diagnostics);
    } catch {
      setDiagnostics(null);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    loadQr(selected);
    loadDiagnostics(selectedId);
  }, [loadDiagnostics, loadQr, selected, selectedId]);
  useEffect(() => {
    if (!selectedId) return undefined;
    const delay = transientStatuses.has(selected?.status) ? 3000 : 15000;
    const timer = window.setInterval(() => load(false), delay);
    return () => window.clearInterval(timer);
  }, [load, selected?.status, selectedId]);

  // Polling HTTP del QR mientras esta pendiente: aunque se caiga el SSE, el QR
  // (que Baileys rota cada ~20-60s) sigue refrescandose en pantalla.
  useEffect(() => {
    if (selected?.status !== 'qr_pending') return undefined;
    const timer = window.setInterval(() => loadQr(selected), 4000);
    return () => window.clearInterval(timer);
  }, [loadQr, selected, selected?.status]);

  // Cuenta atras visible del QR desde expiresAt. Al expirar no se deja un QR
  // muerto: se limpia y la UI ofrece "Generar nuevo QR".
  useEffect(() => {
    const expiresAt = qr?.expiresAt || selected?.qrExpiresAt;
    if (selected?.status !== 'qr_pending' || !expiresAt) {
      setQrCountdown(null);
      return undefined;
    }
    const tick = () => {
      const seconds = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setQrCountdown(seconds);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [qr?.expiresAt, selected?.qrExpiresAt, selected?.status]);

  async function mutate(action, success) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await action();
      setNotice(success);
      await load(false);
      return result;
    } catch (requestError) {
      setError(whatsappQrErrorMessage(requestError, { isSuperAdmin }));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function create(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = new FormData(form).get('name');
    const result = await mutate(
      () => createWhatsAppSession({ name }),
      'Sesion QR creada. Inicia la conexion para obtener el codigo.'
    );
    if (result) {
      form.reset();
      setSelectedId(result._id);
    }
  }

  async function startConnection(reconnect = false) {
    const result = await mutate(
      () => connectWhatsAppSession(selected._id, reconnect),
      reconnect ? 'Reconexion iniciada.' : 'Conexion iniciada.'
    );
    if (result) window.setTimeout(() => load(false), 1000);
  }

  // Genera un QR nuevo: si el runtime sigue vivo regenera; si no, reinicia la
  // conexion. Nunca deja un QR muerto en pantalla.
  async function regenerate() {
    const result = await mutate(async () => {
      try {
        return await regenerateWhatsAppSessionQr(selected._id);
      } catch {
        return connectWhatsAppSession(selected._id, true);
      }
    }, 'Generando un QR nuevo...');
    if (result) window.setTimeout(() => load(false), 1000);
  }

  async function disconnect() {
    const confirmation = confirmationFor(selected, 'Desconectar');
    if (!confirmation) return;
    await mutate(
      () => disconnectWhatsAppSession(selected._id, confirmation),
      'Sesion desconectada. La autenticacion cifrada se conservo.'
    );
  }

  async function logout() {
    const confirmation = confirmationFor(selected, 'Eliminar la autenticacion');
    if (!confirmation) return;
    await mutate(
      () => logoutWhatsAppSession(selected._id, confirmation),
      'Sesion cerrada y autenticacion eliminada.'
    );
  }

  async function disable() {
    const confirmation = confirmationFor(selected, 'Deshabilitar');
    if (!confirmation) return;
    await mutate(
      () => setWhatsAppSessionEnabled(selected._id, false, confirmation),
      'Sesion deshabilitada.'
    );
  }

  return (
    <Card>
      {!compact ? (
        <CardHeader
          title="WhatsApp mediante QR"
          description="Sesiones aisladas por empresa. El QR es temporal y la autenticacion nunca se envia al navegador."
          action={<QrCode className="h-5 w-5 text-cyan-700" />}
        />
      ) : null}
      {notice || error ? (
        <div className={`mx-5 mt-4 rounded-lg px-4 py-3 text-sm ${
          error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
        }`}>
          {error || notice}
        </div>
      ) : null}
      <div className={`grid gap-5 p-5 ${compact ? '' : 'xl:grid-cols-[0.8fr_1.2fr]'}`}>
        {!compact ? (
        <div className="space-y-4">
          <form onSubmit={create} className="flex gap-2">
            <input
              required
              name="name"
              maxLength="120"
              className={inputClass}
              placeholder="WhatsApp Atencion"
            />
            <Button type="submit" disabled={busy}>Crear</Button>
          </form>
          {loading ? <CrmLoading label="Cargando sesiones..." /> : null}
          {!loading ? (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {sessions.map((session) => (
                <button
                  type="button"
                  key={session._id}
                  onClick={() => setSelectedId(session._id)}
                  className={`w-full p-4 text-left ${
                    selectedId === session._id ? 'bg-cyan-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm text-slate-900">{session.name}</strong>
                    <Badge tone={session.status}>{session.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {session.phone || 'Telefono pendiente'} - actividad {localDate(session.lastActivityAt)}
                  </p>
                </button>
              ))}
              {!sessions.length ? (
                <p className="p-5 text-sm text-slate-500">No hay sesiones QR configuradas.</p>
              ) : null}
            </div>
          ) : null}
        </div>
        ) : null}

        {selected ? (
          <div className="space-y-4 rounded-lg border border-slate-200 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900">{selected.name}</h3>
                <p className="text-xs text-slate-500">
                  Proveedor {selected.providerVersion || 'pendiente'} - creada por {selected.createdBy?.name || 'administrador'}
                </p>
              </div>
              <Badge tone={selected.enabled ? 'ok' : 'warning'}>
                {selected.enabled ? 'habilitada' : 'deshabilitada'}
              </Badge>
            </div>

            {selected.status === 'qr_pending' ? (
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-center">
                {qr?.dataUrl && qrCountdown !== 0 ? (
                  <>
                    <img
                      src={qr.dataUrl}
                      alt="Codigo QR temporal para vincular WhatsApp"
                      className="mx-auto h-72 w-72 max-w-full rounded-lg bg-white p-2"
                    />
                    <p className="mt-2 text-xs text-cyan-900">
                      Escanea desde WhatsApp &gt; Dispositivos vinculados.
                      {qrCountdown != null ? ` El QR se renueva en ${qrCountdown}s.` : ''}
                    </p>
                  </>
                ) : qrCountdown === 0 ? (
                  <div className="space-y-3 py-4">
                    <p className="text-sm font-medium text-cyan-900">
                      El codigo QR expiro sin escanearse.
                    </p>
                    <Button disabled={busy} onClick={regenerate}>
                      <RotateCw className="h-4 w-4" />Generar nuevo QR
                    </Button>
                  </div>
                ) : (
                  <CrmLoading label="Preparando QR temporal..." />
                )}
              </div>
            ) : null}

            {selected.status === 'authenticating' ? (
              <div className="flex items-start gap-2 rounded-lg bg-sky-50 p-4 text-sm text-sky-800">
                <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                QR escaneado, sincronizando... Puede tardar 1-2 min. No cierres esta pantalla.
              </div>
            ) : null}

            {['initializing', 'reconnecting'].includes(selected.status) ? (
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                {selected.status === 'reconnecting'
                  ? `Reconectando (intento ${selected.reconnectAttempts || 1})...`
                  : 'Iniciando conexion...'}
              </div>
            ) : null}

            {selected.status === 'connected' ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
                <CheckCircle2 className="h-5 w-5" />
                Conectada como {selected.phone || 'cuenta vinculada'}. El QR ya no esta visible.
              </div>
            ) : null}

            {selected.lastError ? (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                La sesion requiere revision. Puedes intentar reconectarla o consultar el diagnostico.
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {!selected.enabled ? (
                <Button
                  disabled={busy}
                  onClick={() => mutate(
                    () => setWhatsAppSessionEnabled(selected._id, true),
                    'Sesion habilitada.'
                  )}
                >
                  <Power className="h-4 w-4" />Habilitar
                </Button>
              ) : (
                <>
                  <Button disabled={busy} onClick={() => startConnection(false)}>
                    <QrCode className="h-4 w-4" />Iniciar conexion
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => startConnection(true)}>
                    <RefreshCw className="h-4 w-4" />Reconectar
                  </Button>
                  {selected.status === 'qr_pending' ? (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => mutate(
                        () => regenerateWhatsAppSessionQr(selected._id),
                        'Se solicito un QR nuevo.'
                      )}
                    >
                      <RotateCw className="h-4 w-4" />Regenerar QR
                    </Button>
                  ) : null}
                  <Button variant="secondary" disabled={busy} onClick={disconnect}>
                    <Power className="h-4 w-4" />Desconectar
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={logout}>
                    <LogOut className="h-4 w-4" />Cerrar y borrar autenticacion
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={disable}>
                    Deshabilitar
                  </Button>
                </>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <strong className="block text-slate-900">Ultima actividad</strong>
                {localDate(selected.lastActivityAt)}
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <strong className="block text-slate-900">Persistencia cifrada</strong>
                {selected.authStateConfigured ? 'Configurada en MongoDB' : 'Pendiente de vinculacion'}
              </div>
            </div>
            {diagnostics ? (
              <p className="text-xs text-slate-500">
                Runtime: {diagnostics.runtimeActive ? 'activo' : 'inactivo'} - intentos de reconexion: {diagnostics.reconnectAttempts || 0}.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
