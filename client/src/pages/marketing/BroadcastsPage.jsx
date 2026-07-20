import { Ban, Megaphone, Plus, RefreshCw, Send, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelBroadcast,
  createBroadcast,
  getBroadcasts,
  getContacts,
  getMessageTemplates,
  getTags,
  launchBroadcast,
  previewBroadcast
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import {
  CrmLoadError,
  CrmLoading,
  CrmNotice,
  inputClass,
  localDate
} from '../../components/CrmCommon.jsx';
import { FormField } from '../../components/FormField.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

// Normaliza la respuesta de contactos (puede venir como array o {items|data|contacts}).
function asList(response) {
  if (Array.isArray(response)) return response;
  return response?.items || response?.contacts || response?.data || [];
}

const STATUS_LABEL = {
  draft: 'Borrador',
  running: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
  failed: 'Fallida'
};

export function BroadcastsPage() {
  const { access } = useAuth();
  const permissions = new Set(access.permissions || []);
  const modules = new Set(access.modules || []);
  const canManage = permissions.has('whatsapp_messages:send') && modules.has('whatsapp');

  const [broadcasts, setBroadcasts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [tags, setTags] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Estado del formulario controlado (para poder previsualizar la audiencia).
  const [form, setForm] = useState({
    name: '',
    templateId: '',
    tagId: '',
    contactIds: [],
    throttlePerMinute: 60,
    variablesText: ''
  });
  const [previewCount, setPreviewCount] = useState(null);

  const approvedTemplates = useMemo(
    () =>
      templates.filter(
        (item) => item.channel === 'whatsapp_cloud' && item.status === 'approved'
      ),
    [templates]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [items, tpls, tagList, contactList] = await Promise.all([
        getBroadcasts(),
        getMessageTemplates().catch(() => []),
        getTags('contact').catch(() => []),
        canManage ? getContacts({ limit: 200 }).catch(() => []) : Promise.resolve([])
      ]);
      setBroadcasts(items);
      setTemplates(Array.isArray(tpls) ? tpls : asList(tpls));
      setTags(Array.isArray(tagList) ? tagList : asList(tagList));
      setContacts(asList(contactList));
    } catch (requestError) {
      setLoadError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresco automatico mientras haya difusiones en curso (para ver las stats).
  useEffect(() => {
    const running = broadcasts.some((item) => item.status === 'running');
    if (!running) return undefined;
    const timer = setInterval(() => {
      getBroadcasts()
        .then(setBroadcasts)
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [broadcasts]);

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
    setPreviewCount(null);
  }

  function buildAudience() {
    return {
      contactIds: form.contactIds,
      tagId: form.tagId || null
    };
  }

  async function preview() {
    setError('');
    if (!form.contactIds.length && !form.tagId) {
      setError('Elige una etiqueta o algunos contactos para previsualizar.');
      return;
    }
    setBusy(true);
    try {
      const result = await previewBroadcast(buildAudience());
      setPreviewCount(result.recipients);
      setNotice(`La audiencia alcanza a ${result.recipients} contacto(s) con telefono.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function create(event) {
    event.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('El nombre es requerido.');
    if (!form.templateId) return setError('Elige una plantilla aprobada.');
    if (!form.contactIds.length && !form.tagId) {
      return setError('La audiencia requiere una etiqueta o contactos.');
    }
    let variables = {};
    if (form.variablesText.trim()) {
      try {
        variables = JSON.parse(form.variablesText);
      } catch {
        return setError('Las variables deben ser un JSON valido, ej. {"1":"valor"}.');
      }
    }
    setBusy(true);
    try {
      await createBroadcast({
        name: form.name.trim(),
        templateId: form.templateId,
        audience: buildAudience(),
        throttlePerMinute: Number(form.throttlePerMinute) || 60,
        variables
      });
      setForm({ name: '', templateId: '', tagId: '', contactIds: [], throttlePerMinute: 60, variablesText: '' });
      setPreviewCount(null);
      setNotice('Difusion creada como borrador. Revisala y pulsa "Lanzar".');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function launch(broadcast) {
    if (!window.confirm(`Lanzar la difusion "${broadcast.name}"? Se enviara la plantilla a la audiencia.`)) return;
    setBusy(true);
    setError('');
    try {
      await launchBroadcast(broadcast._id);
      setNotice('Difusion lanzada. Los envios saldran con goteo; las estadisticas se actualizan solas.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(broadcast) {
    if (!window.confirm(`Cancelar la difusion "${broadcast.name}"? Los envios pendientes se descartan.`)) return;
    setBusy(true);
    setError('');
    try {
      await cancelBroadcast(broadcast._id);
      setNotice('Difusion cancelada.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      eyebrow="Marketing"
      title="Difusion masiva"
      description="Envia una plantilla de WhatsApp aprobada a una audiencia (por etiqueta o lista de contactos) con goteo controlado. Cada envio respeta el consentimiento y la ventana de 24h."
    >
      <CrmNotice notice={notice} error={error} />

      {!canManage ? (
        <Card className="p-6 text-sm text-slate-600">
          Necesitas el modulo <strong>WhatsApp</strong> activo y el permiso{' '}
          <strong>whatsapp_messages:send</strong> para crear difusiones.
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Nueva difusion"
            description="Solo se pueden difundir plantillas APROBADAS por Meta (WhatsApp Cloud API)."
          />
          <form onSubmit={create} className="grid gap-4 p-5 md:grid-cols-2">
            <FormField label="Nombre" htmlFor="b-name">
              <input
                id="b-name"
                className={inputClass}
                value={form.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                required
              />
            </FormField>
            <FormField label="Plantilla aprobada" htmlFor="b-template">
              <select
                id="b-template"
                className={inputClass}
                value={form.templateId}
                onChange={(e) => updateForm({ templateId: e.target.value })}
                required
              >
                <option value="">Selecciona una plantilla…</option>
                {approvedTemplates.map((tpl) => (
                  <option key={tpl._id} value={tpl._id}>
                    {tpl.name} ({tpl.language})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Audiencia: etiqueta" htmlFor="b-tag">
              <select
                id="b-tag"
                className={inputClass}
                value={form.tagId}
                onChange={(e) => updateForm({ tagId: e.target.value })}
              >
                <option value="">(ninguna)</option>
                {tags.map((tag) => (
                  <option key={tag._id} value={tag._id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Ritmo (contactos/minuto)" htmlFor="b-throttle">
              <input
                id="b-throttle"
                type="number"
                min="1"
                max="600"
                className={inputClass}
                value={form.throttlePerMinute}
                onChange={(e) => updateForm({ throttlePerMinute: e.target.value })}
              />
            </FormField>

            <FormField
              label="Audiencia: contactos especificos (opcional)"
              htmlFor="b-contacts"
              className="md:col-span-2"
            >
              <select
                id="b-contacts"
                multiple
                className={`${inputClass} min-h-32`}
                value={form.contactIds}
                onChange={(e) =>
                  updateForm({
                    contactIds: Array.from(e.target.selectedOptions).map((o) => o.value)
                  })
                }
              >
                {contacts.map((contact) => (
                  <option key={contact._id} value={contact._id}>
                    {contact.name || contact.fullName || contact.phone} — {contact.phone || 'sin telefono'}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              label="Variables de la plantilla (JSON, opcional)"
              htmlFor="b-vars"
              className="md:col-span-2"
            >
              <textarea
                id="b-vars"
                className={`${inputClass} min-h-20 font-mono text-xs`}
                placeholder='Ej: {"1":"Promo de julio","2":"20%"}'
                value={form.variablesText}
                onChange={(e) => updateForm({ variablesText: e.target.value })}
              />
            </FormField>

            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <Button type="submit" disabled={busy}>
                <Plus className="h-4 w-4" />
                Crear difusion
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={preview}>
                <Users className="h-4 w-4" />
                Previsualizar destinatarios
              </Button>
              {previewCount !== null ? (
                <span className="text-sm text-slate-600">
                  Alcanza a <strong>{previewCount}</strong> contacto(s).
                </span>
              ) : null}
            </div>
          </form>
        </Card>
      )}

      <div className="mt-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">Difusiones</h2>
        <Button variant="secondary" onClick={load} disabled={loading || busy}>
          <RefreshCw className="h-4 w-4" />
          Refrescar
        </Button>
      </div>

      {loading ? (
        <CrmLoading label="Cargando difusiones..." />
      ) : loadError ? (
        <CrmLoadError message={loadError} onRetry={load} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {broadcasts.map((broadcast) => {
            const stats = broadcast.stats || {};
            const total = stats.total || 0;
            const processed = stats.processed || 0;
            const pct = total ? Math.round((processed / total) * 100) : 0;
            return (
              <Card key={broadcast._id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold">
                      <Megaphone className="h-4 w-4 text-slate-400" />
                      {broadcast.name}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Plantilla: {broadcast.templateId?.name || '—'}
                    </p>
                  </div>
                  <Badge tone={broadcast.status}>
                    {STATUS_LABEL[broadcast.status] || broadcast.status}
                  </Badge>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <div className="font-semibold text-slate-700">{total}</div>
                    <div className="text-slate-400">Total</div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-2">
                    <div className="font-semibold text-emerald-700">{stats.sent || 0}</div>
                    <div className="text-slate-400">Enviados</div>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-2">
                    <div className="font-semibold text-amber-700">{stats.skipped || 0}</div>
                    <div className="text-slate-400">Omitidos</div>
                  </div>
                  <div className="rounded-lg bg-rose-50 p-2">
                    <div className="font-semibold text-rose-700">{stats.failed || 0}</div>
                    <div className="text-slate-400">Fallidos</div>
                  </div>
                </div>

                {broadcast.status === 'running' ? (
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {processed}/{total} procesados ({pct}%)
                    </p>
                  </div>
                ) : null}

                <p className="mt-3 text-xs text-slate-400">
                  {broadcast.startedAt
                    ? `Lanzada ${localDate(broadcast.startedAt)}`
                    : `Creada ${localDate(broadcast.createdAt)}`}
                </p>

                {canManage ? (
                  <div className="mt-4 flex gap-2">
                    {broadcast.status === 'draft' ? (
                      <Button disabled={busy} onClick={() => launch(broadcast)}>
                        <Send className="h-4 w-4" />
                        Lanzar
                      </Button>
                    ) : null}
                    {broadcast.status === 'running' ? (
                      <Button disabled={busy} variant="secondary" onClick={() => cancel(broadcast)}>
                        <Ban className="h-4 w-4" />
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            );
          })}
          {!broadcasts.length ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              Aun no hay difusiones. Crea una arriba.
            </Card>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}

export default BroadcastsPage;
