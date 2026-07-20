import {
  Plus,
  Power,
  RefreshCw,
  Settings2,
  Star,
  TestTube2
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createChannelConfig,
  disableChannelConfig,
  getChannelConfigs,
  refreshChannelQuality,
  setDefaultChannelConfig,
  testChannelConfig,
  updateChannelConfig
} from '../../api.js';
import { ActionsMenu } from '../../components/ActionsMenu.jsx';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmNotice, inputClass, localDate } from '../../components/CrmCommon.jsx';
import { Drawer } from '../../components/Drawer.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { FormField } from '../../components/FormField.jsx';
import { LoadingState } from '../../components/AsyncState.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { WhatsAppQrSessionsPanel } from './WhatsAppQrSessionsPanel.jsx';

const CLOUD_CHANNELS = ['whatsapp_cloud', 'whatsapp_cloud_api'];
const isCloud = (config) => CLOUD_CHANNELS.includes(config.channel);

const qualityTone = { GREEN: 'ok', YELLOW: 'warning', RED: 'error', UNKNOWN: 'draft' };
const qualityDot = {
  GREEN: 'bg-emerald-500',
  YELLOW: 'bg-amber-500',
  RED: 'bg-rose-500',
  UNKNOWN: 'bg-slate-300'
};

function HealthCell({ config }) {
  if (!isCloud(config)) return <span className="text-xs text-slate-400">-</span>;
  const rating = config.qualityRating || 'UNKNOWN';
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${qualityDot[rating] || qualityDot.UNKNOWN}`} />
      <Badge tone={qualityTone[rating] || 'draft'}>{rating}</Badge>
      {config.messagingLimit ? (
        <span className="text-xs text-slate-500">{config.messagingLimit}</span>
      ) : null}
    </span>
  );
}

function phoneLabel(config) {
  return config.displayPhone || config.connectedPhone || config.phoneNumberId || 'Sin numero';
}

export function WhatsAppNumbersPage() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState('whatsapp_cloud');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConfigs(await getChannelConfigs());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function mutate(action, success) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await action();
      setNotice(success || result?.message || 'Listo.');
      await load();
      return result;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function create(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const channel = data.get('channel');
    const payload = {
      channel,
      displayName: data.get('displayName'),
      displayPhone: data.get('displayPhone'),
      status: channel === 'whatsapp_qr' ? 'pending' : data.get('status')
    };
    if (channel !== 'whatsapp_qr') {
      Object.assign(payload, {
        phoneNumberId: data.get('phoneNumberId'),
        externalBusinessId: data.get('externalBusinessId'),
        verifyToken: data.get('verifyToken'),
        accessToken: data.get('accessToken'),
        appSecret: data.get('appSecret'),
        apiVersion: data.get('apiVersion')
      });
    }
    const result = await mutate(() => createChannelConfig(payload), 'Numero creado.');
    if (result) { form.reset(); setCreateOpen(false); }
  }

  async function saveEdit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      displayName: data.get('displayName'),
      displayPhone: data.get('displayPhone')
    };
    if (isCloud(editing)) {
      payload.phoneNumberId = data.get('phoneNumberId');
      payload.externalBusinessId = data.get('externalBusinessId');
      if (data.get('accessToken')) payload.accessToken = data.get('accessToken');
      if (data.get('verifyToken')) payload.verifyToken = data.get('verifyToken');
      if (data.get('appSecret')) payload.appSecret = data.get('appSecret');
    }
    const result = await mutate(() => updateChannelConfig(editing._id, payload), 'Numero actualizado.');
    if (result) setEditing(null);
  }

  const rows = configs.map((config) => ({ ...config, id: config._id }));
  const defaultConfig = configs.find((config) => config.isDefault);
  const defaultDisabledWarning = defaultConfig && defaultConfig.status === 'disabled';

  return (
    <PageShell
      eyebrow="Inbox"
      title="Numeros de WhatsApp"
      description="Todos los numeros de la empresa (Meta API y QR) en un solo lugar: numero por defecto, estado, salud y acceso delegado."
      actions={
        <Button onClick={() => setCreateOpen(true)} disabled={busy}>
          <Plus className="h-4 w-4" />Agregar numero
        </Button>
      }
    >
      <CrmNotice notice={notice} error={error} />
      {!defaultConfig && configs.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Ningun numero esta marcado como <strong>por defecto</strong>. Campanas y respuestas
          automaticas usaran el numero conectado mas antiguo hasta que elijas uno.
        </div>
      ) : null}
      {defaultDisabledWarning ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          El numero por defecto esta deshabilitado. Marca otro numero para dirigir los envios.
        </div>
      ) : null}

      {loading ? (
        <LoadingState variant="table" />
      ) : configs.length ? (
        <Card>
          <CardHeader title={`${configs.length} numeros`} />
          <Table
            data={rows}
            emptyText="No hay numeros configurados"
            columns={[
              {
                key: 'displayName',
                header: 'Numero',
                truncate: true,
                width: '16rem',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-semibold text-slate-900">
                      {row.displayName}
                      {row.isDefault ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-700">
                          <Star className="h-3 w-3 fill-current" />Por defecto
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-slate-500">{phoneLabel(row)}</p>
                  </div>
                )
              },
              {
                key: 'channel',
                header: 'Conexion',
                nowrap: true,
                render: (row) => (
                  <Badge tone={isCloud(row) ? 'info' : 'planned'}>
                    {isCloud(row) ? 'API de Meta' : 'QR'}
                  </Badge>
                )
              },
              {
                key: 'status',
                header: 'Estado',
                nowrap: true,
                render: (row) => <Badge tone={row.status}>{row.status}</Badge>
              },
              {
                key: 'quality',
                header: 'Salud',
                nowrap: true,
                hideBelow: 'md',
                render: (row) => <HealthCell config={row} />
              },
              {
                key: 'lastConnectedAt',
                header: 'Ultima actividad',
                nowrap: true,
                hideBelow: 'lg',
                render: (row) => (
                  <span className="text-xs text-slate-500">
                    {localDate(row.lastWebhookAt || row.lastConnectedAt)}
                  </span>
                )
              },
              {
                key: 'actions',
                header: '',
                nowrap: true,
                align: 'right',
                render: (row) => (
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="secondary"
                      className="min-h-8 px-2"
                      disabled={busy}
                      onClick={() => setEditing(row)}
                    >
                      Editar
                    </Button>
                    <ActionsMenu
                      items={[
                        {
                          label: 'Marcar por defecto',
                          icon: Star,
                          hidden: row.isDefault || row.status === 'disabled',
                          onClick: () =>
                            mutate(() => setDefaultChannelConfig(row._id), 'Numero por defecto actualizado.')
                        },
                        {
                          label: 'Probar con Meta',
                          icon: TestTube2,
                          hidden: !isCloud(row),
                          onClick: () => mutate(() => testChannelConfig(row._id, true))
                        },
                        {
                          label: 'Refrescar salud',
                          icon: RefreshCw,
                          hidden: !isCloud(row),
                          onClick: () => mutate(() => refreshChannelQuality(row._id), 'Salud actualizada.')
                        },
                        {
                          label: row.status === 'disabled' ? 'Habilitar' : 'Deshabilitar',
                          icon: Power,
                          tone: row.status === 'disabled' ? 'default' : 'danger',
                          onClick: () =>
                            row.status === 'disabled'
                              ? mutate(() => updateChannelConfig(row._id, { status: 'pending' }), 'Numero habilitado.')
                              : mutate(() => disableChannelConfig(row._id), 'Numero deshabilitado.')
                        }
                      ]}
                    />
                  </div>
                )
              }
            ]}
          />
        </Card>
      ) : (
        <EmptyState
          title="Aun no hay numeros de WhatsApp"
          description="Agrega tu primer numero por API de Meta (Cloud) o vincula uno por QR."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />Agregar numero
            </Button>
          }
        />
      )}

      <Card>
        <CardHeader
          title="Vinculacion por QR"
          description="Numeros conectados por codigo QR (Baileys). Al vincular, el numero real se registra automaticamente."
          action={
            <Button as={Link} to="/inbox/channels" variant="secondary">
              <Settings2 className="h-4 w-4" />Configuracion avanzada
            </Button>
          }
        />
        <div className="p-1">
          <WhatsAppQrSessionsPanel />
        </div>
      </Card>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Agregar numero"
        description="Elige el tipo de conexion; solo veras los campos de ese tipo."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button type="submit" form="whatsapp-number-create" disabled={busy}>
              <Plus className="h-4 w-4" />Crear numero
            </Button>
          </>
        }
      >
        <form id="whatsapp-number-create" onSubmit={create} className="grid gap-4">
          <FormField label="Tipo de conexion" htmlFor="wa-create-channel">
            <select
              id="wa-create-channel"
              name="channel"
              className={inputClass}
              value={createType}
              onChange={(event) => setCreateType(event.target.value)}
            >
              <option value="whatsapp_cloud">API de Meta (Cloud)</option>
              <option value="whatsapp_qr">QR (Baileys)</option>
            </select>
          </FormField>
          <FormField label="Nombre visible" htmlFor="wa-create-name" required>
            <input id="wa-create-name" required name="displayName" className={inputClass} placeholder="Ej. WhatsApp Ventas" />
          </FormField>
          <FormField label="Telefono (E.164)" htmlFor="wa-create-phone" hint="Como se muestra en el inbox.">
            <input id="wa-create-phone" name="displayPhone" className={inputClass} placeholder="+593999999999" />
          </FormField>
          {createType === 'whatsapp_qr' ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Tras crearlo, vinculalo escaneando el codigo QR desde el panel "Vinculacion por QR".
              El numero real lo reporta WhatsApp al conectar.
            </p>
          ) : (
            <>
              <FormField label="Phone Number ID" htmlFor="wa-create-pnid">
                <input id="wa-create-pnid" name="phoneNumberId" className={inputClass} placeholder="ID del numero en Meta" />
              </FormField>
              <FormField label="WhatsApp Business Account ID" htmlFor="wa-create-waba" hint="Necesario para plantillas.">
                <input id="wa-create-waba" name="externalBusinessId" className={inputClass} placeholder="WABA ID" />
              </FormField>
              <FormField label="API version" htmlFor="wa-create-version">
                <input id="wa-create-version" name="apiVersion" className={inputClass} placeholder="Version de Graph API" />
              </FormField>
              <FormField label="Verify token" htmlFor="wa-create-verify">
                <input id="wa-create-verify" type="password" name="verifyToken" className={inputClass} placeholder="Verify token propio" />
              </FormField>
              <FormField label="Access token" htmlFor="wa-create-token">
                <input id="wa-create-token" type="password" name="accessToken" className={inputClass} placeholder="Access token de Meta" />
              </FormField>
              <FormField label="App secret" htmlFor="wa-create-secret" hint="Para validar firmas de webhook.">
                <input id="wa-create-secret" type="password" name="appSecret" className={inputClass} placeholder="App secret" />
              </FormField>
              <FormField label="Estado inicial" htmlFor="wa-create-status">
                <select id="wa-create-status" name="status" defaultValue="pending" className={inputClass}>
                  {['pending', 'connected', 'not_configured'].map((value) => <option key={value}>{value}</option>)}
                </select>
              </FormField>
            </>
          )}
        </form>
      </Drawer>

      <Drawer
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Editar ${editing.displayName}` : 'Editar numero'}
        description="Los secretos no se muestran; deja los campos vacios para conservarlos."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="submit" form="whatsapp-number-edit" disabled={busy}>Guardar</Button>
          </>
        }
      >
        {editing ? (
          <form id="whatsapp-number-edit" onSubmit={saveEdit} className="grid gap-4">
            <FormField label="Nombre visible" htmlFor="wa-edit-name" required>
              <input id="wa-edit-name" required name="displayName" defaultValue={editing.displayName} className={inputClass} />
            </FormField>
            <FormField label="Telefono (E.164)" htmlFor="wa-edit-phone">
              <input id="wa-edit-phone" name="displayPhone" defaultValue={editing.displayPhone || ''} className={inputClass} placeholder="+593999999999" />
            </FormField>
            {isCloud(editing) ? (
              <>
                <FormField label="Phone Number ID" htmlFor="wa-edit-pnid">
                  <input id="wa-edit-pnid" name="phoneNumberId" defaultValue={editing.phoneNumberId || ''} className={inputClass} />
                </FormField>
                <FormField label="WhatsApp Business Account ID" htmlFor="wa-edit-waba">
                  <input id="wa-edit-waba" name="externalBusinessId" defaultValue={editing.externalBusinessId || ''} className={inputClass} />
                </FormField>
                <FormField label="Nuevo access token" htmlFor="wa-edit-token" hint={editing.accessTokenConfigured ? 'Configurado; vacio para conservar.' : 'Sin configurar.'}>
                  <input id="wa-edit-token" type="password" name="accessToken" className={inputClass} />
                </FormField>
                <FormField label="Nuevo verify token" htmlFor="wa-edit-verify" hint={editing.verifyTokenConfigured ? 'Configurado; vacio para conservar.' : 'Sin configurar.'}>
                  <input id="wa-edit-verify" type="password" name="verifyToken" className={inputClass} />
                </FormField>
                <FormField label="Nuevo app secret" htmlFor="wa-edit-secret" hint={editing.appSecretConfigured ? 'Configurado; vacio para conservar.' : 'Sin configurar.'}>
                  <input id="wa-edit-secret" type="password" name="appSecret" className={inputClass} />
                </FormField>
              </>
            ) : (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Numero por QR: el numero real y el estado se administran desde el panel de vinculacion.
              </p>
            )}
          </form>
        ) : null}
      </Drawer>
    </PageShell>
  );
}
