import { useEffect, useState } from 'react';
import {
  getContactCommunicationStatus,
  updateContactCommunicationPreferences,
  updateContactConsent,
  updateContactDnd
} from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button } from './Button.jsx';
import { Card, CardHeader } from './Card.jsx';
import { CrmLoadError, CrmLoading, inputClass, localDate } from './CrmCommon.jsx';

const channels = ['whatsapp', 'sms', 'email', 'call'];
const statuses = [
  'unknown',
  'opted_in',
  'opted_out',
  'transactional_only',
  'blocked'
];

export function CommunicationPreferencesCard({ contactId }) {
  const { access } = useAuth();
  const permissions = new Set(access.permissions || []);
  const canManage = [
    'consent:manage',
    'consent:manage_team',
    'consent:record_assigned',
    'contacts:manage',
    'contacts:update_team',
    'contacts:update_assigned'
  ].some((permission) => permissions.has(permission));
  const canManageDnd = [
    'dnd:manage',
    'dnd:manage_team',
    'communication_preferences:update_assigned',
    'contacts:manage',
    'contacts:update_team',
    'contacts:update_assigned'
  ].some((permission) => permissions.has(permission));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await getContactCommunicationStatus(contactId));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [contactId]);

  async function mutate(action) {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Card><CrmLoading label="Cargando consentimiento..." /></Card>;
  if (error && !data) return <Card className="p-5"><CrmLoadError message={error} onRetry={load} /></Card>;

  return (
    <Card>
      <CardHeader
        title="Consentimiento y preferencias"
        description="El canal preferido no reemplaza el consentimiento."
      />
      <div className="space-y-4 p-5">
        {error ? <p className="rounded-md bg-rose-50 p-2 text-xs text-rose-700">{error}</p> : null}
        <div className={`rounded-lg p-3 text-sm ${data.globalDnd ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
          <strong>DND global: {data.globalDnd ? 'Activo' : 'Inactivo'}</strong>
          {data.globalDndReason ? <p className="mt-1 text-xs">{data.globalDndReason}</p> : null}
          {data.globalDndUpdatedAt ? <p className="mt-1 text-xs">Actualizado: {localDate(data.globalDndUpdatedAt)}</p> : null}
          {canManageDnd ? (
            <Button
              className="mt-3"
              variant={data.globalDnd ? 'secondary' : 'danger'}
              disabled={busy}
              onClick={() => {
                const reason = window.prompt('Motivo del cambio de DND');
                if (reason === null) return;
                mutate(() => updateContactDnd(contactId, {
                  active: !data.globalDnd,
                  reason
                }));
              }}
            >
              {data.globalDnd ? 'Retirar DND' : 'Activar DND'}
            </Button>
          ) : null}
        </div>

        <div className="space-y-2">
          {channels.map((channel) => {
            const consent = data.consents[channel];
            return (
              <div key={channel} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[120px_1fr_auto] sm:items-center">
                <strong className="text-sm capitalize">{channel}</strong>
                <div className="text-xs text-slate-600">
                  <p>{consent?.status || 'unknown'} - {consent?.source || 'sin fuente'}</p>
                  {consent?.updatedAt ? <p>{localDate(consent.updatedAt)}</p> : null}
                </div>
                {canManage ? (
                  <select
                    className={inputClass}
                    value={consent?.status || 'unknown'}
                    disabled={busy}
                    onChange={(event) => {
                      const reason = window.prompt('Motivo o evidencia del cambio');
                      if (reason === null) return;
                      mutate(() => updateContactConsent(contactId, channel, {
                        status: event.target.value,
                        source: 'manual',
                        reason
                      }));
                    }}
                  >
                    {statuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                ) : null}
              </div>
            );
          })}
        </div>

        {canManageDnd ? (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              mutate(() => updateContactCommunicationPreferences(contactId, {
                preferredChannel: form.get('preferredChannel'),
                language: form.get('language'),
                doNotCall: form.get('doNotCall') === 'on',
                doNotWhatsApp: form.get('doNotWhatsApp') === 'on',
                doNotSms: form.get('doNotSms') === 'on',
                doNotEmail: form.get('doNotEmail') === 'on'
              }));
            }}
          >
            <label className="text-xs font-semibold">Canal preferido
              <select name="preferredChannel" defaultValue={data.preferences?.preferredChannel || ''} className={inputClass}>
                <option value="">Sin preferencia</option>
                {channels.map((channel) => <option key={channel}>{channel}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold">Idioma
              <input name="language" defaultValue={data.preferences?.language || ''} className={inputClass} />
            </label>
            {[
              ['doNotCall', 'No llamar'],
              ['doNotWhatsApp', 'No enviar WhatsApp'],
              ['doNotSms', 'No enviar SMS'],
              ['doNotEmail', 'No enviar email']
            ].map(([name, label]) => (
              <label key={name} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={name} defaultChecked={Boolean(data.preferences?.[name])} />
                {label}
              </label>
            ))}
            <Button type="submit" disabled={busy}>Guardar preferencias</Button>
          </form>
        ) : null}
      </div>
    </Card>
  );
}
