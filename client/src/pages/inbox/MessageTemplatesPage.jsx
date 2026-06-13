import { CheckCircle2, Plus, Power, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  createMessageTemplate,
  disableMessageTemplate,
  getMessageTemplates,
  updateMessageTemplate
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass } from '../../components/CrmCommon.jsx';
import { FormField } from '../../components/FormField.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';

export function MessageTemplatesPage() {
  const [items, setItems] = useState([]);
  const [channel, setChannel] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await getMessageTemplates({ channel })); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [channel]);
  useEffect(() => { load(); }, [load]);

  async function mutate(action, success) {
    setBusy(true); setError('');
    try { await action(); setNotice(success); await load(); return true; }
    catch (requestError) { setError(requestError.message); return false; }
    finally { setBusy(false); }
  }

  async function create(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const saved = await mutate(() => createMessageTemplate({
      name: data.get('name'),
      channel: data.get('channel'),
      type: data.get('type'),
      language: data.get('language'),
      category: data.get('category'),
      messageCategory: data.get('messageCategory'),
      content: data.get('content'),
      variables: String(data.get('variables') || '').split(',').map((value) => value.trim()).filter(Boolean),
      providerTemplateId: data.get('providerTemplateId'),
      status: data.get('status')
    }), 'Plantilla creada.');
    if (saved) form.reset();
  }

  return (
    <PageShell eyebrow="Inbox" title="Plantillas de mensajes" description="Respuestas rapidas y estructura preparada para templates de WhatsApp.">
      <CrmNotice notice={notice} error={error} />
      <select className={`${inputClass} max-w-xs`} value={channel} onChange={(event) => setChannel(event.target.value)}><option value="">Todos los canales</option>{['internal', 'whatsapp_cloud', 'email', 'sms'].map((value) => <option key={value}>{value}</option>)}</select>
      {loading ? <CrmLoading /> : <Card>
        <CardHeader title={`${items.length} plantillas`} />
        <Table data={items.map((item) => ({ ...item, id: item._id }))} emptyText="No hay plantillas" columns={[
          { key: 'name', header: 'Nombre' },
          { key: 'channel', header: 'Canal' },
          { key: 'type', header: 'Tipo' },
          { key: 'messageCategory', header: 'Clasificacion' },
          { key: 'content', header: 'Contenido' },
          { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
          { key: 'edit', header: '', render: (row) => <Button variant="secondary" className="min-h-8 px-2" onClick={() => { const content = window.prompt('Contenido', row.content); if (content?.trim()) mutate(() => updateMessageTemplate(row._id, { content }), 'Plantilla actualizada.'); }}><Save className="h-4 w-4" /></Button> },
          { key: 'statusAction', header: '', render: (row) => row.status !== 'inactive'
            ? <Button variant="danger" className="min-h-8 px-2" onClick={() => mutate(() => disableMessageTemplate(row._id), 'Plantilla desactivada.')}><Power className="h-4 w-4" /></Button>
            : <Button variant="secondary" className="min-h-8 px-2" onClick={() => mutate(() => updateMessageTemplate(row._id, { status: 'active' }), 'Plantilla activada.')}><CheckCircle2 className="h-4 w-4" /></Button> }
        ]} />
      </Card>}
      <Card>
        <CardHeader title="Crear plantilla" />
        <form onSubmit={create} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          <FormField label="Nombre" htmlFor="template-name" required>
            <input id="template-name" required name="name" className={inputClass} placeholder="Ej. Confirmacion de cita" />
          </FormField>
          <FormField label="Canal" htmlFor="template-channel">
            <select id="template-channel" name="channel" className={inputClass}>{['internal', 'whatsapp_cloud', 'email', 'sms'].map((value) => <option key={value}>{value}</option>)}</select>
          </FormField>
          <FormField label="Tipo" htmlFor="template-type">
            <select id="template-type" name="type" className={inputClass}>{['quick_reply', 'whatsapp_template', 'email_template', 'sms_template'].map((value) => <option key={value}>{value}</option>)}</select>
          </FormField>
          <FormField label="Idioma" htmlFor="template-language">
            <input id="template-language" name="language" defaultValue="es" className={inputClass} placeholder="es" />
          </FormField>
          <FormField label="Categoria" htmlFor="template-category">
            <input id="template-category" name="category" defaultValue="utility" className={inputClass} placeholder="utility" />
          </FormField>
          <FormField label="Clasificacion del mensaje" htmlFor="template-message-category">
            <select id="template-message-category" name="messageCategory" defaultValue="reply" className={inputClass}>
              <option value="commercial">Comercial</option>
              <option value="transactional">Transaccional</option>
              <option value="operational">Operativo</option>
              <option value="reply">Respuesta</option>
            </select>
          </FormField>
          <FormField label="Variables" htmlFor="template-variables" hint="Separa los nombres con comas.">
            <input id="template-variables" name="variables" className={inputClass} placeholder="nombre, fecha, hora" />
          </FormField>
          <FormField label="ID o nombre en proveedor" htmlFor="template-provider-id" hint="Solo aplica a plantillas gestionadas por un proveedor externo.">
            <input id="template-provider-id" name="providerTemplateId" className={inputClass} placeholder="Opcional" />
          </FormField>
          <FormField label="Estado" htmlFor="template-status">
            <select id="template-status" name="status" defaultValue="active" className={inputClass}>{['draft', 'active', 'inactive', 'pending_provider_approval'].map((value) => <option key={value}>{value}</option>)}</select>
          </FormField>
          <FormField label="Contenido del mensaje" htmlFor="template-content" className="xl:col-span-2" required>
            <textarea id="template-content" required name="content" className={`${inputClass} min-h-24`} placeholder="Escribe el mensaje que recibira el contacto." />
          </FormField>
          <Button type="submit" disabled={busy}><Plus className="h-4 w-4" />Crear plantilla</Button>
        </form>
      </Card>
    </PageShell>
  );
}
