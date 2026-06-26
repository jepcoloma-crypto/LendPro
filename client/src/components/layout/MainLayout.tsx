import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useMediaQuery } from '../../hooks/useMediaQuery';

export const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const effectiveCollapsed = isMobile ? !mobileOpen : collapsed;

  return (
    <div className="flex h-screen overflow-hidden">
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}
      <div className={`${isMobile ? `fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}` : ''}`}>
        <Sidebar collapsed={effectiveCollapsed} onClose={isMobile ? () => setMobileOpen(false) : undefined} />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onToggleSidebar={() => isMobile ? setMobileOpen(v => !v) : setCollapsed((prev) => !prev)} />
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4 sm:p-6">
          {window.location.hostname === 'localhost' && (
            <div className="bg-red-500 text-white text-xs font-semibold text-center py-1 px-4 rounded mb-4 -mt-2 -mx-2 sm:-mx-4">
              ⚠ DEV MODE — Connected to Staging Database
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
};
