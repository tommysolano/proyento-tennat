import { BarChart3, RotateCcw } from 'lucide-react';
import { Button } from './Button.jsx';
import { Card, CardHeader } from './Card.jsx';
import { CrmLoadError, CrmLoading } from './CrmCommon.jsx';

const statusLabels = {
  scheduled: 'Programada',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No asistio',
  rescheduled: 'Reprogramada'
};

function CountList({ title, items, labelKey }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="space-y-2 p-4">
        {items.slice(0, 10).map((item) => (
          <div
            key={`${item[labelKey]}-${item.count}`}
            className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
          >
            <span>
              {labelKey === 'status'
                ? statusLabels[item[labelKey]] || item[labelKey]
                : item[labelKey]}
            </span>
            <strong>{item.count}</strong>
          </div>
        ))}
        {!items.length ? (
          <p className="text-sm text-slate-500">Sin datos en este rango.</p>
        ) : null}
      </div>
    </Card>
  );
}

export function AppointmentAnalyticsPanel({ report, loading, error, onRetry }) {
  if (loading) return <CrmLoading label="Calculando analitica de citas..." />;
  if (error) return <CrmLoadError message={error} onRetry={onRetry} />;
  if (!report?.total) {
    return (
      <Card className="p-6 text-center text-sm text-slate-500">
        No hay citas para analizar en el rango seleccionado.
      </Card>
    );
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <BarChart3 className="h-5 w-5 text-cyan-700" />
            Analitica de citas
          </h2>
          <p className="text-sm text-slate-500">
            {report.total} citas. Canceladas: {report.cancelled}. Reprogramadas: {report.rescheduled}.
          </p>
        </div>
        <Button variant="ghost" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" />Actualizar
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CountList title="Por dia de semana" items={report.byWeekday || []} labelKey="day" />
        <CountList title="Por fecha" items={report.byDate || []} labelKey="date" />
        <CountList title="Por hora" items={report.byHour || []} labelKey="hour" />
        <CountList title="Por calendario" items={report.byCalendar || []} labelKey="calendar" />
        <CountList title="Por estado" items={report.byStatus || []} labelKey="status" />
        <CountList title="Por responsable" items={report.byAssignee || []} labelKey="assignee" />
        <CountList title="Por canal" items={report.byChannel || []} labelKey="channel" />
        <CountList title="Por campana" items={report.byCampaign || []} labelKey="campaign" />
      </div>
      <Card>
        <CardHeader
          title="Dia de contacto frente al dia reservado"
          description={report.precision}
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Reserva</th>
                <th className="px-4 py-3">Franja</th>
                <th className="px-4 py-3">Cantidad</th>
                <th className="px-4 py-3">Promedio dias</th>
              </tr>
            </thead>
            <tbody>
              {(report.behavior || []).map((row) => (
                <tr
                  key={`${row.contactDay}-${row.reservationDay}-${row.timeBand}`}
                  className="border-t border-slate-100"
                >
                  <td className="px-4 py-3">{row.contactDay}</td>
                  <td className="px-4 py-3">{row.reservationDay}</td>
                  <td className="px-4 py-3">{row.timeBand}</td>
                  <td className="px-4 py-3">{row.count}</td>
                  <td className="px-4 py-3">{row.averageLeadDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.behavior?.length ? (
            <p className="p-4 text-sm text-slate-500">
              No hay relaciones de contacto y reserva para mostrar.
            </p>
          ) : null}
        </div>
      </Card>
    </section>
  );
}
