import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  createCustomField,
  createPipeline,
  createPipelineStage,
  createSegment,
  createTag,
  deleteCustomField,
  deleteSegment,
  deleteTag,
  getCustomFields,
  getPipelines,
  getSegments,
  getTags,
  importContacts,
  updateCustomField,
  updatePipeline,
  updatePipelineStage,
  updateSegment,
  updateTag
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass } from '../../components/CrmCommon.jsx';
import { FormField } from '../../components/FormField.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

function useCatalog(loader) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await loader()); } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [loader]);
  useEffect(() => { load(); }, [load]);
  async function mutate(action, message) {
    setError('');
    try { await action(); setNotice(message); await load(); return true; }
    catch (requestError) { setError(requestError.message); return false; }
  }
  return { items, loading, notice, error, setError, load, mutate };
}

export function TagsPage() {
  const catalog = useCatalog(getTags);
  async function create(event) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (await catalog.mutate(() => createTag({ name: data.get('name'), color: data.get('color'), description: data.get('description'), scope: data.get('scope') }), 'Tag creado.')) form.reset();
  }
  return <PageShell eyebrow="CRM" title="Tags" description="Etiquetas aisladas por empresa y por base de informacion."><CrmNotice notice={catalog.notice} error={catalog.error} />{catalog.loading ? <CrmLoading /> : <Card><CardHeader title="Etiquetas disponibles" /><Table data={catalog.items.map((item) => ({ ...item, id: item._id }))} columns={[
    { key: 'name', header: 'Nombre', render: (row) => <span className="rounded-full px-2 py-1 text-xs font-semibold" style={{ color: row.color, backgroundColor: `${row.color}20` }}>{row.name}</span> },
    { key: 'scope', header: 'Base', render: (row) => row.scope || 'contact' },
    { key: 'description', header: 'Descripcion' },
    { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
    { key: 'edit', header: '', render: (row) => <Button variant="secondary" className="min-h-8 px-2" onClick={() => { const name = window.prompt('Nuevo nombre', row.name); if (name) catalog.mutate(() => updateTag(row._id, { name }), 'Tag actualizado.'); }}>Editar</Button> },
    { key: 'delete', header: '', render: (row) => row.status === 'active' ? <Button variant="danger" className="min-h-8 px-2" onClick={() => catalog.mutate(() => deleteTag(row._id), 'Tag desactivado.')}><Trash2 className="h-4 w-4" /></Button> : null }
  ]} /></Card>}<Card><CardHeader title="Crear tag" description="La base evita mezclar etiquetas de contactos, oportunidades y otros modulos." /><form onSubmit={create} className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-5"><FormField label="Nombre" htmlFor="tag-name" required><input id="tag-name" required name="name" className={inputClass} /></FormField><FormField label="Base" htmlFor="tag-scope"><select id="tag-scope" name="scope" className={inputClass} defaultValue="contact"><option value="contact">Contactos</option><option value="opportunity">Oportunidades</option><option value="appointment">Citas</option><option value="workflow">Workflows</option></select></FormField><FormField label="Color" htmlFor="tag-color"><input id="tag-color" type="color" name="color" defaultValue="#0e7490" className={`${inputClass} h-11`} /></FormField><FormField label="Descripcion" htmlFor="tag-description"><input id="tag-description" name="description" className={inputClass} /></FormField><div className="flex items-end"><Button className="w-full" type="submit"><Plus className="h-4 w-4" />Crear</Button></div></form></Card></PageShell>;
}

