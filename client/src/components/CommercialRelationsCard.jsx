import { Link2, Trash2 } from 'lucide-react';
import { Badge } from './Badge.jsx';
import { Button } from './Button.jsx';
import { Card, CardHeader } from './Card.jsx';
import { FormField } from './FormField.jsx';
import { inputClass, localDate, money } from './CrmCommon.jsx';

const relationTypes = [
  ['buyer', 'Comprador'],
  ['interested', 'Interesado'],
  ['decision_maker', 'Decisor'],
  ['participant', 'Participante'],
  ['primary_contact', 'Contacto principal'],
  ['secondary_contact', 'Contacto secundario'],
  ['other', 'Otro']
];

function relatedRecord(context, relation) {
  return context === 'contact' ? relation.opportunityId : relation.contactId;
}

export function CommercialRelationsCard({
  context,
  primaryRecords = [],
  relations = [],
  options = [],
  busy = false,
  canManage = false,
  onCreate,
  onDelete
}) {
  const targetName = context === 'contact' ? 'oportunidad' : 'contacto';
  const linkedIds = new Set([
    ...primaryRecords.map((record) => String(record._id)),
    ...relations.map((relation) => String(relatedRecord(context, relation)?._id))
  ]);
  const availableOptions = options.filter((option) => !linkedIds.has(String(option._id)));

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await onCreate({
      targetId: data.get('targetId'),
      relationType: data.get('relationType'),
      channel: data.get('channel'),
      campaign: data.get('campaign'),
      consultedProduct: data.get('consultedProduct'),
      purchasedProduct: data.get('purchasedProduct'),
      notes: data.get('notes')
    });
    if (created !== false) form.reset();
  }

  return (
    <Card>
      <CardHeader
        title="Relaciones comerciales"
        description="Contactos y oportunidades vinculados para entender participantes e influencia en la venta."
      />
      <div className="space-y-4 p-5">
        {primaryRecords.map((record) => (
          <div key={`primary-${record._id}`} className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{context === 'contact' ? record.title : record.name}</strong>
              <Badge tone="active">Relacion principal</Badge>
            </div>
            {context === 'contact' ? (
              <p className="mt-1 text-xs text-slate-600">{money(record.value, record.currency)} - {record.status}</p>
            ) : (
              <p className="mt-1 text-xs text-slate-600">{record.email || record.phone || 'Sin datos de contacto'}</p>
            )}
          </div>
        ))}
        {relations.map((relation) => {
          const record = relatedRecord(context, relation);
          return (
            <div key={relation._id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <strong>{context === 'contact' ? record?.title : record?.name}</strong>
                  <p className="mt-1 text-xs text-slate-500">
                    {relationTypes.find(([value]) => value === relation.relationType)?.[1] || relation.relationType}
                    {' - '}
                    {localDate(relation.relatedAt)}
                  </p>
                </div>
                {canManage ? (
                  <Button
                    variant="danger"
                    className="min-h-8 px-2"
                    disabled={busy}
                    onClick={() => window.confirm('Eliminar esta relacion comercial?') && onDelete(relation._id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              {relation.channel || relation.campaign ? <p className="mt-2 text-xs text-slate-600">Canal: {relation.channel || '-'} - Campana: {relation.campaign || '-'}</p> : null}
              {relation.consultedProduct || relation.purchasedProduct ? <p className="mt-1 text-xs text-slate-600">Consultado: {relation.consultedProduct || '-'} - Comprado: {relation.purchasedProduct || '-'}</p> : null}
              {relation.notes ? <p className="mt-2 text-sm text-slate-700">{relation.notes}</p> : null}
            </div>
          );
        })}
        {!primaryRecords.length && !relations.length ? (
          <p className="text-sm text-slate-500">No hay relaciones comerciales registradas.</p>
        ) : null}
        {canManage ? (
          <form className="grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2" onSubmit={submit}>
            <FormField label={`Relacionar ${targetName}`} htmlFor={`${context}-relation-target`} required>
              <select id={`${context}-relation-target`} required name="targetId" className={inputClass}>
                <option value="">Seleccionar</option>
                {availableOptions.map((option) => (
                  <option key={option._id} value={option._id}>
                    {context === 'contact' ? option.title : option.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Tipo de relacion" htmlFor={`${context}-relation-type`}>
              <select id={`${context}-relation-type`} name="relationType" className={inputClass} defaultValue="participant">
                {relationTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </FormField>
            <FormField label="Canal de ingreso" htmlFor={`${context}-relation-channel`}>
              <input id={`${context}-relation-channel`} name="channel" className={inputClass} />
            </FormField>
            <FormField label="Campana" htmlFor={`${context}-relation-campaign`}>
              <input id={`${context}-relation-campaign`} name="campaign" className={inputClass} />
            </FormField>
            <FormField label="Producto consultado" htmlFor={`${context}-relation-consulted`}>
              <input id={`${context}-relation-consulted`} name="consultedProduct" className={inputClass} />
            </FormField>
            <FormField label="Producto comprado" htmlFor={`${context}-relation-purchased`}>
              <input id={`${context}-relation-purchased`} name="purchasedProduct" className={inputClass} />
            </FormField>
            <FormField className="md:col-span-2" label="Notas de la relacion" htmlFor={`${context}-relation-notes`}>
              <textarea id={`${context}-relation-notes`} name="notes" className={`${inputClass} min-h-20`} />
            </FormField>
            <div className="md:col-span-2">
              <Button type="submit" disabled={busy || !availableOptions.length}>
                <Link2 className="h-4 w-4" />
                Agregar relacion
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </Card>
  );
}
