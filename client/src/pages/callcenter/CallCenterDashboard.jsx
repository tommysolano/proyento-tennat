import { MessageSquare, PhoneCall, Plus, Target, TimerReset } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { Table } from '../../components/Table.jsx';
import { contacts, conversations } from '../../data/mockData.js';

export function CallCenterDashboard() {
  const [contactRows, setContactRows] = useState(contacts);
  const [selectedConversation, setSelectedConversation] = useState(conversations[0]);
  const [notice, setNotice] = useState('');

  function addContact() {
    const newContact = {
      id: `contact-${Date.now()}`,
      name: 'Nuevo contacto demo',
      phone: '+593 99 000 0000',
      source: 'Carga manual',
      status: 'pendiente',
      lastTouch: 'Sin contacto'
    };

    setContactRows((current) => [newContact, ...current]);
    setNotice('Contacto demo agregado a tu lista.');
  }

  function handleRegisterContact(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const contactName = formData.get('contact');
    const status = formData.get('status');

    setContactRows((current) =>
      current.map((contact) =>
        contact.name === contactName ? { ...contact, status, lastTouch: 'Ahora' } : contact
      )
    );
    setNotice(`${contactName} actualizado a ${status}.`);
    event.currentTarget.reset();
  }

  return (
    <PageShell
      eyebrow="Trabajo del agente"
      title="Dashboard del call center"
      description="Bandeja operativa para gestionar contactos, conversaciones y registros de llamadas."
    >
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Pendientes" value={contactRows.filter((contact) => contact.status === 'pendiente').length} helper="Por contactar" icon={TimerReset} tone="amber" />
        <MetricCard label="Contactados" value={contactRows.filter((contact) => contact.status === 'contactado').length} helper="Ultimos registros" icon={PhoneCall} tone="cyan" />
        <MetricCard label="Interesados" value={contactRows.filter((contact) => contact.status === 'interesado').length} helper="Listos para cierre" icon={Target} tone="emerald" />
        <MetricCard label="Conversaciones" value="6" helper="2 sin leer" icon={MessageSquare} tone="rose" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <Card id="contactos">
          <CardHeader
            title="Lista de contactos"
            description="Estados disponibles: pendiente, contactado, interesado y no interesado."
            action={
              <Button variant="secondary" onClick={addContact}>
                <Plus className="h-4 w-4" />
                Nuevo contacto
              </Button>
            }
          />
          <Table
            data={contactRows}
            columns={[
              { key: 'name', header: 'Contacto' },
              { key: 'phone', header: 'Telefono' },
              { key: 'source', header: 'Origen' },
              { key: 'lastTouch', header: 'Ultimo contacto' },
              { key: 'status', header: 'Estado', render: (row) => <Badge tone={row.status}>{row.status}</Badge> }
            ]}
          />
        </Card>

        <Card id="registro">
          <CardHeader title="Registro de llamada o contacto" description="Formulario visual para capturar gestion." />
          <form className="space-y-4 p-5" onSubmit={handleRegisterContact}>
            <select name="contact" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm">
              {contactRows.map((contact) => (
                <option key={contact.id}>{contact.name}</option>
              ))}
            </select>
            <select name="status" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm">
              <option value="pendiente">pendiente</option>
              <option value="contactado">contactado</option>
              <option value="interesado">interesado</option>
              <option value="no_interesado">no_interesado</option>
            </select>
            <textarea className="min-h-28 w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Notas de la gestion" />
            <Button className="w-full" type="submit">
              <PhoneCall className="h-4 w-4" />
              Guardar registro demo
            </Button>
          </form>
        </Card>
      </div>

      <Card id="conversaciones">
        <CardHeader title="Bandeja de conversaciones simuladas" description="Vista base para futura integracion omnicanal." />
        <div className="grid gap-4 p-5 lg:grid-cols-3">
          {conversations.map((conversation) => (
            <div key={conversation.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{conversation.contact}</p>
                  <p className="mt-1 text-sm text-slate-500">{conversation.channel}</p>
                </div>
                <Badge tone={conversation.status}>{conversation.status}</Badge>
              </div>
              <p className="mt-4 min-h-16 text-sm leading-6 text-slate-600">{conversation.lastMessage}</p>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-500">{conversation.unread} sin leer</span>
                <Button
                  variant="secondary"
                  className="min-h-9 px-3"
                  onClick={() => setSelectedConversation(conversation)}
                >
                  Abrir
                </Button>
              </div>
            </div>
          ))}
        </div>
        {selectedConversation ? (
          <div className="border-t border-slate-100 p-5">
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4">
              <p className="text-sm font-semibold text-cyan-950">
                Conversacion abierta: {selectedConversation.contact}
              </p>
              <p className="mt-2 text-sm text-cyan-800">{selectedConversation.lastMessage}</p>
            </div>
          </div>
        ) : null}
      </Card>
    </PageShell>
  );
}
