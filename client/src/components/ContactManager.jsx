import { Plus, Save, Search, StickyNote, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  CONTACT_STATUS_OPTIONS,
  contactStatusLabel,
  formatDate,
  idOf,
  toDateTimeLocal
} from '../utils/contacts.js';
import { Badge } from './Badge.jsx';
import { Button } from './Button.jsx';
import { Card, CardHeader } from './Card.jsx';
import { Table } from './Table.jsx';

export function ContactManager({
  contacts,
  agents = [],
  busy = false,
  canCreate = false,
  canDelete = false,
  canEditDetails = false,
  canAssign = false,
  onCreate,
  onUpdate,
  onDelete,
  onAddNote,
  title = 'Contactos',
  description = 'Gestion de contactos del tenant.'
}) {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (selectedId && !contacts.some((contact) => contact._id === selectedId)) {
      setSelectedId('');
    }
  }, [contacts, selectedId]);

  const selectedContact = contacts.find((contact) => contact._id === selectedId) || null;
  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contacts.filter((contact) => {
      const matchesStatus = !statusFilter || contact.status === statusFilter;
      const matchesSearch =
        !term ||
        [contact.name, contact.phone, contact.email]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [contacts, search, statusFilter]);

  async function handleCreate(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await onCreate({
      name: data.get('name'),
      phone: data.get('phone'),
      email: data.get('email'),
      source: data.get('source'),
      status: data.get('status'),
      assignedTo: data.get('assignedTo') || null,
      nextFollowUpAt: data.get('nextFollowUpAt') || null
    });
    if (created !== false) form.reset();
  }

  async function handleUpdate(event) {
    event.preventDefault();
    if (!selectedContact) return;
    const data = new FormData(event.currentTarget);
    const payload = {
      status: data.get('status'),
      lastContactAt: data.get('lastContactAt') || null,
      nextFollowUpAt: data.get('nextFollowUpAt') || null
    };

    if (canEditDetails) {
      Object.assign(payload, {
        name: data.get('name'),
        phone: data.get('phone'),
        email: data.get('email'),
        source: data.get('source')
      });
    }
    if (canAssign) payload.assignedTo = data.get('assignedTo') || null;
    await onUpdate(selectedContact._id, payload);
  }

  async function handleAddNote(event) {
    event.preventDefault();
    if (!selectedContact) return;
    const form = event.currentTarget;
    const text = new FormData(form).get('text');
    const added = await onAddNote(selectedContact._id, text);
    if (added !== false) form.reset();
  }

  return (
    <div className="space-y-6">
      <Card id="contactos">
        <CardHeader title={title} description={description} />
        <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-[1fr_220px]">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-h-10 w-full border-0 bg-transparent text-sm outline-none"
              placeholder="Buscar por nombre, telefono o email"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-md border border-slate-200 px-3 py-2.5 text-sm"
          >
            <option value="">Todos los estados</option>
            {CONTACT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Table
          data={filteredContacts.map((contact) => ({ ...contact, id: contact._id }))}
          emptyText="No hay contactos para los filtros seleccionados"
          columns={[
            { key: 'name', header: 'Contacto' },
            { key: 'phone', header: 'Telefono' },
            {
              key: 'assignedTo',
              header: 'Agente',
              render: (row) => row.assignedTo?.name || 'Sin asignar'
            },
            {
              key: 'nextFollowUpAt',
              header: 'Seguimiento',
              render: (row) => formatDate(row.nextFollowUpAt, 'Sin fecha')
            },
            {
              key: 'status',
              header: 'Estado',
              render: (row) => (
                <Badge tone={row.status}>{contactStatusLabel(row.status)}</Badge>
              )
            },
            {
              key: 'action',
              header: 'Accion',
              render: (row) => (
                <Button
                  className="min-h-9 px-3"
                  variant={selectedId === row._id ? 'primary' : 'secondary'}
                  onClick={() => setSelectedId(row._id)}
                >
                  Gestionar
                </Button>
              )
            }
          ]}
        />
      </Card>

      <div className={`grid gap-6 ${canCreate ? 'xl:grid-cols-2' : ''}`}>
        {canCreate ? (
          <Card>
            <CardHeader title="Crear contacto" description="Alta real dentro de esta empresa." />
            <form className="space-y-4 p-5" onSubmit={handleCreate}>
              <div className="grid gap-3 sm:grid-cols-2">
                <input required name="name" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Nombre" />
                <input required name="phone" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Telefono" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input type="email" name="email" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Email" />
                <input name="source" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Origen" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <select name="status" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" defaultValue="nuevo">
                  {CONTACT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select name="assignedTo" className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" defaultValue="">
                  <option value="">Sin asignar</option>
                  {agents.map((agent) => (
                    <option key={agent._id} value={agent._id}>{agent.name}</option>
                  ))}
                </select>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Proximo seguimiento</span>
                <input type="datetime-local" name="nextFollowUpAt" className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
              <Button className="w-full" type="submit" disabled={busy}>
                <Plus className="h-4 w-4" />
                {busy ? 'Guardando...' : 'Crear contacto'}
              </Button>
            </form>
          </Card>
        ) : null}

        <Card id="gestion-contacto">
          <CardHeader
            title={selectedContact ? `Ficha: ${selectedContact.name}` : 'Ficha del contacto'}
            description={
              selectedContact
                ? 'Actualiza los campos permitidos y consulta sus notas.'
                : 'Selecciona un contacto de la tabla.'
            }
          />
          {selectedContact ? (
            <div key={selectedContact._id} className="space-y-5 p-5">
              <form className="space-y-4" onSubmit={handleUpdate}>
                {canEditDetails ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input required name="name" defaultValue={selectedContact.name} className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" />
                      <input required name="phone" defaultValue={selectedContact.phone} className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input type="email" name="email" defaultValue={selectedContact.email || ''} className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Email" />
                      <input name="source" defaultValue={selectedContact.source || ''} className="rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Origen" />
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p>{selectedContact.phone}</p>
                    <p>{selectedContact.email || 'Sin email'}</p>
                    <p>{selectedContact.source || 'Sin origen'}</p>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <select name="status" defaultValue={selectedContact.status} className="rounded-md border border-slate-200 px-3 py-2.5 text-sm">
                    {CONTACT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {canAssign ? (
                    <select
                      name="assignedTo"
                      defaultValue={idOf(selectedContact.assignedTo) || ''}
                      className="rounded-md border border-slate-200 px-3 py-2.5 text-sm"
                    >
                      <option value="">Sin asignar</option>
                      {agents.map((agent) => (
                        <option key={agent._id} value={agent._id}>{agent.name}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-slate-500">Ultimo contacto</span>
                    <input type="datetime-local" name="lastContactAt" defaultValue={toDateTimeLocal(selectedContact.lastContactAt)} className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-slate-500">Proximo seguimiento</span>
                    <input type="datetime-local" name="nextFollowUpAt" defaultValue={toDateTimeLocal(selectedContact.nextFollowUpAt)} className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm" />
                  </label>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={busy}>
                    <Save className="h-4 w-4" />
                    Guardar cambios
                  </Button>
                  {canDelete ? (
                    <Button
                      variant="danger"
                      disabled={busy}
                      onClick={() => onDelete(selectedContact._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Eliminar
                    </Button>
                  ) : null}
                </div>
              </form>

              <div className="border-t border-slate-100 pt-5">
                <div className="mb-3 flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-cyan-700" />
                  <h3 className="text-sm font-semibold text-slate-950">Notas</h3>
                </div>
                <div className="mb-4 max-h-52 space-y-3 overflow-y-auto">
                  {selectedContact.notes?.length ? (
                    [...selectedContact.notes].reverse().map((note) => (
                      <div key={note._id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm text-slate-700">{note.text}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          {note.createdBy?.name || 'Usuario'} - {formatDate(note.createdAt)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">Sin notas registradas.</p>
                  )}
                </div>
                <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleAddNote}>
                  <textarea required maxLength="2000" name="text" className="min-h-20 flex-1 rounded-md border border-slate-200 px-3 py-2.5 text-sm" placeholder="Agregar una nota persistente" />
                  <Button type="submit" disabled={busy}>
                    <StickyNote className="h-4 w-4" />
                    Agregar nota
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">
              Selecciona un contacto para abrir su ficha.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
