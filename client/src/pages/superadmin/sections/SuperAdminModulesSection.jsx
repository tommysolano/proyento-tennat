import { Info } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { diagnoseModule, getModuleMatrix, updateModuleEntitlement } from '../../../api.js';
import { Badge } from '../../../components/Badge.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { CrmNotice } from '../../../components/CrmCommon.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { ModuleDiagnosisModal, originLabel } from '../../../components/ModuleDiagnosisModal.jsx';
import {
  enabledDependents,
  missingRecommends,
  missingRequires,
  moduleLabel
} from '../../../utils/moduleDeps.js';

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

const ORIGIN_TONE = {
  core: 'draft',
  platform_plan: 'info',
  distributor_settings: 'trial',
  platform_plan_override: 'planned',
  platform_subscription_override: 'planned',
  distributor_override: 'planned',
  not_enabled: 'inactive'
};

function Switch({ checked, onClick, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        checked ? 'bg-emerald-500' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function SuperAdminModulesSection({ workspace }) {
  const { distributors = [], plans = [] } = workspace;
  const [scopeType, setScopeType] = useState('distributor');
  const [scopeId, setScopeId] = useState('');
  const [matrix, setMatrix] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [diag, setDiag] = useState({ open: false, module: null, data: null });

  const options = scopeType === 'distributor' ? distributors : plans;
  const overrideLayer =
    scopeType === 'distributor' ? 'distributor_override' : 'platform_plan_override';

  const loadMatrix = useCallback(async () => {
    if (!scopeId) {
      setMatrix([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await getModuleMatrix(scopeType, scopeId);
      setMatrix(data.modules);
    } catch (requestError) {
      setError(requestError.message);
      setMatrix([]);
    } finally {
      setLoading(false);
    }
  }, [scopeType, scopeId]);
  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  const enabledKeys = new Set(matrix.filter((module) => module.enabled).map((module) => module.key));

  async function persist(moduleKey, enabled) {
    return updateModuleEntitlement({ scopeType, scopeId, moduleKey, enabled });
  }

  async function applyToggle(module) {
    if (module.key === 'core') return; // core no se desactiva
    const enabling = !module.enabled;
    let cascade = [];

    if (enabling) {
      const missing = missingRequires(module.key, matrix, enabledKeys);
      if (missing.length) {
        const labels = missing.map((key) => moduleLabel(key, matrix)).join(', ');
        if (!window.confirm(`${module.name} necesita ${labels}. Se activaran tambien. Continuar?`)) return;
        cascade = missing;
      }
      const recommended = missingRecommends(module.key, matrix, enabledKeys);
      if (recommended.length) {
        setNotice(`Sugerencia: ${module.name} funciona mejor con ${recommended.map((key) => moduleLabel(key, matrix)).join(', ')}.`);
      }
    } else {
      const dependents = enabledDependents(module.key, matrix, enabledKeys);
      if (dependents.length) {
        const labels = dependents.map((key) => moduleLabel(key, matrix)).join(', ');
        if (!window.confirm(`Al desactivar ${module.name} dejaran de funcionar: ${labels}. Continuar de todos modos?`)) return;
      }
    }

    const targets = enabling ? [...cascade, module.key] : [module.key];
    const previous = matrix;
    // Optimistic UI: refleja el cambio al instante.
    setMatrix((current) =>
      current.map((item) =>
        targets.includes(item.key)
          ? { ...item, enabled: enabling, origin: enabling ? overrideLayer : overrideLayer, blockedBy: enabling ? null : overrideLayer }
          : item
      )
    );
    setBusyKey(module.key);
    setError('');
    try {
      for (const key of cascade) await persist(key, true);
      await persist(module.key, enabling);
      await loadMatrix(); // sincroniza el origen real desde el backend
      setNotice('Modulo actualizado. Los usuarios activos veran los cambios al recargar su sesion (o al reimpersonar).');
    } catch (requestError) {
      setMatrix(previous); // revert
      setError(requestError.message);
    } finally {
      setBusyKey('');
    }
  }

  async function openDiagnosis(module) {
    setDiag({ open: true, module, data: null });
    try {
      const data = await diagnoseModule(scopeType, scopeId, module.key);
      setDiag({ open: true, module, data });
    } catch (requestError) {
      setError(requestError.message);
      setDiag({ open: false, module: null, data: null });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Matriz de modulos"
          description="Estado EFECTIVO por distribuidor o plan de plataforma. Cambiar un toggle crea/actualiza el override al instante."
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <FormField label="Alcance" htmlFor="matrix-scope-type">
            <select
              id="matrix-scope-type"
              className={inputClass}
              value={scopeType}
              onChange={(event) => {
                setScopeType(event.target.value);
                setScopeId('');
                setMatrix([]);
              }}
            >
              <option value="distributor">Distribuidor</option>
              <option value="platform_plan">Plan de plataforma</option>
            </select>
          </FormField>
          <FormField label={scopeType === 'distributor' ? 'Distribuidor' : 'Plan de plataforma'} htmlFor="matrix-scope-id">
            <select
              id="matrix-scope-id"
              className={inputClass}
              value={scopeId}
              onChange={(event) => setScopeId(event.target.value)}
            >
              <option value="">Selecciona...</option>
              {options.map((item) => (
                <option key={item._id} value={item._id}>{item.name}</option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="px-5 pb-5">
          <CrmNotice notice={notice} error={error} />
          {!scopeId ? (
            <p className="text-sm text-slate-500">Selecciona un alcance para ver y editar sus modulos.</p>
          ) : loading ? (
            <p className="text-sm text-slate-500">Cargando matriz...</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {matrix.map((module) => (
                <div
                  key={module.key}
                  className={`rounded-lg border p-3 ${
                    module.enabled ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                        {module.name}
                        <button
                          type="button"
                          onClick={() => openDiagnosis(module)}
                          aria-label={`Diagnostico de ${module.name}`}
                          className="text-slate-400 hover:text-cyan-600"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{module.key}</p>
                    </div>
                    <Switch
                      checked={module.enabled}
                      disabled={module.key === 'core' || busyKey === module.key}
                      onClick={() => applyToggle(module)}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone={ORIGIN_TONE[module.origin] || 'inactive'}>
                      {module.enabled ? originLabel(module.origin) : 'Bloqueado'}
                    </Badge>
                    {module.requires?.length ? (
                      <span className="text-[11px] text-slate-400">requiere: {module.requires.join(', ')}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <ModuleDiagnosisModal
        open={diag.open}
        onClose={() => setDiag({ open: false, module: null, data: null })}
        diagnosis={diag.data}
        moduleName={diag.module?.name}
      />
    </div>
  );
}
