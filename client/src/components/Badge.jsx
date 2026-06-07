const styles = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  connected: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  trial: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  past_due: 'bg-amber-50 text-amber-700 ring-amber-200',
  open: 'bg-sky-50 text-sky-700 ring-sky-200',
  resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  inactive: 'bg-slate-100 text-slate-600 ring-slate-200',
  suspended: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-slate-100 text-slate-700 ring-slate-300',
  archived: 'bg-slate-100 text-slate-700 ring-slate-300',
  planned: 'bg-violet-50 text-violet-700 ring-violet-200',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  succeeded: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  refunded: 'bg-violet-50 text-violet-700 ring-violet-200',
  void: 'bg-slate-100 text-slate-600 ring-slate-200',
  overdue: 'bg-rose-50 text-rose-700 ring-rose-200',
  uncollectible: 'bg-rose-50 text-rose-700 ring-rose-200',
  nuevo: 'bg-amber-50 text-amber-700 ring-amber-200',
  no_interesado: 'bg-rose-50 text-rose-700 ring-rose-200',
  interesado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  contactado: 'bg-blue-50 text-blue-700 ring-blue-200',
  seguimiento: 'bg-violet-50 text-violet-700 ring-violet-200',
  cerrado: 'bg-slate-100 text-slate-700 ring-slate-300',
  pendiente: 'bg-amber-50 text-amber-700 ring-amber-200',
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  error: 'bg-rose-50 text-rose-700 ring-rose-200',
  critical: 'bg-rose-100 text-rose-800 ring-rose-300',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  acknowledged: 'bg-violet-50 text-violet-700 ring-violet-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  processing: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  dead: 'bg-rose-100 text-rose-800 ring-rose-300'
};

export function Badge({ children, tone = 'draft' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
        styles[tone] || styles.draft
      }`}
    >
      {children}
    </span>
  );
}
