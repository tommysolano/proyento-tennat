import { useState } from 'react';
import { updateModuleEntitlement } from '../../../api.js';
import { Badge } from '../../../components/Badge.jsx';
import { Button } from '../../../components/Button.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormGrid } from '../../../components/FormGrid.jsx';
import { Table } from '../../../components/Table.jsx';

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

export function SuperAdminModulesSection({ workspace }) {
  const { modules, distributors = [], plans = [], busy, mutate } = workspace;
  const registry = modules?.registry || [];
  const entitlements = modules?.entitlements || [];
  const [scopeType, setScopeType] = useState('distributor');

  async function handleEntitlement(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const updated = await mutate(
      'module-update',
      () =>
        updateModuleEntitlement({
          scopeType: data.get('scopeType'),
          scopeId: data.get('scopeId'),
          moduleKey: data.get('moduleKey'),
          enabled: data.get('enabled') === 'true'
        }),
      'Configuracion de modulo actualizada.'
    );
    if (updated) form.reset();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.65fr]">
      <Card>
        <CardHeader
          title="Registro de modulos"
          description="Catalogo central; los modulos futuros siguen desactivados."
        />
        <Table
          data={registry.map((item) => ({ ...item, id: item.key }))}
          emptyText="No hay modulos registrados"
          columns={[
            { key: 'name', header: 'Modulo', truncate: true, width: '10rem' },
            { key: 'key', header: 'Key', nowrap: true, hideBelow: 'sm' },
            { key: 'description', header: 'Descripcion', hideBelow: 'lg' },
            { key: 'version', header: 'Version', nowrap: true, hideBelow: 'md' },
            {
              key: 'enabledByDefault',
              header: 'Default',
              nowrap: true,
              hideBelow: 'md',
              render: (row) => (row.enabledByDefault ? 'Activo' : 'Inactivo')
            },
            {
              key: 'status',
              header: 'Estado',
              nowrap: true,
              render: (row) => <Badge tone={row.status}>{row.status}</Badge>
            }
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Entitlement" description="Override por distribuidor o plan." />
        <form className="p-5" onSubmit={handleEntitlement}>
          <FormGrid columns={1}>
            <FormField
              label="Tipo de alcance"
              htmlFor="entitlement-scope-type"
              hint="El override puede afectar a un distribuidor o a un plan completo."
              required
            >
              <select
                id="entitlement-scope-type"
                required
                name="scopeType"
                className={inputClass}
                value={scopeType}
                onChange={(event) => setScopeType(event.target.value)}
              >
                <option value="distributor">Distribuidor</option>
                <option value="platform_plan">Plan plataforma</option>
              </select>
            </FormField>
            <FormField label="Distribuidor o plan" htmlFor="entitlement-scope" required>
              <select
                id="entitlement-scope"
                required
                name="scopeId"
                defaultValue=""
                className={inputClass}
              >
                <option value="" disabled>
                  Selecciona el alcance
                </option>
                {(scopeType === 'distributor' ? distributors : plans).map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Modulo" htmlFor="entitlement-module" required>
              <select
                id="entitlement-module"
                required
                name="moduleKey"
                defaultValue=""
                className={inputClass}
              >
                <option value="" disabled>
                  Selecciona modulo
                </option>
                {registry.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Disponibilidad"
              htmlFor="entitlement-enabled"
              hint="Este valor reemplaza la configuracion heredada para el alcance seleccionado."
            >
              <select id="entitlement-enabled" name="enabled" className={inputClass}>
                <option value="true">Activado</option>
                <option value="false">Desactivado</option>
              </select>
            </FormField>
            <Button className="w-full" type="submit" disabled={Boolean(busy)}>
              {busy === 'module-update' ? 'Guardando...' : 'Guardar entitlement'}
            </Button>
          </FormGrid>
        </form>
        <div className="border-t border-slate-100 p-5 text-sm text-slate-500">
          {entitlements.length
            ? `${entitlements.length} overrides configurados.`
            : 'No hay overrides; se usan los modulos incluidos en el plan de plataforma.'}
        </div>
      </Card>
    </div>
  );
}
