import { Link } from 'react-router-dom';
import { Button } from '../components/Button.jsx';

export function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-soft">
        <p className="text-sm font-bold uppercase tracking-wide text-cyan-700">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Ruta no encontrada</h1>
        <p className="mt-2 text-sm text-slate-500">
          Esta pantalla aun no existe en el cascaron inicial.
        </p>
        <Button as={Link} to="/login" className="mt-6">
          Volver al login
        </Button>
      </div>
    </div>
  );
}
