import { Plus } from 'lucide-react';
import { useState } from 'react';
import { createPlan, updatePlan } from '../../../api.js';
import { Badge } from '../../../components/Badge.jsx';
import { CurrencySelect } from '../../../components/BillingPlanSummary.jsx';
import { Button } from '../../../components/Button.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { Drawer } from '../../../components/Drawer.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormGrid, FormGridFull } from '../../../components/FormGrid.jsx';
import { Table } from '../../../components/Table.jsx';
import { formatMoney } from '../../../utils/billing.js';

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

const cycleLabels = { monthly: 'Mensual', yearly: 'Anual' };

export const DISTRIBUTOR_PLAN_LIMITS = [
  { name: 'users', label: 'Usuarios', hint: 'Usuarios internos permitidos en la empresa.' },
  { name: 'contacts', label: 'Contactos' },
  { name: 'messages', label: 'Mensajes', hint: 'Cantidad maxima de mensajes del plan.' },
  { name: 'storageMb', label: 'Almacenamiento general (MB)' },
  { name: 'whatsappMessages', label: 'Mensajes WhatsApp por mes' },
  { name: 'mediaStorageMb', label: 'Media (MB)', hint: 'Espacio maximo para archivos multimedia.' },
  { name: 'mediaFiles', label: 'Archivos multimedia', hint: 'Cantidad maxima de archivos permitidos.' },
  { name: 'conversations', label: 'Conversaciones por mes' },
  { name: 'calendars', label: 'Calendarios' },
  { name: 'appointments', label: 'Citas por mes' },
  { name: 'bookingLinks', label: 'Enlaces de reserva' },
  { name: 'workflows', label: 'Workflows' },
  { name: 'workflowRunsPerMonth', label: 'Ejecuciones de workflow por mes' },
  { name: 'workflowActionsPerMonth', label: 'Acciones de workflow por mes' },
  { name: 'forms', label: 'Formularios' },
  { name: 'formSubmissionsPerMonth', label: 'Respuestas de formularios por mes', hint: 'Envios recibidos entre todos los formularios.' },
  { name: 'landingPages', label: 'Landing pages' },
  { name: 'funnels', label: 'Funnels' },
  { name: 'funnelSteps', label: 'Pasos de funnel' },
  { name: 'pageViewsPerMonth', label: 'Vistas de pagina por mes' },
  { name: 'reviewRequestsPerMonth', label: 'Solicitudes de resena por mes' },
  { name: 'reviews', label: 'Resenas almacenadas', hint: 'Cantidad maxima de resenas guardadas.' },
  { name: 'reviewWidgets', label: 'Widgets de resenas' },
  { name: 'surveys', label: 'Encuestas de satisfaccion' },
  { name: 'surveyResponsesPerMonth', label: 'Respuestas de encuesta por mes' },
  { name: 'coupons', label: 'Cupones' },
  { name: 'couponRedemptionsPerMonth', label: 'Canjes de cupon por mes' },
  { name: 'referralPrograms', label: 'Programas de referidos' },
  { name: 'referralsPerMonth', label: 'Referidos por mes' },
  { name: 'modules', label: 'Modulos' }
];

function formatLimits(limits = {}) {
  return `${limits.users ?? 0} usuarios / ${limits.contacts ?? 0} contactos / ${limits.whatsappMessages ?? 0} WA / ${limits.mediaStorageMb ?? 0} MB media`;
}

function limitsFromForm(data) {
  return Object.fromEntries(
    DISTRIBUTOR_PLAN_LIMITS.map((field) => [field.name, Number(data.get(field.name))])
  );
}

