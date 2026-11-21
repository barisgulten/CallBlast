import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Phone,
  Volume2,
  FileText,
  Settings,
  Radio,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import BrandIcon from './BrandIcon';

export default function Sidebar({ isOpen, onClose, isCollapsed = false, onToggleCollapse }) {
  const { t } = useLanguage();
  const [tooltip, setTooltip] = useState(null);
  const hideTimerRef = useRef(null);

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/triggers', icon: Radio, label: t('nav.triggers') },
    { to: '/numbers', icon: Phone, label: t('nav.numbers') },
    { to: '/audio', icon: Volume2, label: t('nav.audio') },
    { to: '/logs', icon: FileText, label: t('nav.logs') },
    { to: '/settings', icon: Settings, label: t('nav.settings') },
  ];

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function showTooltip(event, label) {
    if (!isCollapsed) return;
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) {
      return;
    }
    clearHideTimer();
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      label,
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  }

  function scheduleHideTooltip() {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setTooltip(null);
    }, 100);
  }

  function hideTooltipNow() {
    clearHideTimer();
    setTooltip(null);
  }

  useEffect(() => {
    if (!isCollapsed) {
      hideTooltipNow();
    }
    return () => clearHideTimer();
  }, [isCollapsed]);

  // Allow dismissing hover/focus tooltip with Escape per WCAG 1.4.13
  useEffect(() => {
    if (!tooltip) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        hideTooltipNow();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [tooltip]);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        id="app-sidebar"
        className={`sidebar-shell ${
          isCollapsed ? 'is-collapsed lg:w-20' : 'lg:w-64'
        } fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 lg:translate-x-0 lg:static lg:z-auto lg:shrink-0 flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="sidebar-brand-row h-16 flex items-center justify-between px-6 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/25 flex-shrink-0">
              <BrandIcon className="w-6 h-6 text-white" />
            </div>
            <div className="sidebar-expanded-only min-w-0">
              <span className="block text-lg font-bold text-gray-900 dark:text-slate-100 leading-tight truncate">
                {t('common.brandName')}
              </span>
              <p className="text-[10px] text-gray-500 dark:text-slate-400 leading-none truncate">
                {t('common.brandSubtitle')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('nav.closeMenu')}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 lg:hidden"
          >
            <X aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav aria-label={t('nav.primary')} className="px-3 py-4 space-y-1 flex-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              onMouseEnter={(e) => showTooltip(e, label)}
              onMouseLeave={scheduleHideTooltip}
              onFocus={(e) => showTooltip(e, label)}
              onBlur={hideTooltipNow}
              className={({ isActive }) =>
                `sidebar-nav-link min-h-[42px] flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 shadow-sm'
                    : 'text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/70 hover:text-gray-900 dark:hover:text-slate-100'
                }`
              }
            >
              <Icon aria-hidden="true" className="w-5 h-5 flex-shrink-0" />
              <span className="sidebar-item-label truncate">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom collapse button & version info */}
        <div className="p-3 border-t border-gray-100 dark:border-slate-800 space-y-2.5">
          {typeof onToggleCollapse === 'function' && (
            <button
              type="button"
              onClick={onToggleCollapse}
              onMouseEnter={(e) =>
                showTooltip(e, isCollapsed ? t('nav.expandSidebar') : t('nav.collapseShort'))
              }
              onMouseLeave={scheduleHideTooltip}
              onFocus={(e) =>
                showTooltip(e, isCollapsed ? t('nav.expandSidebar') : t('nav.collapseShort'))
              }
              onBlur={hideTooltipNow}
              aria-expanded={!isCollapsed}
              aria-controls="app-sidebar"
              className="hidden lg:flex sidebar-nav-link w-full min-h-[40px] items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800/80 hover:text-gray-900 dark:hover:text-slate-100 transition-colors"
            >
              {isCollapsed ? (
                <PanelLeftOpen aria-hidden="true" className="w-5 h-5 flex-shrink-0" />
              ) : (
                <PanelLeftClose aria-hidden="true" className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="sidebar-item-label truncate">
                {isCollapsed ? t('nav.expandSidebar') : t('nav.collapseShort')}
              </span>
            </button>
          )}

          <div className="sidebar-expanded-only px-3 py-2 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100/70 dark:border-brand-500/20">
            <p className="text-xs font-medium text-brand-700 dark:text-brand-300 truncate">
              {t('common.versionBadge')}
            </p>
            <p className="text-[10px] text-brand-600 dark:text-brand-400 truncate">
              {t('common.brandPanelTitle')}
            </p>
          </div>

          <div className="sidebar-collapsed-only items-center justify-center py-1.5 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100/70 dark:border-brand-500/20">
            <span className="text-[11px] font-semibold text-brand-700 dark:text-brand-300">
              v1.0
            </span>
          </div>
        </div>
      </aside>

      {/* Fixed visual-only floating label when desktop sidebar is collapsed */}
      {isCollapsed && tooltip && (
        <div
          aria-hidden="true"
          onMouseEnter={clearHideTimer}
          onMouseLeave={scheduleHideTooltip}
          style={{ top: `${tooltip.top}px`, left: `${tooltip.left}px` }}
          className="hidden lg:block fixed z-50 -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-slate-800 text-white dark:text-slate-100 text-xs font-medium shadow-lg border border-gray-700/50 dark:border-slate-700 whitespace-nowrap"
        >
          {tooltip.label}
        </div>
      )}
    </>
  );
}
