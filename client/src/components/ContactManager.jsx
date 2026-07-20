import { Plus, Save, Search, StickyNote, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  CONTACT_STATUS_OPTIONS,
  contactStatusLabel,
  formatDate,
  idOf,
  toDateTimeLocal
} from '../utils/contacts.js';
import { AssigneeSelect } from './AssigneeSelect.jsx';
import { Badge } from './Badge.jsx';
import { Button } from './Button.jsx';
import { Card, CardHeader } from './Card.jsx';
import { FormField } from './FormField.jsx';
import { Table } from './Table.jsx';

const fieldClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

export function ContactManager({
  contacts,
  agents = [],
  busy = false,
  canCreate = false,
  canDelete = false,
  canEditDetails = false,
  canAssign = false,
  canUpdate = true,
  canAddNote = true,
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
          <FormField label="Buscar contactos" htmlFor="contact-search">
            <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-100">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                id="contact-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="min-h-10 w-full border-0 bg-transparent text-sm outline-none"
                placeholder="Nombre, telefono o email"
              />
            </div>
          </FormField>
          <FormField label="Estado" htmlFor="contact-status-filter">
            <select
              id="contact-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={fieldClass}
            >
              <option value="">Todos los estados</option>
              {CONTACT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <Table
          data={filteredContacts.map((contact) => ({ ...contact, id: contact._id }))}
          emptyText="No hay contactos para los filtros seleccionados"
          columns={[
            { key: 'name', header: 'Contacto', truncate: true, width: '14rem' },
            { key: 'phone', header: 'Telefono', nowrap: true },
            {
              key: 'assignedTo',
              header: 'Agente',
              truncate: true,
              width: '12rem',
              hideBelow: 'md',
              render: (row) => row.assignedTo?.name || 'Sin asignar'
            },
            {
              key: 'nextFollowUpAt',
              header: 'Seguimiento',
              nowrap: true,
              hideBelow: 'lg',
              render: (row) => formatDate(row.nextFollowUpAt, 'Sin fecha')
            },
            {
              key: 'status',
              header: 'Estado',
              nowrap: true,
              render: (row) => (
                <Badge tone={row.status}>{contactStatusLabel(row.status)}</Badge>
              )
            },
            {
              key: 'action',
              header: 'Accion',
              nowrap: true,
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
                <FormField label="Nombre" htmlFor="contact-create-name" required>
                  <input id="contact-create-name" required name="name" className={fieldClass} placeholder="Nombre completo" />
                </FormField>
                <FormField label="Telefono" htmlFor="contact-create-phone" required>
                  <input id="contact-create-phone" required name="phone" className={fieldClass} placeholder="+593..." />
                </FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Email" htmlFor="contact-create-email">
                  <input id="contact-create-email" type="email" name="email" className={fieldClass} placeholder="contacto@empresa.com" />
                </FormField>
                <FormField label="Origen" htmlFor="contact-create-source">
                  <input id="contact-create-source" name="source" className={fieldClass} placeholder="Ej. Referido" />
                </FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Estado" htmlFor="contact-create-status">
                  <select id="contact-create-status" name="status" className={fieldClass} defaultValue="nuevo">
                    {CONTACT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Responsable" htmlFor="contact-create-assignee">
                  <AssigneeSelect
                    id="contact-create-assignee"
                    options={agents}
                    className={fieldClass}
                  />
                </FormField>
              </div>
              <FormField label="Proximo seguimiento" htmlFor="contact-create-follow-up">
                <input id="contact-create-follow-up" type="datetime-local" name="nextFollowUpAt" className={fieldClass} />
              </FormField>
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
              {canUpdate ? <form className="space-y-4" onSubmit={handleUpdate}>
                {canEditDetails ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField label="Nombre" htmlFor="contact-edit-name" required>
                        <input id="contact-edit-name" required name="name" defaultValue={selectedContact.name} className={fieldClass} />
                      </FormField>
                      <FormField label="Telefono" htmlFor="contact-edit-phone" required>
                        <input id="contact-edit-phone" required name="phone" defaultValue={selectedContact.phone} className={fieldClass} />
                      </FormField>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField label="Email" htmlFor="contact-edit-email">
                        <input id="contact-edit-email" type="email" name="email" defaultValue={selectedContact.email || ''} className={fieldClass} placeholder="contacto@empresa.com" />
                      </FormField>
                      <FormField label="Origen" htmlFor="contact-edit-source">
                        <input id="contact-edit-source" name="source" defaultValue={selectedContact.source || ''} className={fieldClass} placeholder="Ej. Referido" />
                      </FormField>
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
                  <FormField label="Estado" htmlFor="contact-edit-status">
                    <select id="contact-edit-status" name="status" defaultValue={selectedContact.status} className={fieldClass}>
                      {CONTACT_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </FormField>
                  {canAssign ? (
                    <FormField label="Responsable" htmlFor="contact-edit-assignee">
                      <AssigneeSelect
                        id="contact-edit-assignee"
                        options={agents}
                        defaultValue={idOf(selectedContact.assignedTo) || ''}
                        className={fieldClass}
                      />
                    </FormField>
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
              </form> : null}

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
                {canAddNote ? <form className="flex flex-col items-end gap-3 sm:flex-row" onSubmit={handleAddNote}>
                  <FormField className="w-full flex-1" label="Nueva nota" htmlFor="contact-note" hint="La nota queda guardada en el historial del contacto.">
                    <textarea id="contact-note" required maxLength="2000" name="text" className={`${fieldClass} min-h-20`} placeholder="Resultado de la llamada o siguiente paso" />
                  </FormField>
                  <Button type="submit" disabled={busy}>
                    <StickyNote className="h-4 w-4" />
                    Agregar nota
                  </Button>
                </form> : null}
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
