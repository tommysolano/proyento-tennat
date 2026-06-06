import { ContactRound, CreditCard, Headphones, Plus, RadioTower, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { channelConfigs, internalUsers } from '../../data/mockData.js';

export function AdminDashboard() {
  const [users, setUsers] = useState(internalUsers);
  const [channels, setChannels] = useState(channelConfigs);
  const [notice, setNotice] = useState('');

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleCreateUser(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const role = formData.get('role') || 'CALLCENTER';
    const name = formData.get('name') || 'Usuario demo';
    const email = formData.get('email') || `usuario.${Date.now()}@demo.com`;

    setUsers((current) => [
      {
        id: `user-${Date.now()}`,
        name,
        email,
        role,
        status: 'active'
      },
      ...current
    ]);
    setNotice(`${name} fue agregado al equipo interno.`);
    event.currentTarget.reset();
  }

  function connectChannel(channelId) {
    setChannels((current) =>
      current.map((channel) =>
        channel.id === channelId ? { ...channel, status: 'connected' } : channel
      )
    );
    setNotice('Canal marcado como conectado en la demo.');
  }

  return (
    <PageShell
      eyebrow="Tenant empresa"
      title="Dashboard de empresa"
      description="Administracion interna de Nova Seguros: usuarios, canales y plan contratado dentro de su propio espacio."
    >
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Usuarios internos" value={users.length} helper="Supervisores y agentes" icon={UsersRound} tone="cyan" />
        <MetricCard label="Contactos" value="8.4k" helper="63% con seguimiento" icon={ContactRound} tone="emerald" />
        <MetricCard label="Canales" value="3" helper="1 conectado, 2 borradores" icon={RadioTower} tone="amber" />
        <MetricCard label="Plan actual" value="Growth" helper="25 usuarios disponibles" icon={CreditCard} tone="rose" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.78fr]">
        <Card id="usuarios">
          <CardHeader
            title="Gestion de usuarios internos"
            description="Supervisores y agentes call center creados por la empresa."
            action={
              <Button onClick={() => scrollTo('crear-usuario')}>
                <Plus className="h-4 w-4" />
                Nuevo usuario
              </Button>
            }
          />
          <Table
            data={users}
            columns={[
              { key: 'name', header: 'Nombre' },
              { key: 'email', header: 'Email' },
              { key: 'role', header: 'Rol' },
              { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> }
            ]}
          />
        </Card>

        <Card>
          <CardHeader title="Crear supervisor o agente" description="Alta rapida visual para roles operativos." />
          <form id="crear-usuario" className="space-y-4 p-5" onSubmit={handleCreateUser}>
            <input name="name" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Nombre completo" />
            <input name="email" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Email corporativo" />
            <select name="role" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm">
              <option value="SUPERVISOR">Supervisor Call Center</option>
              <option value="CALLCENTER">Call Center</option>
            </select>
            <select className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm">
              <option>Asignar a Bruno Supervisor</option>
              <option>Sin supervisor</option>
            </select>
            <Button className="w-full" type="submit">
              <Headphones className="h-4 w-4" />
              Crear usuario demo
            </Button>
          </form>
        </Card>
      </div>

      <Card id="canales">
        <CardHeader title="Configuracion de canales" description="Pantallas visuales para futuras integraciones sin conectar APIs reales." />
        <div className="grid gap-4 p-5 lg:grid-cols-3">
          {channels.map((channel) => (
            <div key={channel.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{channel.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{channel.type}</p>
                </div>
                <Badge tone={channel.status}>{channel.status}</Badge>
              </div>
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">App ID</span>
                  <input className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={channel.appId} readOnly />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">Phone Number ID</span>
                  <input className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={channel.phoneNumberId} readOnly />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">Page ID</span>
                  <input className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={channel.pageId} readOnly />
                </label>
              </div>
              <Button
                className="mt-4 w-full"
                variant={channel.status === 'connected' ? 'secondary' : 'primary'}
                onClick={() => connectChannel(channel.id)}
              >
                {channel.status === 'connected' ? 'Reconectar demo' : 'Conectar demo'}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card id="plan">
        <CardHeader title="Plan contratado" description="Resumen simulado de la suscripcion activa." />
        <div className="grid gap-4 p-5 md:grid-cols-4">
          {[
            ['Plan', 'Growth Omnicanal'],
            ['Usuarios', '18 / 25'],
            ['Contactos', '8.4k / 15k'],
            ['Canales', '3 / 3']
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
            </div>
          ))}
        </div>
      </Card>
    </PageShell>
  );
}