export function CustomFieldsPage() {
  const catalog = useCatalog(getCustomFields);
  async function create(event) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (await catalog.mutate(() => createCustomField({
      entityType: data.get('entityType'), key: data.get('key'), label: data.get('label'),
      type: data.get('type'), required: data.get('required') === 'on',
      options: String(data.get('options') || '').split(',').map((value) => value.trim()).filter(Boolean),
      order: Number(data.get('order') || 0)
    }), 'Campo personalizado creado.')) form.reset();
  }
  return <PageShell eyebrow="CRM" title="Campos personalizados" description="Definiciones dinamicas para contactos y oportunidades."><CrmNotice notice={catalog.notice} error={catalog.error} />{catalog.loading ? <CrmLoading /> : <Card><CardHeader title="Campos configurados" /><Table data={catalog.items.map((item) => ({ ...item, id: item._id }))} columns={[
    { key: 'label', header: 'Etiqueta' }, { key: 'key', header: 'Key' }, { key: 'entityType', header: 'Entidad' }, { key: 'type', header: 'Tipo' },
    { key: 'required', header: 'Requerido', render: (row) => row.required ? 'Si' : 'No' },
    { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
    { key: 'edit', header: '', render: (row) => <Button variant="secondary" className="min-h-8 px-2" onClick={() => { const label = window.prompt('Nueva etiqueta', row.label); if (label) catalog.mutate(() => updateCustomField(row._id, { label }), 'Campo actualizado.'); }}>Editar</Button> },
    { key: 'delete', header: '', render: (row) => row.status === 'active' ? <Button variant="danger" className="min-h-8 px-2" onClick={() => catalog.mutate(() => deleteCustomField(row._id), 'Campo desactivado.')}><Trash2 className="h-4 w-4" /></Button> : null }
  ]} /></Card>}<Card><CardHeader title="Crear campo" /><form onSubmit={create} className="grid gap-3 p-5 md:grid-cols-3"><select name="entityType" className={inputClass}><option value="contact">Contacto</option><option value="opportunity">Oportunidad</option></select><input required name="key" pattern="[a-z][a-z0-9_]*" className={inputClass} placeholder="key_interna" /><input required name="label" className={inputClass} placeholder="Etiqueta visible" /><select name="type" className={inputClass}>{['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'boolean', 'phone', 'email', 'url'].map((value) => <option key={value}>{value}</option>)}</select><input name="options" className={inputClass} placeholder="Opciones separadas por coma" /><input name="order" type="number" className={inputClass} placeholder="Orden" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="required" />Requerido</label><Button type="submit"><Plus className="h-4 w-4" />Crear campo</Button></form></Card></PageShell>;
}

export function SegmentsPage() {
  const { user } = useAuth();
  const catalog = useCatalog(getSegments);
  async function create(event) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    let filters;
    try { filters = JSON.parse(data.get('filters')); } catch { catalog.setError('JSON invalido'); return; }
    if (await catalog.mutate(() => createSegment({ name: data.get('name'), description: data.get('description'), filters }), 'Segmento creado.')) form.reset();
  }
  return <PageShell eyebrow="CRM" title="Segmentos" description="Filtros guardados; el alcance final siempre se aplica en backend."><CrmNotice notice={catalog.notice} error={catalog.error} />{catalog.loading ? <CrmLoading /> : <Card><CardHeader title="Segmentos guardados" /><Table data={catalog.items.map((item) => ({ ...item, id: item._id, filterLabel: JSON.stringify(item.filters) }))} columns={[{ key: 'name', header: 'Nombre' }, { key: 'description', header: 'Descripcion' }, { key: 'filterLabel', header: 'Filtros' }, ...(user.role === 'ADMIN' ? [{ key: 'edit', header: '', render: (row) => <Button variant="secondary" className="min-h-8 px-2" onClick={() => { const name = window.prompt('Nuevo nombre', row.name); if (name) catalog.mutate(() => updateSegment(row._id, { name }), 'Segmento actualizado.'); }}>Editar</Button> }, { key: 'delete', header: '', render: (row) => <Button variant="danger" className="min-h-8 px-2" onClick={() => catalog.mutate(() => deleteSegment(row._id), 'Segmento desactivado.')}><Trash2 className="h-4 w-4" /></Button> }] : [])]} /></Card>}{user.role === 'ADMIN' ? <Card><CardHeader title="Guardar segmento" /><form onSubmit={create} className="space-y-3 p-5"><input required name="name" className={inputClass} placeholder="Nombre" /><input name="description" className={inputClass} placeholder="Descripcion" /><textarea required name="filters" defaultValue={'{"status":"seguimiento","priority":"high"}'} className={`${inputClass} min-h-28 font-mono`} /><Button type="submit"><Plus className="h-4 w-4" />Guardar segmento</Button></form></Card> : null}</PageShell>;
}

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) throw new Error('El CSV requiere cabecera y al menos una fila');
  const parseLine = (line) => {
    const values = []; let value = ''; let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; }
      else value += char;
    }
    values.push(value.trim()); return values;
  };
  const headers = parseLine(rows[0]);
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, parseLine(row)[index] || ''])));
}

