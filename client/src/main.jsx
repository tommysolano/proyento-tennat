import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { router } from './routes/AppRoutes.jsx';
import './styles.css';

// Sello de version del bundle en ejecucion. Si al reportar un bug de UI este
// commit no coincide con el HEAD actual, el navegador esta sirviendo codigo
// viejo y el bug no es real. Ver client/README.md.
console.info(
  `[TenantDesk] ${import.meta.env.MODE} · build ${window.__APP_BUILD__ || 'desconocido'}`
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
);
