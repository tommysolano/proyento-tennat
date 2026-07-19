import { Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { createSubscription, setCompanySubscription } from '../../../api.js';
import { Badge } from '../../../components/Badge.jsx';
import { BillingPlanSummary } from '../../../components/BillingPlanSummary.jsx';
import { Button } from '../../../components/Button.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { Drawer } from '../../../components/Drawer.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormGrid, FormGridFull } from '../../../components/FormGrid.jsx';
import { Table } from '../../../components/Table.jsx';
import {
  addDaysDateTimeInput,
  formatMoney,
  localDateTimeInput,
  subscriptionPayload
} from '../../../utils/billing.js';
import { idOf } from '../../../utils/contacts.js';

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

const LIVE_STATUSES = ['active', 'trial', 'past_due', 'suspended'];

/**
 * Unifica los dos flujos que antes vivian en paginas distintas:
 * alta de suscripcion (empresas sin plan) y cambio de plan (empresas que ya
 * tienen uno). Son complementarios, no duplicados: el backend rechaza crear
 * una segunda suscripcion vigente para la misma empresa.
 */
export function DistributorSubscriptionsSection({ workspace }) {
  const {
    companies = [],
    commerceCompanies = [],
    plans = [],
    subscriptions = [],
    busy,
    mutate
  } = workspace;

  const [createOpen, setCreateOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);

  // Alta
  const [newCompanyId, setNewCompanyId] = useState('');
  const [newPlanId, setNewPlanId] = useState('');
  const [newStatus, setNewStatus] = useState('active');

  // Cambio de plan
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState('active');
  const [subscriptionStartsAt, setSubscriptionStartsAt] = useState(localDateTimeInput());
  const [subscriptionTrialEndsAt, setSubscriptionTrialEndsAt] = useState(
    addDaysDateTimeInput(14)
  );

  const companyNameById = new Map(companies.map((company) => [company._id, company.name]));
  const subscribedCompanyIds = new Set(
    subscriptions
      .filter((subscription) => LIVE_STATUSES.includes(subscription.status))
      .map((subscription) => idOf(subscription.companyId))
  );
  const companiesWithoutSubscription = companies.filter(
    (company) => !subscribedCompanyIds.has(company._id)
  );
  const activePlans = plans.filter((plan) => plan.status === 'active');

  async function handleCreateSubscription(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await mutate(
      'subscription',
      () =>
        createSubscription(
          subscriptionPayload({
            companyId: data.get('companyId'),
            planId: data.get('planId'),
            status: data.get('status'),
            startsAt: data.get('startsAt'),
            trialEndsAt: data.get('trialEndsAt'),
            endsAt: data.get('endsAt')
          })
        ),
      'Suscripcion creada correctamente.'
    );
    if (created) {
      form.reset();
      setNewCompanyId('');
      setNewPlanId('');
      setNewStatus('active');
      setCreateOpen(false);
    }
  }

  function handleSubscriptionCompany(companyId) {
    setSelectedCompanyId(companyId);
    const company = commerceCompanies.find((item) => item._id === companyId);
    setSelectedPlanId(company?.subscription?.planId?._id || '');
    setSubscriptionStatus(company?.subscription?.status || 'active');
    setSubscriptionStartsAt(
      company?.subscription?.startsAt
        ? localDateTimeInput(new Date(company.subscription.startsAt))
        : localDateTimeInput()
    );
    setSubscriptionTrialEndsAt(
      company?.subscription?.trialEndsAt
        ? localDateTimeInput(new Date(company.subscription.trialEndsAt))
        : addDaysDateTimeInput(14)
    );
  }

  async function handleChangeSubscription(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await mutate(
      'subscription-change',
      () =>
        setCompanySubscription(
          data.get('companyId'),
          subscriptionPayload({
            planId: data.get('planId'),
            status: data.get('status'),
            startsAt: data.get('startsAt'),
            trialEndsAt: data.get('trialEndsAt')
          })
        ),
      'Plan asignado a la empresa.'
    );
    if (ok) {
      form.reset();
      setSelectedCompanyId('');
      setSelectedPlanId('');
      setSubscriptionStatus('active');
      setSubscriptionStartsAt(localDateTimeInput());
      setSubscriptionTrialEndsAt(addDaysDateTimeInput(14));
      setChangeOpen(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Suscripciones de empresas"
          description="Plan vigente de cada empresa de tu cartera."
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setChangeOpen(true)}
                disabled={Boolean(busy) || !commerceCompanies.length}
              >
                <RefreshCw className="h-4 w-4" />
                Cambiar plan
              </Button>
              <Button
                onClick={() => setCreateOpen(true)}
                disabled={
                  Boolean(busy) ||
                  !companiesWithoutSubscription.length ||
                  !activePlans.length
                }
              >
                <Plus className="h-4 w-4" />
                Nueva suscripcion
              </Button>
            </div>
          }
        />
        <Table
          data={subscriptions.map((subscription) => ({
            ...subscription,
            id: subscription._id,
            companyLabel:
              subscription.companyId?.name ||
              companyNameById.get(idOf(subscription.companyId)) ||
              '-',
            planLabel: subscription.planId?.name || 'Sin plan',
            priceLabel: subscription.planId
              ? formatMoney(subscription.planId.price, subscription.planId.currency)
              : '-',
            startsLabel: subscription.startsAt
              ? new Date(subscription.startsAt).toLocaleDateString('es-EC')
              : '-'
          }))}
          emptyText="Todavia no hay suscripciones creadas"
          columns={[
            { key: 'companyLabel', header: 'Empresa', truncate: true, width: '14rem' },
            { key: 'planLabel', header: 'Plan', truncate: true, width: '12rem' },
            { key: 'priceLabel', header: 'Precio', nowrap: true, align: 'right', hideBelow: 'sm' },
            { key: 'startsLabel', header: 'Inicio', nowrap: true, hideBelow: 'md' },
            {
              key: 'status',
              header: 'Estado',
              nowrap: true,
              render: (row) => <Badge tone={row.status}>{row.status}</Badge>
            }
          ]}
        />
        {companiesWithoutSubscription.length ? (
          <p className="border-t border-slate-100 p-5 text-sm text-slate-500">
            {companiesWithoutSubscription.length} empresa(s) sin suscripcion vigente.
          </p>
        ) : null}
      </Card>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Crear suscripcion"
        description="Solo para empresas sin una suscripcion vigente."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="distributor-subscription-create"
              disabled={Boolean(busy) || !companiesWithoutSubscription.length}
            >
              <Plus className="h-4 w-4" />
              {busy === 'subscription' ? 'Creando...' : 'Crear suscripcion'}
            </Button>
          </>
        }
      >
        <form id="distributor-subscription-create" onSubmit={handleCreateSubscription}>
          <FormGrid columns={1}>
            <FormField label="Empresa" htmlFor="subscription-company" required>
              <select
                id="subscription-company"
                required
                name="companyId"
                value={newCompanyId}
                onChange={(event) => {
                  setNewCompanyId(event.target.value);
                  setNewPlanId('');
                }}
                className={inputClass}
              >
                <option value="" disabled>
                  Selecciona una empresa
                </option>
                {companiesWithoutSubscription.map((company) => (
                  <option key={company._id} value={company._id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Plan comercial" htmlFor="subscription-plan" required>
              <select
                required
                disabled={!newCompanyId}
                id="subscription-plan"
                name="planId"
                value={newPlanId}
                onChange={(event) => setNewPlanId(event.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Selecciona un plan
                </option>
                {(newCompanyId ? activePlans : []).map((plan) => (
                  <option key={plan._id} value={plan._id}>
                    {plan.name} - {formatMoney(plan.price, plan.currency)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Estado inicial"
              htmlFor="subscription-status"
              hint="El trial no genera facturas mientras permanezca en prueba."
            >
              <select
                id="subscription-status"
                name="status"
                value={newStatus}
                onChange={(event) => setNewStatus(event.target.value)}
                className={inputClass}
              >
                <option value="active">Activa</option>
                <option value="trial">Prueba</option>
              </select>
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Inicio" htmlFor="subscription-start">
                <input
                  id="subscription-start"
                  type="datetime-local"
                  name="startsAt"
                  defaultValue={localDateTimeInput()}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Fin opcional" htmlFor="subscription-end">
                <input id="subscription-end" type="datetime-local" name="endsAt" className={inputClass} />
              </FormField>
            </div>
            {newStatus === 'trial' ? (
              <FormField
                label="Fin de trial"
                htmlFor="subscription-trial-end"
                hint="Durante el trial no se pueden generar facturas."
                required
              >
                <input
                  id="subscription-trial-end"
                  required
                  type="datetime-local"
                  name="trialEndsAt"
                  defaultValue={addDaysDateTimeInput(14)}
                  className={inputClass}
                />
              </FormField>
            ) : null}
            <BillingPlanSummary
              plan={plans.find((plan) => plan._id === newPlanId)}
              trial={newStatus === 'trial'}
            />
          </FormGrid>
        </form>
      </Drawer>

      <Drawer
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        title="Asignar o cambiar plan"
        description="Actualiza la suscripcion vigente de una empresa propia."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setChangeOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="distributor-subscription-change"
              disabled={Boolean(busy)}
            >
              {busy === 'subscription-change' ? 'Guardando...' : 'Guardar suscripcion'}
            </Button>
          </>
        }
      >
        <form id="distributor-subscription-change" onSubmit={handleChangeSubscription}>
          <FormGrid columns={1}>
            <FormField label="Empresa" htmlFor="commerce-subscription-company" required>
              <select
                id="commerce-subscription-company"
                required
                name="companyId"
                value={selectedCompanyId}
                onChange={(event) => handleSubscriptionCompany(event.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Selecciona una empresa
                </option>
                {commerceCompanies.map((company) => (
                  <option key={company._id} value={company._id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Plan comercial" htmlFor="commerce-subscription-plan" required>
              <select
                id="commerce-subscription-plan"
                required
                disabled={!selectedCompanyId}
                name="planId"
                value={selectedPlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Selecciona un plan
                </option>
                {(selectedCompanyId ? plans : [])
                  .filter((plan) => plan.status === 'active' || plan._id === selectedPlanId)
                  .map((plan) => (
                    <option key={plan._id} value={plan._id}>
                      {plan.name}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField
              label="Estado"
              htmlFor="commerce-subscription-status"
              hint="El trial no puede facturarse hasta activarse."
            >
              <select
                id="commerce-subscription-status"
                name="status"
                value={subscriptionStatus}
                onChange={(event) => setSubscriptionStatus(event.target.value)}
                className={inputClass}
              >
                <option value="active">Activa</option>
                <option value="trial">Trial</option>
                <option value="past_due">Past due</option>
                <option value="suspended">Suspendida</option>
              </select>
            </FormField>
            <FormField label="Fecha de inicio" htmlFor="commerce-subscription-start">
              <input
                id="commerce-subscription-start"
                type="datetime-local"
                name="startsAt"
                value={subscriptionStartsAt}
                onChange={(event) => setSubscriptionStartsAt(event.target.value)}
                className={inputClass}
              />
            </FormField>
            {subscriptionStatus === 'trial' ? (
              <FormField
                label="Fin de trial"
                htmlFor="commerce-subscription-trial-end"
                hint="Obligatorio. Durante este periodo no se puede facturar."
                required
              >
                <input
                  id="commerce-subscription-trial-end"
                  required
                  type="datetime-local"
                  name="trialEndsAt"
                  value={subscriptionTrialEndsAt}
                  onChange={(event) => setSubscriptionTrialEndsAt(event.target.value)}
                  className={inputClass}
                />
              </FormField>
            ) : null}
            <FormGridFull>
              <BillingPlanSummary
                plan={plans.find((plan) => plan._id === selectedPlanId)}
                trial={subscriptionStatus === 'trial'}
              />
            </FormGridFull>
          </FormGrid>
        </form>
      </Drawer>
    </>
  );
}
