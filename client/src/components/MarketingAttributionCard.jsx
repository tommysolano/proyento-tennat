import { Card, CardHeader } from './Card.jsx';
import { localDate } from './CrmCommon.jsx';

function valueOf(value) {
  return value?._id ? value.name || value._id : value || '-';
}

export function MarketingAttributionCard({ attribution = {} }) {
  const rows = [
    ['Campana', attribution.campaignId || attribution.campaignName || attribution.utmCampaign],
    ['Canal de ingreso', attribution.entryChannel || attribution.channel],
    ['Fuente / medio', [attribution.source || attribution.utmSource, attribution.medium || attribution.utmMedium].filter(Boolean).join(' / ')],
    ['Anuncio', attribution.adName || attribution.externalAdId || attribution.adReference],
    ['Producto consultado', attribution.consultedProduct],
    ['Producto comprado', attribution.purchasedProduct],
    ['Categoria consultada', attribution.consultedCategory],
    ['Categoria comprada', attribution.purchasedCategory],
    ['Formulario', attribution.formId],
    ['Landing', attribution.landingPageId || attribution.landingPageUrl],
    ['Funnel / paso', [valueOf(attribution.funnelId), valueOf(attribution.funnelStepId)].filter((value) => value !== '-').join(' / ')],
    ['Integracion', attribution.integrationId],
    ['Primera interaccion', localDate(attribution.firstInteractionAt)],
    ['Ultima interaccion', localDate(attribution.lastInteractionAt)]
  ].filter(([, value]) => value && value !== '-');

  return <Card>
    <CardHeader title="Atribucion de marketing" description="Origen conservado desde captacion, funnel o integracion." />
    <dl className="grid gap-3 p-5 sm:grid-cols-2">
      {rows.map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-800">{valueOf(value)}</dd></div>)}
      {!rows.length ? <p className="text-sm text-slate-500">No hay datos de atribucion para este registro.</p> : null}
    </dl>
  </Card>;
}
