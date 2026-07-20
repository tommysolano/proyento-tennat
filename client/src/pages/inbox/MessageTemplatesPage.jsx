import {
  Copy,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Smartphone,
  Trash2,
  Variable
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createMessageTemplate,
  deleteMessageTemplate,
  disableMessageTemplate,
  duplicateMessageTemplate,
  getMessageTemplates,
  getTemplateCloudStatus,
  registerMessageTemplate,
  syncMessageTemplates,
  updateMessageTemplate
} from '../../api.js';
import { ActionsMenu } from '../../components/ActionsMenu.jsx';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass, localDate } from '../../components/CrmCommon.jsx';
import { Drawer } from '../../components/Drawer.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { FormField } from '../../components/FormField.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';

const HEADER_TYPES = ['none', 'text', 'image', 'document', 'video'];
const META_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
const BUTTON_TYPES = ['quick_reply', 'url', 'phone'];

// Normaliza el estado legado a la etiqueta del ciclo Meta.
function statusLabel(status) {
  if (status === 'pending_provider_approval') return 'pending';
  return status;
}
const STATUS_TONE = {
  draft: 'draft',
  pending: 'pending',
  pending_provider_approval: 'pending',
  approved: 'active',
  active: 'active',
  rejected: 'failed',
  disabled: 'inactive',
  inactive: 'inactive'
};

function placeholderNumbers(text) {
  const found = new Set();
  const regex = /\{\{\s*(\d+)\s*\}\}/g;
  let match;
  while ((match = regex.exec(String(text || '')))) found.add(Number(match[1]));
  return [...found].sort((a, b) => a - b);
}

function sampleFor(samples, key) {
  return samples.find((sample) => String(sample.key) === String(key))?.example || '';
}

function renderBody(content, samples) {
  return String(content || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, number) => {
    return sampleFor(samples, number) || `{{${number}}}`;
  });
}

const emptyForm = {
  _id: null,
  channel: 'whatsapp_cloud',
  type: 'whatsapp_template',
  name: '',
  language: 'es',
  metaCategory: 'UTILITY',
  messageCategory: 'commercial',
  headerType: 'none',
  headerText: '',
  headerMediaUrl: '',
  content: '',
  footer: '',
  buttons: [],
  variableSamples: []
};

function toForm(row) {
  return {
    _id: row._id,
    channel: row.channel || 'whatsapp_cloud',
    type: row.type || 'whatsapp_template',
    name: row.name || '',
    language: row.language || 'es',
    metaCategory: row.metaCategory || 'UTILITY',
    messageCategory: row.messageCategory || 'commercial',
    headerType: row.headerType || 'none',
    headerText: row.headerText || '',
    headerMediaUrl: row.headerMediaUrl || '',
    content: row.content || '',
    footer: row.footer || '',
    buttons: (row.buttons || []).map((button) => ({
      type: button.type,
      text: button.text || '',
      url: button.url || '',
      phone: button.phone || ''
    })),
    variableSamples: (row.variableSamples || []).map((sample) => ({
      key: String(sample.key),
      example: sample.example || ''
    }))
  };
}

// ---- Vista previa estilo burbuja de WhatsApp ----
function TemplatePreview({ form }) {
  const numbers = placeholderNumbers(form.content);
  return (
    <div className="rounded-xl bg-[#e5ddd5] p-4">
      <div className="max-w-xs rounded-lg rounded-tl-none bg-white p-3 text-sm shadow-sm">
        {form.headerType === 'text' && form.headerText ? (
          <p className="mb-1 font-semibold text-slate-900">
            {renderBody(form.headerText, form.variableSamples)}
          </p>
        ) : null}
        {['image', 'document', 'video'].includes(form.headerType) ? (
          <div className="mb-2 flex h-24 items-center justify-center rounded-md bg-slate-100 text-xs uppercase text-slate-400">
            {form.headerType}
          </div>
        ) : null}
        <p className="whitespace-pre-wrap break-words text-slate-800">
          {renderBody(form.content, form.variableSamples) || (
            <span className="text-slate-400">Escribe el cuerpo del mensaje...</span>
          )}
        </p>
        {form.footer ? (
          <p className="mt-1 text-xs text-slate-400">{form.footer}</p>
        ) : null}
        <span className="mt-1 block text-right text-[10px] text-slate-400">12:00</span>
      </div>
      {form.buttons.length ? (
        <div className="mt-1 max-w-xs space-y-1">
          {form.buttons.map((button, index) => (
            <div
              key={index}
              className="rounded-lg bg-white p-2 text-center text-sm font-medium text-sky-600 shadow-sm"
            >
              {button.text || 'Boton'}
            </div>
          ))}
        </div>
      ) : null}
      {numbers.length ? (
        <p className="mt-2 text-[11px] text-slate-500">
          Variables: {numbers.map((number) => `{{${number}}}`).join(', ')}
        </p>
      ) : null}
    </div>
  );
}

