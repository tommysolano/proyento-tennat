import { Plus } from 'lucide-react';
import { useState } from 'react';
import { createPlatformPlan, updatePlatformPlan } from '../../../api.js';
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

export const PLATFORM_MODULES = [
  'core', 'crm', 'contacts', 'calendar', 'bookings', 'automations',
  'workflows', 'forms', 'surveys', 'landing_pages', 'funnels',
  'reputation', 'reviews', 'testimonials', 'coupons', 'referrals', 'loyalty',
  'billing', 'reporting', 'integrations'
];

const PLATFORM_PLAN_LIMITS = [
  { name: 'companies', label: 'Empresas', hint: 'Cantidad maxima de empresas que puede crear el distribuidor.' },
  { name: 'users', label: 'Usuarios' },
  { name: 'contacts', label: 'Contactos' },
  { name: 'modules', label: 'Modulos' },
  { name: 'storageMb', label: 'Almacenamiento general (MB)' },
  { name: 'messages', label: 'Mensajes', hint: 'Cantidad maxima de mensajes permitidos.' },
  { name: 'whatsappMessages', label: 'Mensajes WhatsApp' },
  { name: 'mediaStorageMb', label: 'Media (MB)', hint: 'Espacio maximo para archivos multimedia.' },
  { name: 'mediaFiles', label: 'Archivos multimedia', hint: 'Cantidad maxima de archivos permitidos.' },
  { name: 'conversations', label: 'Conversaciones' },
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
  { name: 'referralsPerMonth', label: 'Referidos por mes' }
];

export function SuperAdminPlansSection({ workspace }) {
  const { plans = [], busy, mutate } = workspace;
  const [open, setOpen] = useState(false);
  const [planModules, setPlanModules] = useState(PLATFORM_MODULES);

  async function handleCreatePlan(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = data.get('name');
    const created = await mutate(
      'plan-create',
      () =>
        createPlatformPlan({
          name,
          code: data.get('code'),
          description: data.get('description'),
          price: Number(data.get('price')),
          currency: data.get('currency'),
          billingCycle: data.get('billingCycle'),
          limits: Object.fromEntries(
            PLATFORM_PLAN_LIMITS.map((field) => [field.name, Number(data.get(field.name))])
          ),
          includedModules: planModules,
          status: 'active'
        }),
      `Plan "${name}" creado.`
    );
    if (created) {
      form.reset();
      setPlanModules(PLATFORM_MODULES);
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
      () => updatePlatformPlan(plan._id, { name, price: Number(price) }),
      `Plan "${name}" actualizado.`
    );
  }

  async function handlePlanStatus(plan) {
    const status = plan.status === 'active' ? 'inactive' : 'active';
    await mutate(
      `plan-status-${plan._id}`,
      () => updatePlatformPlan(plan._id, { status }),
      `Plan ${status === 'active' ? 'activado' : 'desactivado'}.`
    );
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Planes de plataforma"
          description="Planes que la plataforma vende a distribuidores."
          action={
            <Button onClick={() => setOpen(true)} disabled={Boolean(busy)}>
              <Plus className="h-4 w-4" />
              Crear plan interno
            </Button>
          }
        />
        <Table
          data={plans.map((plan) => ({
            ...plan,
            id: plan._id,
            priceLabel: formatMoney(plan.price, plan.currency),
            limitsLabel: `${plan.limits?.companies ?? 0} empresas / ${plan.limits?.users ?? 0} usuarios / ${plan.limits?.contacts ?? 0} contactos`
          }))}
          emptyText="No hay planes de plataforma"
          columns={[
            { key: 'name', header: 'Plan', truncate: true, width: '12rem' },
            { key: 'code', header: 'Codigo', nowrap: true, hideBelow: 'md' },
            { key: 'priceLabel', header: 'Precio', nowrap: true, align: 'right' },
            { key: 'billingCycle', header: 'Ciclo', nowrap: true, hideBelow: 'sm' },
            { key: 'limitsLabel', header: 'Limites', hideBelow: 'lg' },
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
        title="Crear plan interno"
        description="Limites aplicados por el backend a cada distribuidor."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="superadmin-plan-form" disabled={Boolean(busy)}>
              {busy === 'plan-create' ? 'Creando...' : 'Crear plan'}
            </Button>
          </>
        }
      >
        <form id="superadmin-plan-form" className="space-y-8" onSubmit={handleCreatePlan}>
          <FormGrid
            step="1"
            title="Informacion basica"
            description="Define la identidad, precio y ciclo del plan de plataforma."
          >
            <FormField label="Nombre" htmlFor="platform-plan-name" required>
              <input id="platform-plan-name" required name="name" className={inputClass} placeholder="Ej. Partner Pro" />
            </FormField>
            <FormField label="Codigo unico" htmlFor="platform-plan-code" hint="Usa minusculas, numeros y guiones." required>
              <input id="platform-plan-code" required name="code" className={inputClass} placeholder="partner-pro" />
            </FormField>
            <FormField label="Precio" htmlFor="platform-plan-price" required>
              <input id="platform-plan-price" required min="0" step="0.01" type="number" name="price" className={inputClass} placeholder="0.00" />
            </FormField>
            <FormField label="Moneda" htmlFor="platform-plan-currency">
              <CurrencySelect id="platform-plan-currency" name="currency" className={inputClass} defaultValue="USD" />
            </FormField>
            <FormField label="Ciclo de facturacion" htmlFor="platform-plan-cycle">
              <select id="platform-plan-cycle" name="billingCycle" className={inputClass}>
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
              </select>
            </FormField>
            <FormGridFull>
              <FormField label="Descripcion" htmlFor="platform-plan-description">
                <textarea
                  id="platform-plan-description"
                  name="description"
                  className={`${inputClass} min-h-20`}
                  placeholder="Describe el alcance comercial del plan."
                />
              </FormField>
            </FormGridFull>
          </FormGrid>

          <FormGrid
            step="2"
            title="Limites operativos"
            description="El valor 0 mantiene el limite sin tope configurado."
          >
            {PLATFORM_PLAN_LIMITS.map((field) => (
              <FormField
                key={field.name}
                label={field.label}
                htmlFor={`platform-plan-${field.name}`}
                hint={field.hint}
                required
              >
                <input
                  id={`platform-plan-${field.name}`}
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
            description="Estos modulos definen el techo disponible para el distribuidor."
          >
            {PLATFORM_MODULES.map((moduleKey) => (
              <label
                key={moduleKey}
                className="flex items-center gap-2 rounded-md border border-slate-200 p-2 text-xs text-slate-600"
              >
                <input
                  type="checkbox"
                  checked={planModules.includes(moduleKey)}
                  onChange={(event) =>
                    setPlanModules((current) =>
                      event.target.checked
                        ? [...new Set([...current, moduleKey])]
                        : current.filter((item) => item !== moduleKey)
                    )
                  }
                />
                {moduleKey}
              </label>
            ))}
          </FormGrid>
        </form>
      </Drawer>
    </>
  );
}
