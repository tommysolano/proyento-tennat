import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { HashScroll } from '../components/HashScroll.jsx';
import { Header } from './Header.jsx';
import { Sidebar } from './Sidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { tenant } = useAuth();
  const branding = tenant?.distributor?.branding || {};
  const themeStyle = {
    '--tenant-primary': branding.primaryColor || '#0e7490',
    '--tenant-secondary': branding.secondaryColor || '#0f172a',
    '--tenant-accent': branding.accentColor || '#06b6d4'
  };

  return (
    <div className="flex min-h-screen bg-slate-50" style={themeStyle}>
      <HashScroll />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
