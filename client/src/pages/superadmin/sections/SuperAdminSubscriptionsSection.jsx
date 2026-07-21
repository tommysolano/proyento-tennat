import { Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import {
  createPlatformSubscription,
  updatePlatformSubscription
} from '../../../api.js';
import { Badge } from '../../../components/Badge.jsx';
import { BillingPlanSummary } from '../../../components/BillingPlanSummary.jsx';
import { Button } from '../../../components/Button.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { Drawer } from '../../../components/Drawer.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormGrid } from '../../../components/FormGrid.jsx';
import { Table } from '../../../components/Table.jsx';
import {
  addDaysDateTimeInput,
  localDateTimeInput,
  subscriptionPayload
} from '../../../utils/billing.js';
import { idOf } from '../../../utils/contacts.js';

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

// Estados que se pueden fijar desde este panel al cambiar de plan.
const STATUS_OPTIONS = [
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Activa' },
  { value: 'past_due', label: 'Past due' },
  { value: 'suspended', label: 'Suspendida' }
];

function dateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function SuperAdminSubscriptionsSection({ workspace }) {
  const { subscriptions = [], distributors = [], plans = [], busy, mutate, setError } =
    workspace;
  const [open, setOpen] = useState(false);
  // Suscripcion que se esta cambiando; null = alta de un plan nuevo.
  const [editing, setEditing] = useState(null);
  const [distributorId, setDistributorId] = useState('');
  const [planId, setPlanId] = useState('');
  const [status, setStatus] = useState('trial');
  const [startsAt, setStartsAt] = useState(localDateTimeInput());
  const [trialEndsAt, setTrialEndsAt] = useState(addDaysDateTimeInput(14));

  const isEditing = Boolean(editing);
  const activePlans = plans.filter((item) => item.status === 'active');

  function resetForm() {
    setEditing(null);
    setDistributorId('');
    setPlanId('');
    setStatus('trial');
    setStartsAt(localDateTimeInput());
    setTrialEndsAt(addDaysDateTimeInput(14));
  }

  function openAssign() {
    resetForm();
    setOpen(true);
  }

  function openChange(subscription) {
    setEditing(subscription);
    setDistributorId(idOf(subscription.distributorId) || '');
    setPlanId(idOf(subscription.platformPlanId) || '');
    setStatus(subscription.status || 'active');
    setStartsAt(
      subscription.startsAt
        ? localDateTimeInput(new Date(subscription.startsAt))
        : localDateTimeInput()
    );
    setTrialEndsAt(
      subscription.trialEndsAt
        ? localDateTimeInput(new Date(subscription.trialEndsAt))
        : addDaysDateTimeInput(14)
    );
    setOpen(true);
  }

  function closeDrawer() {
    setOpen(false);
    resetForm();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    let terms;
    try {
      terms = subscriptionPayload({ planId, status, startsAt, trialEndsAt });
    } catch (validationError) {
      setError(validationError.message);
      return;
    }
    const payload = {
      platformPlanId: terms.planId,
      status: terms.status,
      startsAt: terms.startsAt,
      ...(terms.trialEndsAt ? { trialEndsAt: terms.trialEndsAt } : {})
    };

    const ok = await mutate(
      isEditing ? `subscription-change-${editing._id}` : 'subscription-create',
      () =>
        isEditing
          ? updatePlatformSubscription(editing._id, payload)
          : createPlatformSubscription({
              ...payload,
              distributorId,
              paymentProvider: 'manual'
            }),
      isEditing ? 'Suscripcion de plataforma actualizada.' : 'Suscripcion de plataforma creada.'
    );
    if (ok) closeDrawer();
  }

  async function handleSubscriptionStatus(subscription) {
    const nextStatus =
      subscription.status === 'trial' || subscription.status === 'suspended'
        ? 'active'
        : 'suspended';
    await mutate(
      `subscription-status-${subscription._id}`,
      () => updatePlatformSubscription(subscription._id, { status: nextStatus }),
      `Suscripcion ${nextStatus}.`
    );
  }

  // Al cambiar de plan mostramos planes activos y ademas el plan vigente aunque
  // este inactivo, para no perder la referencia del plan actual.
  const planChoices = plans.filter(
    (item) => item.status === 'active' || item._id === planId
  );
  const busyKey = isEditing ? `subscription-change-${editing?._id}` : 'subscription-create';

  return (
    <>
      <Card>
        <CardHeader
          title="Suscripciones de distribuidores"
          description="Plan vigente y periodos de cada tenant."
          action={
            <Button onClick={openAssign} disabled={Boolean(busy)}>
              <Plus className="h-4 w-4" />
              Asignar plan
            </Button>
          }
        />
        <Table
          data={subscriptions.map((item) => ({
            ...item,
            id: item._id,
            distributorLabel: item.distributorId?.name || '-',
            planLabel: item.platformPlanId?.name || '-',
            periodLabel: `${dateLabel(item.currentPeriodStart)} - ${dateLabel(item.currentPeriodEnd)}`
          }))}
          emptyText="No hay suscripciones de plataforma"
          columns={[
            { key: 'distributorLabel', header: 'Distribuidor', truncate: true, width: '14rem' },
            { key: 'planLabel', header: 'Plan', truncate: true, width: '12rem' },
            {
              key: 'status',
              header: 'Estado',
              nowrap: true,
              render: (row) => <Badge tone={row.status}>{row.status}</Badge>
            },
            { key: 'periodLabel', header: 'Periodo', hideBelow: 'md' },
            {
              key: 'actions',
              header: 'Acciones',
              nowrap: true,
              render: (row) => (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button className="px-3" variant="secondary" onClick={() => openChange(row)}>
                    <RefreshCw className="h-4 w-4" />
                    Cambiar plan
                  </Button>
                  <Button className="px-3" variant="secondary" onClick={() => handleSubscriptionStatus(row)}>
                    {row.status === 'trial'
                      ? 'Activar'
                      : row.status === 'suspended'
                        ? 'Reactivar'
                        : 'Suspender'}
                  </Button>
                </div>
              )
            }
          ]}
        />
      </Card>

      <Drawer
        open={open}
        onClose={closeDrawer}
        title={isEditing ? 'Cambiar plan' : 'Asignar plan'}
        description={
          isEditing
            ? 'Actualiza el plan o los terminos de la suscripcion vigente.'
            : 'Solo una suscripcion vigente por distribuidor.'
        }
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeDrawer}>
              Cancelar
            </Button>
            <Button type="submit" form="superadmin-subscription-form" disabled={Boolean(busy)}>
              {busy === busyKey
                ? 'Guardando...'
                : isEditing
                  ? 'Guardar cambios'
                  : 'Crear suscripcion'}
            </Button>
          </>
        }
      >
        <form id="superadmin-subscription-form" onSubmit={handleSubmit}>
          <FormGrid columns={1}>
            <FormField label="Distribuidor" htmlFor="platform-subscription-distributor" required>
              <select
                id="platform-subscription-distributor"
                required
                name="distributorId"
                value={distributorId}
                disabled={isEditing}
                onChange={(event) => setDistributorId(event.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Selecciona distribuidor
                </option>
                {distributors.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Plan de plataforma" htmlFor="platform-subscription-plan" required>
              <select
                id="platform-subscription-plan"
                required
                name="platformPlanId"
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Selecciona plan
                </option>
                {(isEditing ? planChoices : activePlans).map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Estado"
              htmlFor="platform-subscription-status"
              hint="El trial no genera facturas hasta que la suscripcion se active."
            >
              <select
                id="platform-subscription-status"
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className={inputClass}
              >
                {(isEditing ? STATUS_OPTIONS : STATUS_OPTIONS.slice(0, 2)).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Inicio" htmlFor="platform-subscription-start">
              <input
                id="platform-subscription-start"
                type="datetime-local"
                name="startsAt"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className={inputClass}
              />
            </FormField>
            {status === 'trial' ? (
              <FormField
                label="Fin de trial"
                htmlFor="platform-subscription-trial-end"
                hint="Durante el trial no se pueden generar facturas."
                required
              >
                <input
                  id="platform-subscription-trial-end"
                  required
                  type="datetime-local"
                  name="trialEndsAt"
                  value={trialEndsAt}
                  onChange={(event) => setTrialEndsAt(event.target.value)}
                  className={inputClass}
                />
              </FormField>
            ) : null}
            <BillingPlanSummary
              plan={plans.find((plan) => plan._id === planId)}
              trial={status === 'trial'}
            />
          </FormGrid>
        </form>
      </Drawer>
    </>
  );
}
