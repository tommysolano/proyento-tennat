import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { HashScroll } from '../components/HashScroll.jsx';
import { Header } from './Header.jsx';
import { Sidebar } from './Sidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { canAccessPath } from '../utils/access.js';
import { roleHome } from '../routes/roleHome.js';

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { access, tenant, user } = useAuth();
  const branding = tenant?.distributor?.branding || {};
  const themeStyle = {
    '--tenant-primary': branding.primaryColor || '#0e7490',
    '--tenant-secondary': branding.secondaryColor || '#0f172a',
    '--tenant-accent': branding.accentColor || '#06b6d4'
  };
  const requestedPath = `${location.pathname}${location.search}${location.hash}`;
  if (!canAccessPath(requestedPath, access)) {
    return <Navigate to={roleHome[user?.role] || '/login'} replace />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50" style={themeStyle}>
      <HashScroll />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main
          id="main-content"
          className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 lg:p-8"
        >
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
