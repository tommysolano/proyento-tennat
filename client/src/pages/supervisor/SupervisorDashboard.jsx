import { Activity, Clock3, Headphones, MessageSquare, PhoneCall } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { Badge } from '../../components/Badge.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { agentActivity, agents } from '../../data/mockData.js';

export function SupervisorDashboard() {
  const [selectedAgent, setSelectedAgent] = useState(agents[0]);

  return (
    <PageShell
      eyebrow="Supervision operativa"
      title="Dashboard de supervision"
      description="Lectura diaria de agentes call center, actividad por usuario y metricas de conversaciones atendidas."
    >
      <div id="metricas" className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Llamadas" value="74" helper="Hoy" icon={PhoneCall} tone="cyan" />
        <MetricCard label="Contactos realizados" value="118" helper="Meta diaria 140" icon={Headphones} tone="emerald" />
        <MetricCard label="Conversaciones" value="39" helper="12 abiertas" icon={MessageSquare} tone="amber" />
        <MetricCard label="Horas conectadas" value="21.5" helper="Equipo activo" icon={Clock3} tone="rose" />
      </div>

      <Card id="agentes">
        <CardHeader title="Lista de agentes call center" description="Estado y produccion simulada por agente." />
        <Table
          data={agents}
          columns={[
            { key: 'name', header: 'Agente' },
            { key: 'shift', header: 'Horario' },
            { key: 'calls', header: 'Llamadas' },
            { key: 'contacts', header: 'Contactos' },
            { key: 'conversations', header: 'Conversaciones' },
            { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> },
            {
              key: 'action',
              header: 'Detalle',
              render: (row) => (
                <Button className="min-h-9 px-3" variant="secondary" onClick={() => setSelectedAgent(row)}>
                  Ver
                </Button>
              )
            }
          ]}
        />
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.75fr]">
        <Card id="actividad">
          <CardHeader title="Actividad simulada por agente" description="Eventos recientes para monitoreo." />
          <Table
            data={agentActivity}
            columns={[
              { key: 'time', header: 'Hora' },
              { key: 'agent', header: 'Agente' },
              { key: 'type', header: 'Tipo' },
              { key: 'summary', header: 'Resumen' },
              { key: 'result', header: 'Resultado', render: (row) => <Badge tone={row.result}>{row.result}</Badge> }
            ]}
          />
        </Card>

        <Card>
          <CardHeader title="Ritmo del equipo" description={`Detalle activo: ${selectedAgent.name}`} />
          <div className="space-y-5 p-5">
            {[
              ['Contactos', selectedAgent.contacts],
              ['Conversaciones atendidas', selectedAgent.conversations * 4],
              ['Llamadas efectivas', selectedAgent.calls]
            ].map(([label, percent]) => (
              <div key={label}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{label}</span>
                  <span className="text-slate-500">{percent}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-cyan-700" style={{ width: `${Math.min(percent, 100)}%` }} />
                </div>
              </div>
            ))}
            <div className="rounded-lg border border-slate-200 p-4">
              <Activity className="mb-3 h-5 w-5 text-cyan-700" />
              <p className="text-sm font-semibold text-slate-950">Alertas operativas</p>
              <p className="mt-1 text-sm text-slate-500">2 conversaciones llevan mas de 20 minutos sin respuesta.</p>
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
