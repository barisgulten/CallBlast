import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, LogOut, User, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Sidebar from './Sidebar';
import ThemeLanguageControls from './ThemeLanguageControls';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('callblast-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  function toggleSidebarCollapse() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('callblast-sidebar-collapsed', String(next));
      } catch {
        // Ignore storage restrictions
      }
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex">
      <a
        href="#main-content"
        className="visually-hidden focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand-600 focus:text-white focus:rounded-lg focus:shadow-lg"
      >
        {t('nav.skipToContent')}
      </a>

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label={t('nav.openMenu')}
              aria-expanded={sidebarOpen}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 lg:hidden transition-colors"
            >
              <Menu aria-hidden="true" className="w-5 h-5 text-gray-600 dark:text-slate-300" />
            </button>

            <button
              type="button"
              onClick={toggleSidebarCollapse}
              aria-expanded={!sidebarCollapsed}
              aria-controls="app-sidebar"
              aria-label={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
              className="hidden lg:inline-flex items-center justify-center min-w-[40px] min-h-[40px] p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-300 transition-colors"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen aria-hidden="true" className="w-5 h-5" />
              ) : (
                <PanelLeftClose aria-hidden="true" className="w-5 h-5" />
              )}
            </button>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeLanguageControls />

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-800/80 border border-gray-200/70 dark:border-slate-700/80">
              <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center">
                <User aria-hidden="true" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-slate-200 hidden sm:inline">
                {user?.username || t('common.adminFallback')}
              </span>
            </div>

            <button
              type="button"
              onClick={logout}
              aria-label={t('common.logout')}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/15 text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              <LogOut aria-hidden="true" className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Main content */}
        <main id="main-content" tabIndex={-1} className="flex-1 p-4 lg:p-6 overflow-auto outline-none">
          <div className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
