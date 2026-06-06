import { ArrowRight, KeyRound, PanelsTopLeft } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { demoAccounts } from '../data/mockData.js';
import { roleHome } from '../routes/roleHome.js';

export function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, login, user } = useAuth();
  const [email, setEmail] = useState('superadmin@example.com');
  const [password, setPassword] = useState('Admin123456');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={roleHome[user.role] || '/login'} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await login(email, password);
      navigate(data.redirectPath, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden min-h-screen flex-col justify-between bg-slate-950 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-cyan-500">
            <PanelsTopLeft className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-bold">TenantDesk</p>
            <p className="text-sm text-slate-300">MERN SaaS multi-tenant</p>
          </div>
        </div>

        <div className="max-w-2xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-cyan-300">
            Cascaron visual y estructural
          </p>
          <h1 className="text-5xl font-semibold leading-tight">
            Flujo jerarquico listo para presentar y seguir construyendo.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300">
            Distribuidores, empresas, supervisores y agentes entran a vistas separadas con datos
            demo, rutas protegidas y API preparada para crecer por modulos.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {['JWT Auth', 'MongoDB', 'Roles'].map((item) => (
            <div key={item} className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold">{item}</p>
              <p className="mt-1 text-xs text-slate-400">Base instalada</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-cyan-700 text-white">
              <PanelsTopLeft className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-950">TenantDesk</p>
              <p className="text-sm text-slate-500">MERN SaaS multi-tenant</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
            <div className="mb-6">
              <div className="mb-4 inline-flex rounded-md bg-cyan-50 p-2 text-cyan-700">
                <KeyRound className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-950">Iniciar sesion</h2>
              <p className="mt-2 text-sm text-slate-500">
                Usa una cuenta demo de desarrollo. SUPERADMIN usa Admin123456 y los demas Demo1234!
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Email</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none ring-cyan-100 transition focus:border-cyan-600 focus:ring-4"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="correo@demo.com"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Password</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none ring-cyan-100 transition focus:border-cyan-600 focus:ring-4"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Demo1234!"
                />
              </label>

              {error ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? 'Ingresando...' : 'Entrar al dashboard'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </div>

          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
              Cuentas demo
            </p>
            <div className="grid gap-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => setEmail(account.email)}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-sm transition hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-700">{account.role}</span>
                  <span className="text-xs text-slate-500">{account.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
