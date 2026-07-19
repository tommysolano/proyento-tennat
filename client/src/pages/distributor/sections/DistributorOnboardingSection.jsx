import { CheckCircle2 } from 'lucide-react';
import { Badge } from '../../../components/Badge.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { EmptyState } from '../../../components/EmptyState.jsx';

const onboardingLabels = {
  profile: 'Completar perfil comercial',
  branding: 'Configurar marca',
  firstPlan: 'Crear primer plan',
  firstCompany: 'Crear primera empresa',
  firstAdmin: 'Crear primer admin',
  firstSubscription: 'Crear primera suscripcion'
};

export function DistributorOnboardingSection({ workspace }) {
  const { onboarding } = workspace;
  const steps = Object.entries(onboarding?.steps || {});

  return (
    <Card>
      <CardHeader
        title="Checklist del distribuidor"
        description="Los pasos se recalculan desde datos reales."
      />
      {steps.length ? (
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {steps.map(([step, completed]) => (
            <div
              key={step}
              className={`flex items-center gap-3 rounded-lg border p-4 ${
                completed ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'
              }`}
            >
              <CheckCircle2
                className={`h-5 w-5 shrink-0 ${completed ? 'text-emerald-600' : 'text-slate-300'}`}
              />
              <span className="text-sm font-semibold text-slate-700">
                {onboardingLabels[step] || step}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Checklist no disponible"
          description="Todavia no hay pasos de onboarding calculados para este distribuidor."
        />
      )}
      <div className="border-t border-slate-100 p-5 text-sm text-slate-500">
        Estado general:{' '}
        <Badge tone={onboarding?.completed ? 'active' : 'pending'}>
          {onboarding?.completed ? 'completado' : 'pendiente'}
        </Badge>
      </div>
    </Card>
  );
}
