import { Info, Plus } from 'lucide-react';
import { useState } from 'react';
import {
  createPlan,
  diagnoseDistributorModule,
  updatePlan
} from '../../../api.js';
import { Badge } from '../../../components/Badge.jsx';
import { CurrencySelect } from '../../../components/BillingPlanSummary.jsx';
import { Button } from '../../../components/Button.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { Drawer } from '../../../components/Drawer.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormGrid, FormGridFull } from '../../../components/FormGrid.jsx';
import { Modal } from '../../../components/Modal.jsx';
import { ModuleDiagnosisModal } from '../../../components/ModuleDiagnosisModal.jsx';
import { Table } from '../../../components/Table.jsx';
import { formatMoney } from '../../../utils/billing.js';
import { missingRequires, moduleLabel } from '../../../utils/moduleDeps.js';

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

const DEFAULT_MODULES = ['core', 'crm', 'contacts'];

function formatLimits(limits = {}) {
  return `${limits.users ?? 0} usuarios / ${limits.contacts ?? 0} contactos / ${limits.whatsappMessages ?? 0} WA / ${limits.mediaStorageMb ?? 0} MB media`;
}

function limitsFromForm(data) {
  return Object.fromEntries(
    DISTRIBUTOR_PLAN_LIMITS.map((field) => [field.name, Number(data.get(field.name))])
  );
}

