import { Check, Minus, X, Info } from 'lucide-react';
import { Modal } from './Modal.jsx';

// Etiquetas legibles de cada eslabon de la cadena de resolucion.
export const LAYER_LABELS = {
  core: 'Modulo core',
  registry_default: 'Default del registro',
  platform_plan: 'Plan de plataforma',
  distributor_settings: 'Ajustes del distribuidor',
  platform_plan_override: 'Override del plan de plataforma',
  platform_subscription_override: 'Override de suscripcion de plataforma',
  distributor_override: 'Override del distribuidor',
  company_plan: 'Plan comercial',
  distributor_gate: 'Autorizacion de la plataforma/distribuidor',
  company_subscription_override: 'Override de suscripcion de la empresa',
  company_override: 'Override de la empresa',
  not_enabled: 'No habilitado en ningun nivel'
};

export function originLabel(origin) {
  return LAYER_LABELS[origin] || origin || '-';
}

const verdictIcon = {
  on: <Check className="h-4 w-4 text-emerald-600" />,
  off: <X className="h-4 w-4 text-rose-600" />,
  unchanged: <Minus className="h-4 w-4 text-slate-400" />,
  info: <Info className="h-4 w-4 text-slate-400" />
};

/**
 * Muestra la cadena de resolucion real de un modulo (la verdad del backend),
 * marcando el eslabon que lo deja habilitado o el que lo bloquea.
 */
export function ModuleDiagnosisModal({ open, onClose, diagnosis, moduleName }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Diagnostico: ${moduleName || diagnosis?.moduleKey || 'modulo'}`}
      description="Cadena de resolucion real, de arriba (registro) hacia abajo (estado final)."
    >
      {!diagnosis ? (
        <p className="text-sm text-slate-500">Cargando diagnostico...</p>
      ) : (
        <div className="space-y-4">
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              diagnosis.enabled
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            <p className="font-semibold">
              Estado final: {diagnosis.enabled ? 'Habilitado' : 'Bloqueado'}
            </p>
            <p className="mt-1 text-xs">
              {diagnosis.enabled
                ? `Habilitado por: ${originLabel(diagnosis.origin)}.`
                : `Bloqueado en: ${originLabel(diagnosis.blockedBy || diagnosis.origin)}.`}
            </p>
            {diagnosis.requires?.length ? (
              <p className="mt-1 text-xs">Requiere: {diagnosis.requires.join(', ')}.</p>
            ) : null}
          </div>

          <ol className="space-y-1">
            {(diagnosis.chain || []).map((link, index) => {
              const isBlocker = !diagnosis.enabled && link.layer === diagnosis.blockedBy;
              return (
                <li
                  key={`${link.layer}-${index}`}
                  className={`flex items-start gap-3 rounded-md border px-3 py-2 text-sm ${
                    isBlocker ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">{verdictIcon[link.verdict] || verdictIcon.info}</span>
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-800">
                      {LAYER_LABELS[link.layer] || link.layer}
                      {isBlocker ? (
                        <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                          bloquea aqui
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-slate-500">{link.label}</span>
                    {link.note ? (
                      <span className="block text-[11px] italic text-slate-400">{link.note}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Modal>
  );
}
