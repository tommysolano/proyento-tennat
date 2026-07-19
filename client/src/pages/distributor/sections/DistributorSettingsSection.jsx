import { Settings } from 'lucide-react';
import { updateDistributorSettings } from '../../../api.js';
import { Button } from '../../../components/Button.jsx';
import { Card, CardHeader } from '../../../components/Card.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormGrid, FormGridFull } from '../../../components/FormGrid.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

export function DistributorSettingsSection({ workspace }) {
  // El nombre comercial alimenta la marca de la sesion, asi que hay que
  // refrescarla despues de guardar.
  const { refreshSession } = useAuth();
  const { settings, busy, mutate } = workspace;
  const billingSettings = settings?.billingSettings || {};
  const generalSettings = settings?.settings || {};

  async function handleSettings(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate(
      'settings',
      () =>
        updateDistributorSettings({
          name: data.get('name'),
          phone: data.get('phone'),
          settings: {
            defaultCurrency: data.get('defaultCurrency'),
            defaultLocale: data.get('defaultLocale'),
            defaultTimezone: data.get('defaultTimezone'),
            termsUrl: data.get('termsUrl'),
            privacyUrl: data.get('privacyUrl')
          },
          billingSettings: {
            currency: data.get('currency'),
            taxRate: Number(data.get('taxRate')),
            invoicePrefix: data.get('invoicePrefix'),
            paymentInstructions: data.get('paymentInstructions'),
            termsAndConditions: data.get('termsAndConditions'),
            gracePeriodDays: Number(data.get('gracePeriodDays'))
          }
        }),
      'Configuracion comercial guardada.',
      refreshSession
    );
  }

  return (
    <Card>
      <CardHeader
        title="Configuracion comercial y billing"
        description="Valores usados al emitir facturas a empresas."
      />
      <form className="space-y-8 p-5" onSubmit={handleSettings}>
        <FormGrid title="Identidad comercial">
          <FormField label="Nombre comercial" htmlFor="settings-name" required>
            <input
              id="settings-name"
              required
              name="name"
              className={inputClass}
              defaultValue={settings?.name}
              placeholder="Nombre visible"
            />
          </FormField>
          <FormField label="Telefono" htmlFor="settings-phone">
            <input
              id="settings-phone"
              name="phone"
              className={inputClass}
              defaultValue={settings?.phone}
              placeholder="+593..."
            />
          </FormField>
        </FormGrid>

        <FormGrid
          title="Preferencias regionales"
          description="Formato aplicado a fechas, numeros y montos del tenant."
        >
          <FormField
            label="Moneda por defecto"
            htmlFor="settings-default-currency"
            hint="Codigo ISO de tres letras, por ejemplo USD."
          >
            <input
              id="settings-default-currency"
              name="defaultCurrency"
              className={inputClass}
              defaultValue={generalSettings.defaultCurrency || 'USD'}
              placeholder="USD"
            />
          </FormField>
          <FormField
            label="Idioma / locale"
            htmlFor="settings-locale"
            hint="Formato regional usado en fechas y numeros."
          >
            <input
              id="settings-locale"
              name="defaultLocale"
              className={inputClass}
              defaultValue={generalSettings.defaultLocale || 'es-EC'}
              placeholder="es-EC"
            />
          </FormField>
          <FormField
            label="Zona horaria"
            htmlFor="settings-timezone"
            hint="Nombre IANA, por ejemplo America/Guayaquil."
          >
            <input
              id="settings-timezone"
              name="defaultTimezone"
              className={inputClass}
              defaultValue={generalSettings.defaultTimezone || 'America/Guayaquil'}
              placeholder="America/Guayaquil"
            />
          </FormField>
          <FormField label="URL de terminos" htmlFor="settings-terms-url">
            <input
              id="settings-terms-url"
              type="url"
              name="termsUrl"
              className={inputClass}
              defaultValue={generalSettings.termsUrl}
              placeholder="https://..."
            />
          </FormField>
          <FormField label="URL de privacidad" htmlFor="settings-privacy-url">
            <input
              id="settings-privacy-url"
              type="url"
              name="privacyUrl"
              className={inputClass}
              defaultValue={generalSettings.privacyUrl}
              placeholder="https://..."
            />
          </FormField>
        </FormGrid>

        <FormGrid
          title="Facturacion"
          description="Se aplican al numerar y emitir facturas a tus empresas."
        >
          <FormField label="Moneda de facturacion" htmlFor="settings-billing-currency">
            <input
              id="settings-billing-currency"
              name="currency"
              className={inputClass}
              defaultValue={billingSettings.currency || 'USD'}
              placeholder="USD"
            />
          </FormField>
          <FormField
            label="Prefijo de facturas"
            htmlFor="settings-invoice-prefix"
            hint="Se usa para construir el numero visible de cada factura."
            required
          >
            <input
              id="settings-invoice-prefix"
              required
              name="invoicePrefix"
              className={inputClass}
              defaultValue={billingSettings.invoicePrefix || 'FAC'}
              placeholder="FAC"
            />
          </FormField>
          <FormField label="Impuesto (%)" htmlFor="settings-tax-rate">
            <input
              id="settings-tax-rate"
              min="0"
              step="0.01"
              type="number"
              name="taxRate"
              className={inputClass}
              defaultValue={billingSettings.taxRate || 0}
              placeholder="0"
            />
          </FormField>
          <FormField
            label="Dias de gracia"
            htmlFor="settings-grace-days"
            hint="Dias adicionales antes de considerar vencida una obligacion."
          >
            <input
              id="settings-grace-days"
              min="0"
              type="number"
              name="gracePeriodDays"
              className={inputClass}
              defaultValue={billingSettings.gracePeriodDays || 0}
              placeholder="0"
            />
          </FormField>
          <FormGridFull>
            <FormField label="Instrucciones de pago" htmlFor="settings-payment-instructions">
              <textarea
                id="settings-payment-instructions"
                name="paymentInstructions"
                className={`${inputClass} min-h-24`}
                defaultValue={billingSettings.paymentInstructions}
                placeholder="Cuenta bancaria, referencia y pasos."
              />
            </FormField>
          </FormGridFull>
          <FormGridFull>
            <FormField label="Terminos de facturacion" htmlFor="settings-billing-terms">
              <textarea
                id="settings-billing-terms"
                name="termsAndConditions"
                className={`${inputClass} min-h-24`}
                defaultValue={billingSettings.termsAndConditions}
                placeholder="Condiciones que apareceran en la factura."
              />
            </FormField>
          </FormGridFull>
        </FormGrid>

        <Button type="submit" disabled={Boolean(busy)}>
          <Settings className="h-4 w-4" />
          {busy === 'settings' ? 'Guardando...' : 'Guardar configuracion'}
        </Button>
      </form>
    </Card>
  );
}