export function DistributorPlansSection({ workspace }) {
  const { plans = [], modules, busy, mutate } = workspace;
  const moduleCatalog = modules || { modules: [], authorizedModuleKeys: [] };
  const [open, setOpen] = useState(false);

  const visiblePlans = plans.map((plan) => ({
    ...plan,
    id: plan._id,
    priceLabel: formatMoney(plan.price, plan.currency),
    cycleLabel: cycleLabels[plan.billingCycle] || plan.billingCycle,
    limitsLabel: formatLimits(plan.limits),
    featuresLabel: plan.features?.join(', ') || 'Sin funciones'
  }));

  async function handleCreatePlan(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = data.get('name');
    const created = await mutate(
      'plan',
      () =>
        createPlan({
          name,
          price: Number(data.get('price')),
          billingCycle: data.get('billingCycle'),
          description: data.get('description'),
          limits: limitsFromForm(data),
          code: data.get('code'),
          currency: data.get('currency'),
          includedModules: data.getAll('includedModules'),
          features: String(data.get('features') || '')
            .split(',')
            .map((feature) => feature.trim())
            .filter(Boolean),
          status: data.get('status')
        }),
      `Plan "${name}" creado correctamente.`
    );
    if (created) {
      form.reset();
      setOpen(false);
    }
  }

  async function handleEditPlan(plan) {
    const name = window.prompt('Nombre del plan', plan.name);
    if (!name) return;
    const price = window.prompt('Precio', plan.price);
    if (price === null) return;
    await mutate(
      `plan-edit-${plan._id}`,
      () => updatePlan(plan._id, { name, price: Number(price) }),
      `Plan "${name}" actualizado.`
    );
  }

  async function handlePlanStatus(plan) {
    const status = plan.status === 'active' ? 'inactive' : 'active';
    await mutate(
      `plan-status-${plan._id}`,
      () => updatePlan(plan._id, { status }),
      `Plan ${status === 'active' ? 'activado' : 'desactivado'}.`
    );
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Planes de suscripcion"
          description="Planes persistidos para este distribuidor."
          action={
            <Button onClick={() => setOpen(true)} disabled={Boolean(busy)}>
              <Plus className="h-4 w-4" />
              Crear plan
            </Button>
          }
        />
        <Table
          data={visiblePlans}
          emptyText="Todavia no hay planes creados"
          columns={[
            { key: 'name', header: 'Nombre', truncate: true, width: '12rem' },
            { key: 'code', header: 'Codigo', nowrap: true, hideBelow: 'md' },
            { key: 'priceLabel', header: 'Precio', nowrap: true, align: 'right' },
            { key: 'cycleLabel', header: 'Ciclo', nowrap: true, hideBelow: 'sm' },
            { key: 'limitsLabel', header: 'Limites', hideBelow: 'lg' },
            { key: 'featuresLabel', header: 'Funciones', truncate: true, width: '14rem', hideBelow: 'lg' },
            {
              key: 'status',
              header: 'Estado',
              nowrap: true,
              render: (row) => <Badge tone={row.status}>{row.status}</Badge>
            },
            {
              key: 'actions',
              header: 'Acciones',
              nowrap: true,
              render: (row) => (
                <div className="flex gap-2">
                  <Button className="px-3" variant="secondary" onClick={() => handleEditPlan(row)}>
                    Editar
                  </Button>
                  <Button className="px-3" variant="secondary" onClick={() => handlePlanStatus(row)}>
                    {row.status === 'active' ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              )
            }
          ]}
        />
      </Card>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Crear plan comercial"
        description="Precio, ciclo, limites y funciones validados por el backend."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="distributor-plan-form" disabled={Boolean(busy)}>
              {busy === 'plan' ? 'Guardando...' : 'Crear plan'}
            </Button>
          </>
        }
      >
        <form id="distributor-plan-form" className="space-y-8" onSubmit={handleCreatePlan}>
          <FormGrid
            step="1"
            title="Informacion basica"
            description="Define como se mostrara y cobrara el plan."
          >
            <FormField label="Nombre del plan" htmlFor="plan-name" required>
              <input id="plan-name" required name="name" className={inputClass} placeholder="Ej. Crecimiento" />
            </FormField>
            <FormField label="Codigo unico" htmlFor="plan-code" hint="Usa minusculas, numeros y guiones." required>
              <input id="plan-code" required name="code" className={inputClass} placeholder="crecimiento-mensual" />
            </FormField>
            <FormField label="Precio" htmlFor="plan-price" required>
              <input id="plan-price" required min="0" step="0.01" type="number" name="price" className={inputClass} placeholder="0.00" />
            </FormField>
            <FormField label="Moneda" htmlFor="plan-currency">
              <CurrencySelect id="plan-currency" name="currency" defaultValue="USD" className={inputClass} />
            </FormField>
            <FormField label="Ciclo de facturacion" htmlFor="plan-cycle">
              <select id="plan-cycle" name="billingCycle" className={inputClass}>
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
              </select>
            </FormField>
            <FormGridFull>
              <FormField label="Descripcion" htmlFor="plan-description">
                <textarea
                  id="plan-description"
                  name="description"
                  className={`${inputClass} min-h-20`}
                  placeholder="Explica para que tipo de cliente es este plan."
                />
              </FormField>
            </FormGridFull>
          </FormGrid>

          <FormGrid
            step="2"
            title="Limites operativos"
            description="El valor 0 mantiene el limite sin tope configurado."
          >
            {DISTRIBUTOR_PLAN_LIMITS.map((field) => (
              <FormField
                key={field.name}
                label={field.label}
                htmlFor={`plan-${field.name}`}
                hint={field.hint}
                required
              >
                <input
                  id={`plan-${field.name}`}
                  required
                  min="0"
                  type="number"
                  name={field.name}
                  className={inputClass}
                  placeholder="0"
                />
              </FormField>
            ))}
          </FormGrid>

          <FormGrid
            step="3"
            title="Modulos incluidos"
            description="Solo se muestran modulos autorizados por SUPERADMIN para este distribuidor."
          >
            {moduleCatalog.modules
              .filter((module) => module.authorized)
              .map((module) => (
                <label
                  key={module.key}
                  className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    name="includedModules"
                    value={module.key}
                    defaultChecked={['core', 'crm', 'contacts'].includes(module.key)}
                  />
                  <span>
                    <span className="block font-medium">{module.name}</span>
                    <span className="block text-xs text-slate-500">{module.description}</span>
                  </span>
                </label>
              ))}
            {!moduleCatalog.authorizedModuleKeys.length ? (
              <FormGridFull>
                <p className="text-sm text-amber-700">
                  No hay modulos comerciales autorizados para crear planes.
                </p>
              </FormGridFull>
            ) : null}
          </FormGrid>

          <FormGrid
            step="4"
            title="Revision y estado"
            description="Agrega beneficios visibles y decide si el plan puede asignarse de inmediato."
            columns={1}
          >
            <FormField
              label="Funciones visibles"
              htmlFor="plan-features"
              hint="Separa cada beneficio con una coma."
            >
              <input id="plan-features" name="features" className={inputClass} placeholder="Inbox, CRM, calendario" />
            </FormField>
            <FormField label="Estado del plan" htmlFor="plan-status">
              <select id="plan-status" name="status" className={inputClass}>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </FormField>
          </FormGrid>
        </form>
      </Drawer>
    </>
  );
}
