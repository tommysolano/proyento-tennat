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
          <input required name="name" className={inputClass} placeholder="Nombre" />
          <select name="channel" className={inputClass}>{['internal', 'whatsapp_cloud', 'email', 'sms'].map((value) => <option key={value}>{value}</option>)}</select>
          <select name="type" className={inputClass}>{['quick_reply', 'whatsapp_template', 'email_template', 'sms_template'].map((value) => <option key={value}>{value}</option>)}</select>
          <input name="language" defaultValue="es" className={inputClass} placeholder="Idioma" />
          <input name="category" defaultValue="utility" className={inputClass} placeholder="Categoria" />
          <input name="variables" className={inputClass} placeholder="Variables separadas por coma" />
          <input name="providerTemplateId" className={inputClass} placeholder="ID/nombre en proveedor (opcional)" />
          <select name="status" defaultValue="active" className={inputClass}>{['draft', 'active', 'inactive', 'pending_provider_approval'].map((value) => <option key={value}>{value}</option>)}</select>
          <textarea required name="content" className={`${inputClass} min-h-24 xl:col-span-2`} placeholder="Contenido del mensaje" />
          <Button type="submit" disabled={busy}><Plus className="h-4 w-4" />Crear plantilla</Button>
        </form>
      </Card>
    </PageShell>
  );
}
