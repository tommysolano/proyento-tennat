import { Badge } from '../../../components/Badge.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { EmptyState } from '../../../components/EmptyState.jsx';

export function DistributorModulesSection({ workspace }) {
  const moduleCatalog = workspace.modules || { modules: [], authorizedModuleKeys: [] };

  return (
    <Card>
      <CardHeader
        title="Opciones autorizadas"
        description="Solo estos modulos pueden incluirse en planes o configuraciones del distribuidor."
      />
      <div className="mx-5 mt-5 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <strong>Solo lectura.</strong> Estos modulos los concede la plataforma. Para habilitar uno que
        aparezca como <em>No autorizado</em>, contacta a tu proveedor.
      </div>
      {moduleCatalog.modules.length ? (
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {moduleCatalog.modules.map((module) => (
            <div
              key={module.key}
              className={`rounded-md border p-3 ${
                module.authorized
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{module.name}</p>
                <Badge tone={module.authorized ? 'active' : 'inactive'}>
                  {module.authorized ? 'Autorizado' : 'No autorizado'}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">{module.description}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Sin modulos visibles"
          description="El plan de plataforma contratado todavia no autoriza modulos comerciales."
        />
      )}
    </Card>
  );
}
