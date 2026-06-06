export const CONTACT_STATUS_OPTIONS = [
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'contactado', label: 'Contactado' },
  { value: 'interesado', label: 'Interesado' },
  { value: 'no_interesado', label: 'No interesado' },
  { value: 'seguimiento', label: 'Seguimiento' },
  { value: 'cerrado', label: 'Cerrado' }
];

export function contactStatusLabel(value) {
  return CONTACT_STATUS_OPTIONS.find((option) => option.value === value)?.label || value;
}

export function idOf(value) {
  return value && typeof value === 'object' ? value._id : value;
}

export function formatDate(value, fallback = 'Sin registro') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}
