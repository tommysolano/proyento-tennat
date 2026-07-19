/**
 * Banners de resultado de una accion. `softError` es para fallos parciales
 * que no invalidan la pagina (un modulo no contratado, por ejemplo).
 */
export function FeedbackBanners({ notice, error, softError }) {
  if (!notice && !error && !softError) return null;

  return (
    <div className="space-y-2">
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      {softError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {softError}
        </div>
      ) : null}
    </div>
  );
}
