import { updateDistributorBranding } from '../../../api.js';
import { Button } from '../../../components/Button.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormGrid } from '../../../components/FormGrid.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

export function DistributorBrandingSection({ workspace }) {
  const { refreshSession } = useAuth();
  const { settings, busy, mutate } = workspace;
  const branding = settings?.branding || {};

  async function handleBranding(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate(
      'branding',
      () =>
        updateDistributorBranding({
          branding: {
            companyName: data.get('companyName'),
            logoUrl: data.get('logoUrl'),
            faviconUrl: data.get('faviconUrl'),
            loginBackgroundUrl: data.get('loginBackgroundUrl'),
            primaryColor: data.get('primaryColor'),
            secondaryColor: data.get('secondaryColor'),
            accentColor: data.get('accentColor'),
            supportEmail: data.get('supportEmail'),
            supportPhone: data.get('supportPhone')
          },
          customDomain: { domain: data.get('domain') }
        }),
      'Branding actualizado.',
      refreshSession
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.65fr]">
      <Card>
        <CardHeader
          title="White label"
          description="Marca, soporte y dominio preparado sin validacion DNS real."
        />
        <form className="space-y-8 p-5" onSubmit={handleBranding}>
          <FormGrid title="Identidad visual">
            <FormField label="Nombre de marca" htmlFor="branding-company-name">
              <input
                id="branding-company-name"
                name="companyName"
                className={inputClass}
                defaultValue={branding.companyName}
                placeholder="Nombre visible"
              />
            </FormField>
            <FormField
              label="Logo URL"
              htmlFor="branding-logo-url"
              hint="URL publica HTTPS de la imagen."
            >
              <input
                id="branding-logo-url"
                type="url"
                name="logoUrl"
                className={inputClass}
                defaultValue={branding.logoUrl}
                placeholder="https://..."
              />
            </FormField>
            <FormField label="Favicon URL" htmlFor="branding-favicon-url">
              <input
                id="branding-favicon-url"
                type="url"
                name="faviconUrl"
                className={inputClass}
                defaultValue={branding.faviconUrl}
                placeholder="https://..."
              />
            </FormField>
            <FormField label="Fondo de login URL" htmlFor="branding-login-background">
              <input
                id="branding-login-background"
                type="url"
                name="loginBackgroundUrl"
                className={inputClass}
                defaultValue={branding.loginBackgroundUrl}
                placeholder="https://..."
              />
            </FormField>
          </FormGrid>

          <FormGrid title="Colores">
            <FormField label="Color principal" htmlFor="branding-primary-color">
              <input
                id="branding-primary-color"
                type="color"
                name="primaryColor"
                className={`${inputClass} h-12`}
                defaultValue={branding.primaryColor || '#0e7490'}
              />
            </FormField>
            <FormField label="Color secundario" htmlFor="branding-secondary-color">
              <input
                id="branding-secondary-color"
                type="color"
                name="secondaryColor"
                className={`${inputClass} h-12`}
                defaultValue={branding.secondaryColor || '#0f172a'}
              />
            </FormField>
            <FormField label="Color de acento" htmlFor="branding-accent-color">
              <input
                id="branding-accent-color"
                type="color"
                name="accentColor"
                className={`${inputClass} h-12`}
                defaultValue={branding.accentColor || '#06b6d4'}
              />
            </FormField>
          </FormGrid>

          <FormGrid title="Soporte y dominio">
            <FormField label="Email de soporte" htmlFor="branding-support-email">
              <input
                id="branding-support-email"
                type="email"
                name="supportEmail"
                className={inputClass}
                defaultValue={branding.supportEmail}
                placeholder="soporte@empresa.com"
              />
            </FormField>
            <FormField label="Telefono de soporte" htmlFor="branding-support-phone">
              <input
                id="branding-support-phone"
                name="supportPhone"
                className={inputClass}
                defaultValue={branding.supportPhone}
                placeholder="+593..."
              />
            </FormField>
            <FormField
              label="Dominio personalizado"
              htmlFor="branding-domain"
              hint="Solo configura el valor; la validacion DNS sigue siendo externa."
            >
              <input
                id="branding-domain"
                name="domain"
                className={inputClass}
                defaultValue={settings?.customDomain?.domain}
                placeholder="crm.midominio.com"
              />
            </FormField>
          </FormGrid>

          <Button type="submit" disabled={Boolean(busy)}>
            {busy === 'branding' ? 'Guardando...' : 'Guardar branding'}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Preview" description="Vista basica con fallback." />
        <div className="space-y-5 p-5">
          <div
            className="rounded-lg border border-slate-200 p-5"
            style={{ borderTopColor: branding.primaryColor, borderTopWidth: 6 }}
          >
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="" className="mb-4 h-14 max-w-full object-contain" />
            ) : null}
            <p
              className="text-xl font-semibold"
              style={{ color: branding.secondaryColor || '#0f172a' }}
            >
              {branding.companyName || settings?.name || 'TenantDesk'}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {branding.supportEmail || 'soporte@ejemplo.com'}
            </p>
            <button
              type="button"
              className="mt-5 rounded-md px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: branding.primaryColor || '#0e7490' }}
            >
              Accion principal
            </button>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 text-sm">
            <p>
              <strong>Dominio:</strong> {settings?.customDomain?.domain || 'No configurado'}
            </p>
            <p className="mt-2">
              <strong>Estado:</strong> {settings?.customDomain?.status || 'not_configured'}
            </p>
            {settings?.customDomain?.verificationToken ? (
              <p className="mt-2 break-all">
                <strong>Token:</strong> {settings.customDomain.verificationToken}
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