export function ImportContactsPage() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const text = data.get('data'); let contacts;
      try { contacts = JSON.parse(text); } catch { contacts = parseCsv(text); }
      setResult(await importContacts(contacts, data.get('updateDuplicates') === 'on'));
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  return <PageShell eyebrow="CRM" title="Importar contactos" description="MVP por JSON o CSV pegado, hasta 1000 filas. No permite enviar companyId."><CrmNotice error={error} />{result ? <Card className="p-5"><p className="font-semibold">Creados: {result.created} · Actualizados: {result.updated} · Duplicados: {result.duplicates} · Errores: {result.errors.length}</p>{result.errors.map((item) => <p key={item.row} className="text-sm text-rose-700">Fila {item.row}: {item.message}</p>)}</Card> : null}<Card><CardHeader title="Datos a importar" description="Cabeceras sugeridas: name,phone,email,source." /><form onSubmit={submit} className="space-y-4 p-5"><textarea required name="data" className={`${inputClass} min-h-72 font-mono`} placeholder={'name,phone,email,source\nAna,+593999999999,ana@example.com,Referido'} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="updateDuplicates" />Actualizar duplicados por telefono o email</label><Button type="submit" disabled={busy}>{busy ? 'Importando...' : 'Importar contactos'}</Button></form></Card></PageShell>;
}

export function PipelinesPage() {
  const catalog = useCatalog(getPipelines);
  const [selected, setSelected] = useState('');
  const pipeline = catalog.items.find((item) => item._id === selected) || catalog.items[0];
  async function createPipe(event) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (await catalog.mutate(() => createPipeline({ name: data.get('name'), description: data.get('description') }), 'Pipeline creado.')) form.reset();
  }
  async function createStage(event) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (await catalog.mutate(() => createPipelineStage(pipeline._id, { name: data.get('name'), order: Number(data.get('order')), probability: Number(data.get('probability')), color: data.get('color') }), 'Etapa creada.')) form.reset();
  }
  return <PageShell eyebrow="CRM" title="Configurar pipelines" description="Pipelines y etapas ordenadas por empresa."><CrmNotice notice={catalog.notice} error={catalog.error} />{catalog.loading ? <CrmLoading /> : <><Card><CardHeader title="Pipelines" action={pipeline ? <Button variant="secondary" onClick={() => { const name = window.prompt('Nuevo nombre', pipeline.name); if (name) catalog.mutate(() => updatePipeline(pipeline._id, { name }), 'Pipeline actualizado.'); }}>Editar pipeline</Button> : null} /><div className="flex flex-wrap gap-2 p-5">{catalog.items.map((item) => <Button key={item._id} variant={pipeline?._id === item._id ? 'primary' : 'secondary'} onClick={() => setSelected(item._id)}>{item.name}</Button>)}</div>{pipeline ? <Table data={pipeline.stages.map((stage) => ({ ...stage, id: stage._id }))} columns={[{ key: 'order', header: 'Orden' }, { key: 'name', header: 'Etapa' }, { key: 'probability', header: 'Probabilidad', render: (row) => `${row.probability}%` }, { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> }, { key: 'edit', header: '', render: (row) => <Button variant="secondary" className="min-h-8 px-2" onClick={() => { const name = window.prompt('Nuevo nombre', row.name); if (name) catalog.mutate(() => updatePipelineStage(pipeline._id, row._id, { name }), 'Etapa actualizada.'); }}>Editar</Button> }, { key: 'disable', header: '', render: (row) => <Button variant="secondary" className="min-h-8 px-2" onClick={() => catalog.mutate(() => updatePipelineStage(pipeline._id, row._id, { status: 'inactive' }), 'Etapa desactivada.')}>Desactivar</Button> }]} /> : null}</Card><div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader title="Nuevo pipeline" /><form onSubmit={createPipe} className="space-y-3 p-5"><input required name="name" className={inputClass} placeholder="Nombre" /><input name="description" className={inputClass} placeholder="Descripcion" /><Button type="submit"><Plus className="h-4 w-4" />Crear pipeline</Button></form></Card>{pipeline ? <Card><CardHeader title={`Nueva etapa en ${pipeline.name}`} /><form onSubmit={createStage} className="grid gap-3 p-5 sm:grid-cols-2"><input required name="name" className={inputClass} placeholder="Nombre" /><input required name="order" type="number" defaultValue={pipeline.stages.length} className={inputClass} /><input name="probability" type="number" min="0" max="100" defaultValue="0" className={inputClass} /><input name="color" type="color" defaultValue="#0e7490" className={`${inputClass} h-11`} /><Button type="submit"><Plus className="h-4 w-4" />Crear etapa</Button></form></Card> : null}</div></>}</PageShell>;
}
