import { Plus } from 'lucide-react';
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

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

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
  const [planId, setPlanId] = useState('');
  const [status, setStatus] = useState('trial');

  async function handleCreateSubscription(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    let terms;
    try {
      terms = subscriptionPayload({
        planId: data.get('platformPlanId'),
        status: data.get('status'),
        startsAt: data.get('startsAt'),
        trialEndsAt: data.get('trialEndsAt')
      });
    } catch (validationError) {
      setError(validationError.message);
      return;
    }
    const created = await mutate(
      'subscription-create',
      () =>
        createPlatformSubscription({
          distributorId: data.get('distributorId'),
          platformPlanId: terms.planId,
          status: terms.status,
          startsAt: terms.startsAt,
          ...(terms.trialEndsAt ? { trialEndsAt: terms.trialEndsAt } : {}),
          paymentProvider: 'manual'
        }),
      'Suscripcion de plataforma creada.'
    );
    if (created) {
      form.reset();
      setPlanId('');
      setStatus('trial');
      setOpen(false);
    }
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

  return (
    <>
      <Card>
        <CardHeader
          title="Suscripciones de distribuidores"
          description="Plan vigente y periodos de cada tenant."
          action={
            <Button onClick={() => setOpen(true)} disabled={Boolean(busy)}>
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
                <Button className="px-3" variant="secondary" onClick={() => handleSubscriptionStatus(row)}>
                  {row.status === 'trial'
                    ? 'Activar'
                    : row.status === 'suspended'
                      ? 'Reactivar'
                      : 'Suspender'}
                </Button>
              )
            }
          ]}
        />
      </Card>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Asignar plan"
        description="Solo una suscripcion vigente por distribuidor."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="superadmin-subscription-form" disabled={Boolean(busy)}>
              {busy === 'subscription-create' ? 'Creando...' : 'Crear suscripcion'}
            </Button>
          </>
        }
      >
        <form id="superadmin-subscription-form" onSubmit={handleCreateSubscription}>
          <FormGrid columns={1}>
            <FormField label="Distribuidor" htmlFor="platform-subscription-distributor" required>
              <select
                id="platform-subscription-distributor"
                required
                name="distributorId"
                defaultValue=""
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
                {plans
                  .filter((item) => item.status === 'active')
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField
              label="Estado inicial"
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
                <option value="trial">Trial</option>
                <option value="active">Activa</option>
              </select>
            </FormField>
            <FormField label="Inicio" htmlFor="platform-subscription-start">
              <input
                id="platform-subscription-start"
                type="datetime-local"
                name="startsAt"
                defaultValue={localDateTimeInput()}
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
                  defaultValue={addDaysDateTimeInput(14)}
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