// Grid de modulos con toggles. Los no autorizados quedan deshabilitados con
// tooltip. La herencia (autorizado por la plataforma) es visible.
function ModuleToggleGrid({ catalog, selected, onToggle, onDiagnose }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {catalog.map((module) => {
          const checked = selected.includes(module.key);
          const locked = module.key === 'core' || !module.authorized;
          return (
            <div
              key={module.key}
              title={!module.authorized ? 'No autorizado por la plataforma — contacta a tu proveedor' : undefined}
              className={`flex items-start justify-between gap-2 rounded-md border p-3 text-sm ${
                !module.authorized
                  ? 'border-slate-200 bg-slate-100 opacity-70'
                  : checked
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-slate-200 bg-white'
              }`}
            >
              <label className={`flex min-w-0 items-start gap-2 ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  disabled={locked}
                  onChange={() => onToggle(module)}
                />
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800">{module.name}</span>
                  <span className="block text-xs text-slate-500">{module.description}</span>
                  {!module.authorized ? (
                    <span className="mt-1 block text-[11px] font-medium text-amber-700">No autorizado por la plataforma</span>
                  ) : null}
                </span>
              </label>
              <button
                type="button"
                onClick={() => onDiagnose(module)}
                aria-label={`Diagnostico de ${module.name}`}
                className="shrink-0 text-slate-400 hover:text-cyan-600"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
    </div>
  );
}

export function DistributorPlansSection({ workspace }) {
  const { plans = [], modules, busy, mutate } = workspace;
  const moduleCatalog = modules || { modules: [], authorizedModuleKeys: [] };
  const catalog = moduleCatalog.modules;
  const [open, setOpen] = useState(false);
  const [createModules, setCreateModules] = useState(DEFAULT_MODULES);
  const [editing, setEditing] = useState(null);
  const [editModules, setEditModules] = useState([]);
  const [diag, setDiag] = useState({ open: false, module: null, data: null });

  const visiblePlans = plans.map((plan) => ({
    ...plan,
    id: plan._id,
    priceLabel: formatMoney(plan.price, plan.currency),
    cycleLabel: cycleLabels[plan.billingCycle] || plan.billingCycle,
    limitsLabel: formatLimits(plan.limits),
    modulesLabel: (plan.includedModules || []).length
      ? `${plan.includedModules.length} modulos`
      : 'Sin modulos'
  }));

  // Alterna un modulo respetando dependencias duras (cascada con confirmacion).
  function toggleModule(currentList, setter, module) {
    const set = new Set(currentList);
    if (set.has(module.key)) {
      set.delete(module.key);
    } else {
      const missing = missingRequires(module.key, catalog, set).filter((key) => {
        const dep = catalog.find((item) => item.key === key);
        return dep?.authorized; // solo se pueden cascadear los autorizados
      });
      if (missing.length) {
        const labels = missing.map((key) => moduleLabel(key, catalog)).join(', ');
        if (!window.confirm(`${module.name} necesita ${labels}. Se incluiran tambien. Continuar?`)) return;
        missing.forEach((key) => set.add(key));
      }
      set.add(module.key);
    }
    setter([...set]);
  }

  async function openDiagnosis(module) {
    setDiag({ open: true, module, data: null });
    try {
      const data = await diagnoseDistributorModule(module.key);
      setDiag({ open: true, module, data });
    } catch {
      setDiag({ open: false, module: null, data: null });
    }
  }

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
          includedModules: createModules,
          features: String(data.get('features') || '')
            .split(',')
            .map((feature) => feature.trim())
            .filter(Boolean),
          status: data.get('status')
        }),
      `Plan "${name}" creado. Los usuarios activos veran los cambios al recargar su sesion.`
    );
    if (created) {
      form.reset();
      setCreateModules(DEFAULT_MODULES);
      setOpen(false);
    }
  }

  async function handleEditPlanBasics(plan) {
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

  function openEditModules(plan) {
    setEditing(plan);
    setEditModules(plan.includedModules?.length ? plan.includedModules : DEFAULT_MODULES);
  }

  async function saveEditModules() {
    const saved = await mutate(
      `plan-modules-${editing._id}`,
      () => updatePlan(editing._id, { includedModules: editModules }),
      `Modulos de "${editing.name}" actualizados. Los usuarios activos veran los cambios al recargar su sesion.`
    );
    if (saved) setEditing(null);
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
          description="Planes persistidos para este distribuidor. Los modulos incluidos definen que vera cada empresa."
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
            { key: 'modulesLabel', header: 'Modulos', nowrap: true, hideBelow: 'lg' },
            { key: 'limitsLabel', header: 'Limites', hideBelow: 'xl' },
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
                <div className="flex flex-wrap gap-2">
                  <Button className="px-3" variant="secondary" onClick={() => openEditModules(row)}>
                    Modulos
                  </Button>
                  <Button className="px-3" variant="secondary" onClick={() => handleEditPlanBasics(row)}>
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
        description="Precio, ciclo, limites y modulos validados por el backend."
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
          <FormGrid step="1" title="Informacion basica" description="Define como se mostrara y cobrara el plan.">
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
                <textarea id="plan-description" name="description" className={`${inputClass} min-h-20`} placeholder="Explica para que tipo de cliente es este plan." />
              </FormField>
            </FormGridFull>
          </FormGrid>

          <FormGrid step="2" title="Limites operativos" description="El valor 0 mantiene el limite sin tope configurado.">
            {DISTRIBUTOR_PLAN_LIMITS.map((field) => (
              <FormField key={field.name} label={field.label} htmlFor={`plan-${field.name}`} hint={field.hint} required>
                <input id={`plan-${field.name}`} required min="0" type="number" name={field.name} className={inputClass} placeholder="0" />
              </FormField>
            ))}
          </FormGrid>

          <FormGrid
            step="3"
            title="Modulos incluidos"
            description="Los no autorizados por la plataforma aparecen deshabilitados. WhatsApp e Inbox necesitan Conversaciones."
            columns={1}
          >
            <FormGridFull>
              <ModuleToggleGrid
                catalog={catalog}
                selected={createModules}
                onToggle={(module) => toggleModule(createModules, setCreateModules, module)}
                onDiagnose={openDiagnosis}
              />
            </FormGridFull>
            {!moduleCatalog.authorizedModuleKeys.length ? (
              <FormGridFull>
                <p className="text-sm text-amber-700">No hay modulos comerciales autorizados para crear planes.</p>
              </FormGridFull>
            ) : null}
          </FormGrid>

          <FormGrid step="4" title="Revision y estado" description="Agrega beneficios visibles y decide si el plan puede asignarse de inmediato." columns={1}>
            <FormField label="Funciones visibles" htmlFor="plan-features" hint="Separa cada beneficio con una coma.">
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

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing ? `Modulos de ${editing.name}` : 'Modulos del plan'}
        description="Marca los modulos incluidos. Los no autorizados por la plataforma no se pueden marcar."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEditModules} disabled={Boolean(busy)}>Guardar modulos</Button>
          </>
        }
      >
        {editing ? (
          <ModuleToggleGrid
            catalog={catalog}
            selected={editModules}
            onToggle={(module) => toggleModule(editModules, setEditModules, module)}
            onDiagnose={openDiagnosis}
          />
        ) : null}
      </Modal>

      <ModuleDiagnosisModal
        open={diag.open}
        onClose={() => setDiag({ open: false, module: null, data: null })}
        diagnosis={diag.data}
        moduleName={diag.module?.name}
      />
    </>
  );
}
