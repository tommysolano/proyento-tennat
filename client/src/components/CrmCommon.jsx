import { LoaderCircle } from 'lucide-react';

export const inputClass = 'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

export function CrmNotice({ notice, error }) {
  return (
    <>
      {notice ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div> : null}
    </>
  );
}

export function CrmLoading({ label = 'Cargando CRM...' }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white p-10 text-sm text-slate-500">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function money(value, currency = 'USD') {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency }).format(value || 0);
}

export function localDate(value, fallback = '-') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString('es-EC');
}

export function dateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export function CustomFieldInput({ field, defaultValue }) {
  const name = `custom_${field.key}`;
  if (field.type === 'boolean') {
    return <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={Boolean(defaultValue)} />{field.label}</label>;
  }
  if (field.type === 'select') {
    return <label className="space-y-1 text-xs font-semibold text-slate-600">{field.label}<select name={name} required={field.required} defaultValue={defaultValue ?? ''} className={inputClass}><option value="">Seleccionar</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  }
  if (field.type === 'multiselect') {
    return <label className="space-y-1 text-xs font-semibold text-slate-600">{field.label}<select multiple name={name} required={field.required} defaultValue={Array.isArray(defaultValue) ? defaultValue : []} className={inputClass}>{field.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  }
  if (field.type === 'textarea') {
    return <label className="space-y-1 text-xs font-semibold text-slate-600">{field.label}<textarea name={name} required={field.required} defaultValue={defaultValue ?? ''} className={inputClass} /></label>;
  }
  const type = { number: 'number', date: 'date', email: 'email', phone: 'tel', url: 'url' }[field.type] || 'text';
  return <label className="space-y-1 text-xs font-semibold text-slate-600">{field.label}<input type={type} name={name} required={field.required} defaultValue={defaultValue ?? ''} className={inputClass} /></label>;
}

export function customFieldsFromForm(formData, definitions) {
  return Object.fromEntries(definitions.map((field) => {
    if (field.type === 'boolean') return [field.key, formData.get(`custom_${field.key}`) === 'on'];
    if (field.type === 'multiselect') return [field.key, formData.getAll(`custom_${field.key}`)];
    const value = formData.get(`custom_${field.key}`);
    return [field.key, field.type === 'number' && value !== '' ? Number(value) : value];
  }));
}