export function MessageTemplatesPage() {
  const [items, setItems] = useState([]);
  const [cloud, setCloud] = useState({ hasCompleteCloudAccount: true, hasCloudAccount: true, missing: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const contentRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [templates, cloudStatus] = await Promise.all([
        getMessageTemplates(),
        getTemplateCloudStatus().catch(() => null)
      ]);
      setItems(templates);
      if (cloudStatus) setCloud(cloudStatus);
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

  const update = (patch) => setForm((current) => ({ ...current, ...patch }));

  function openCreate() {
    setForm(emptyForm);
    setEditorOpen(true);
  }
  function openEdit(row) {
    setForm(toForm(row));
    setEditorOpen(true);
  }

  function insertVariable() {
    const numbers = placeholderNumbers(form.content);
    const next = numbers.length ? Math.max(...numbers) + 1 : 1;
    const token = `{{${next}}}`;
    const textarea = contentRef.current;
    if (textarea && typeof textarea.selectionStart === 'number') {
      const start = textarea.selectionStart;
      const value = `${form.content.slice(0, start)}${token}${form.content.slice(start)}`;
      update({ content: value });
    } else {
      update({ content: `${form.content}${token}` });
    }
  }

  function setButton(index, patch) {
    update({ buttons: form.buttons.map((button, i) => (i === index ? { ...button, ...patch } : button)) });
  }
  function addButton() {
    if (form.buttons.length >= 3) return;
    update({ buttons: [...form.buttons, { type: 'quick_reply', text: '', url: '', phone: '' }] });
  }
  function removeButton(index) {
    update({ buttons: form.buttons.filter((_, i) => i !== index) });
  }

  function setSample(key, example) {
    const others = form.variableSamples.filter((sample) => String(sample.key) !== String(key));
    update({ variableSamples: [...others, { key: String(key), example }] });
  }

  async function save() {
    const numbers = placeholderNumbers(form.content);
    const payload = {
      channel: form.channel,
      type: form.type,
      name: form.name,
      language: form.language,
      content: form.content,
      metaCategory: form.metaCategory,
      messageCategory: form.messageCategory
    };
    if (form.channel === 'whatsapp_cloud') {
      Object.assign(payload, {
        headerType: form.headerType,
        headerText: form.headerText,
        headerMediaUrl: form.headerMediaUrl,
        footer: form.footer,
        buttons: form.buttons,
        variables: numbers.map((number) => String(number)),
        variableSamples: numbers.map((number) => ({
          key: String(number),
          example: sampleFor(form.variableSamples, number)
        }))
      });
    }
    const action = form._id
      ? () => updateMessageTemplate(form._id, payload)
      : () => createMessageTemplate({ ...payload, status: 'draft' });
    const result = await mutate(action, form._id ? 'Plantilla actualizada.' : 'Borrador creado.');
    if (result) setEditorOpen(false);
  }

  const isCloud = form.channel === 'whatsapp_cloud';
  const numbers = placeholderNumbers(form.content);

  const columns = [
    { key: 'name', header: 'Nombre', truncate: true, width: '14rem' },
    { key: 'language', header: 'Idioma', nowrap: true, hideBelow: 'md', width: '5rem' },
    {
      key: 'metaCategory',
      header: 'Categoria',
      nowrap: true,
      hideBelow: 'lg',
      render: (row) => <Badge tone="info">{row.metaCategory || '-'}</Badge>
    },
    {
      key: 'status',
      header: 'Estado',
      nowrap: true,
      render: (row) => (
        <span title={row.status === 'rejected' ? row.rejectionReason || 'Rechazada por Meta' : ''}>
          <Badge tone={STATUS_TONE[row.status] || 'draft'}>{statusLabel(row.status)}</Badge>
        </span>
      )
    },
    { key: 'usageCount', header: 'Usos', nowrap: true, hideBelow: 'lg', render: (row) => row.usageCount || 0 },
    {
      key: 'syncedAt',
      header: 'Sincronizada',
      nowrap: true,
      hideBelow: 'lg',
      render: (row) => <span className="text-xs text-slate-500">{row.syncedAt ? localDate(row.syncedAt) : '-'}</span>
    },
    {
      key: 'actions',
      header: '',
      nowrap: true,
      align: 'right',
      render: (row) => {
        const cloudRow = row.channel === 'whatsapp_cloud' && row.type === 'whatsapp_template';
        const isDraft = row.status === 'draft';
        return (
          <div className="flex items-center justify-end gap-2">
            {isDraft ? (
              <Button variant="secondary" className="min-h-8 px-2" disabled={busy} onClick={() => openEdit(row)}>
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
            <ActionsMenu
              items={[
                {
                  label: 'Registrar en Meta',
                  icon: Send,
                  hidden: !cloudRow || !isDraft,
                  onClick: () => {
                    if (window.confirm(`Registrar "${row.name}" en Meta? Su nombre se normalizara a snake_case y quedara en revision.`)) {
                      mutate(() => registerMessageTemplate(row._id), 'Plantilla enviada a Meta.');
                    }
                  }
                },
                {
                  label: 'Sincronizar',
                  icon: RefreshCw,
                  hidden: !cloudRow,
                  onClick: () => mutate(() => syncMessageTemplates(row._id))
                },
                {
                  label: 'Duplicar como borrador',
                  icon: Copy,
                  hidden: !cloudRow || isDraft,
                  onClick: () => mutate(() => duplicateMessageTemplate(row._id), 'Plantilla duplicada como borrador.')
                },
                {
                  label: 'Desactivar',
                  icon: Trash2,
                  hidden: cloudRow || row.status === 'inactive',
                  onClick: () => mutate(() => disableMessageTemplate(row._id), 'Plantilla desactivada.')
                },
                {
                  label: 'Eliminar',
                  icon: Trash2,
                  tone: 'danger',
                  onClick: () => {
                    if (window.confirm('Eliminar la plantilla localmente? Si esta en Meta, seguira existiendo alli.')) {
                      mutate(() => deleteMessageTemplate(row._id), 'Plantilla eliminada.');
                    }
                  }
                }
              ]}
            />
          </div>
        );
      }
    }
  ];

  return (
    <PageShell
      eyebrow="Inbox"
      title="Plantillas de mensajes"
      description="Redacta, registra en Meta y sincroniza el estado de tus plantillas HSM de WhatsApp."
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => mutate(() => syncMessageTemplates())} disabled={busy || !cloud.hasCompleteCloudAccount}>
            <RefreshCw className="h-4 w-4" />Sincronizar con Meta
          </Button>
          <Button onClick={openCreate} disabled={busy}>
            <Plus className="h-4 w-4" />Crear plantilla
          </Button>
        </div>
      }
    >
      <CrmNotice notice={notice} error={error} />

      {!cloud.hasCompleteCloudAccount ? (
        <EmptyState
          icon={Smartphone}
          title="Configura un numero con API de Meta para usar plantillas"
          description={
            cloud.hasCloudAccount
              ? `Tu numero de Meta esta incompleto${cloud.missing?.length ? ` (falta: ${cloud.missing.join(', ')})` : ''}. Completalo para registrar y enviar plantillas.`
              : 'Las plantillas HSM se registran y envian por un numero de WhatsApp con API de Meta (Cloud). Aun no tienes uno configurado.'
          }
          action={
            <Button as={Link} to="/inbox/whatsapp-numbers">
              <Smartphone className="h-4 w-4" />Ir a Numeros de WhatsApp
            </Button>
          }
        />
      ) : null}

      {loading ? (
        <CrmLoading />
      ) : (
        <Card>
          <CardHeader title={`${items.length} plantillas`} />
          <Table data={items.map((item) => ({ ...item, id: item._id }))} emptyText="No hay plantillas" columns={columns} />
        </Card>
      )}

      <Drawer
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={form._id ? 'Editar borrador' : 'Crear plantilla'}
        description="Solo los borradores se editan. Una plantilla enviada a Meta se duplica para cambiarla."
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditorOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={busy || !form.name || !form.content}>
              {form._id ? 'Guardar' : 'Crear borrador'}
            </Button>
          </>
        }
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Nombre" htmlFor="tpl-name" required hint={isCloud ? 'Se normaliza a snake_case al registrar.' : undefined}>
                <input id="tpl-name" value={form.name} onChange={(event) => update({ name: event.target.value })} className={inputClass} placeholder="confirmacion_cita" />
              </FormField>
              <FormField label="Idioma" htmlFor="tpl-lang">
                <input id="tpl-lang" value={form.language} onChange={(event) => update({ language: event.target.value })} className={inputClass} placeholder="es" />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Canal" htmlFor="tpl-channel">
                <select id="tpl-channel" value={form.channel} onChange={(event) => update({ channel: event.target.value, type: event.target.value === 'whatsapp_cloud' ? 'whatsapp_template' : 'quick_reply' })} className={inputClass}>
                  <option value="whatsapp_cloud">WhatsApp (API de Meta)</option>
                  <option value="internal">Interno (respuesta rapida)</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </FormField>
              {isCloud ? (
                <FormField label="Categoria de Meta" htmlFor="tpl-cat">
                  <select id="tpl-cat" value={form.metaCategory} onChange={(event) => update({ metaCategory: event.target.value })} className={inputClass}>
                    {META_CATEGORIES.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </FormField>
              ) : null}
            </div>

            {isCloud ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Cabecera" htmlFor="tpl-header-type">
                    <select id="tpl-header-type" value={form.headerType} onChange={(event) => update({ headerType: event.target.value })} className={inputClass}>
                      {HEADER_TYPES.map((value) => <option key={value} value={value}>{value === 'none' ? 'Sin cabecera' : value}</option>)}
                    </select>
                  </FormField>
                  {form.headerType === 'text' ? (
                    <FormField label="Texto de cabecera" htmlFor="tpl-header-text">
                      <input id="tpl-header-text" value={form.headerText} onChange={(event) => update({ headerText: event.target.value })} className={inputClass} placeholder="Hola {{1}}" />
                    </FormField>
                  ) : null}
                  {['image', 'document', 'video'].includes(form.headerType) ? (
                    <FormField label="URL publica del media" htmlFor="tpl-header-media" hint="Debe ser accesible por Meta.">
                      <input id="tpl-header-media" value={form.headerMediaUrl} onChange={(event) => update({ headerMediaUrl: event.target.value })} className={inputClass} placeholder="https://..." />
                    </FormField>
                  ) : null}
                </div>
              </>
            ) : null}

            <FormField
              label="Cuerpo"
              htmlFor="tpl-content"
              required
              hint="Usa variables numeradas para personalizar."
            >
              <div className="space-y-2">
                <textarea id="tpl-content" ref={contentRef} value={form.content} onChange={(event) => update({ content: event.target.value })} className={`${inputClass} min-h-28`} placeholder="Hola {{1}}, tu cita es el {{2}}." />
                {isCloud ? (
                  <Button type="button" variant="secondary" className="min-h-8 px-2 text-xs" onClick={insertVariable}>
                    <Variable className="h-4 w-4" />Insertar variable
                  </Button>
                ) : null}
              </div>
            </FormField>

            {isCloud && numbers.length ? (
              <FormField label="Ejemplos de variables" hint="Meta los exige para aprobar la plantilla.">
                <div className="space-y-2">
                  {numbers.map((number) => (
                    <div key={number} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-xs font-semibold text-slate-500">{`{{${number}}}`}</span>
                      <input
                        value={sampleFor(form.variableSamples, number)}
                        onChange={(event) => setSample(number, event.target.value)}
                        className={inputClass}
                        placeholder={`Ejemplo para {{${number}}}`}
                      />
                    </div>
                  ))}
                </div>
              </FormField>
            ) : null}

            {isCloud ? (
              <FormField label="Pie (opcional)" htmlFor="tpl-footer">
                <input id="tpl-footer" value={form.footer} onChange={(event) => update({ footer: event.target.value })} className={inputClass} placeholder="Equipo de soporte" />
              </FormField>
            ) : null}

            {isCloud ? (
              <FormField label={`Botones (${form.buttons.length}/3)`}>
                <div className="space-y-2">
                  {form.buttons.map((button, index) => (
                    <div key={index} className="grid gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-[8rem_1fr_auto]">
                      <select value={button.type} onChange={(event) => setButton(index, { type: event.target.value })} className={inputClass}>
                        {BUTTON_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                      <input value={button.text} onChange={(event) => setButton(index, { text: event.target.value })} className={inputClass} placeholder="Texto del boton" maxLength={25} />
                      {button.type === 'url' ? (
                        <input value={button.url} onChange={(event) => setButton(index, { url: event.target.value })} className={`${inputClass} sm:col-span-3`} placeholder="https://..." />
                      ) : null}
                      {button.type === 'phone' ? (
                        <input value={button.phone} onChange={(event) => setButton(index, { phone: event.target.value })} className={`${inputClass} sm:col-span-3`} placeholder="+593999999999" />
                      ) : null}
                      <Button type="button" variant="danger" className="min-h-8 px-2 sm:col-start-3" onClick={() => removeButton(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {form.buttons.length < 3 ? (
                    <Button type="button" variant="secondary" className="min-h-8 px-2 text-xs" onClick={addButton}>
                      <Plus className="h-4 w-4" />Agregar boton
                    </Button>
                  ) : null}
                </div>
              </FormField>
            ) : null}
          </div>

          <div className="lg:sticky lg:top-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Vista previa</p>
            <TemplatePreview form={form} />
          </div>
        </div>
      </Drawer>
    </PageShell>
  );
}
