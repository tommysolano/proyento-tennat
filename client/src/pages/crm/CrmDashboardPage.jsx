import { Activity, CircleDollarSign, ContactRound, ListTodo, Target, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getCrmDashboard } from '../../api.js';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, localDate, money } from '../../components/CrmCommon.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';

export function CrmDashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getCrmDashboard().then(setData).catch((requestError) => setError(requestError.message));
  }, []);

  return (
    <PageShell eyebrow="CRM operativo" title="Resumen comercial" description="Contactos, oportunidades, tareas y seguimientos dentro de tu alcance.">
      <CrmNotice error={error} />
      {!data ? <CrmLoading /> : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Contactos" value={data.contactsTotal} helper="Cartera visible" icon={ContactRound} tone="cyan" />
            <MetricCard label="Oportunidades abiertas" value={data.opportunitiesOpen} helper={money(data.openValue)} icon={Target} tone="amber" />
            <MetricCard label="Ganadas" value={data.opportunitiesWon} helper={money(data.wonValue)} icon={Trophy} tone="emerald" />
            <MetricCard label="Tareas pendientes" value={data.pendingTasks} helper={`${data.overdueFollowUps} seguimientos vencidos`} icon={ListTodo} tone="rose" />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Embudo actual" description="Distribucion comercial del alcance activo." />
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-500">Valor abierto</p><p className="mt-1 text-xl font-semibold">{money(data.openValue)}</p></div>
                <div className="rounded-lg bg-emerald-50 p-4"><p className="text-xs text-emerald-700">Valor ganado</p><p className="mt-1 text-xl font-semibold text-emerald-900">{money(data.wonValue)}</p></div>
                <div className="rounded-lg bg-rose-50 p-4"><p className="text-xs text-rose-700">Perdidas</p><p className="mt-1 text-xl font-semibold text-rose-900">{data.opportunitiesLost}</p></div>
                <div className="rounded-lg bg-cyan-50 p-4"><p className="text-xs text-cyan-700">Seguimientos de hoy</p><p className="mt-1 text-xl font-semibold text-cyan-900">{data.todayFollowUps}</p></div>
              </div>
            </Card>
            <Card>
              <CardHeader title="Contactos por estado" />
              <div className="space-y-2 p-5">
                {Object.entries(data.contactsByStatus).map(([status, count]) => <div key={status} className="flex justify-between rounded-md border border-slate-100 px-3 py-2 text-sm"><span>{status.replaceAll('_', ' ')}</span><strong>{count}</strong></div>)}
              </div>
            </Card>
          </div>
          <Card>
            <CardHeader title="Desempeno por agente" description="Contactos, oportunidades y tareas dentro del equipo visible." />
            <Table data={data.performance.map((row) => ({ ...row, id: row.agent._id, name: row.agent.name }))} columns={[
              { key: 'name', header: 'Agente' },
              { key: 'contacts', header: 'Contactos' },
              { key: 'openOpportunities', header: 'Abiertas' },
              { key: 'wonOpportunities', header: 'Ganadas' },
              { key: 'pendingTasks', header: 'Tareas pendientes' }
            ]} />
          </Card>
          <Card>
            <CardHeader title="Actividad reciente" />
            <Table data={data.recentActivity.map((item) => ({ ...item, id: item._id, date: localDate(item.createdAt), user: item.userId?.name || 'Sistema' }))} columns={[
              { key: 'date', header: 'Fecha' },
              { key: 'user', header: 'Usuario' },
              { key: 'type', header: 'Tipo' },
              { key: 'summary', header: 'Resumen' }
            ]} />
          </Card>
        </>
      )}
    </PageShell>
  );
}
