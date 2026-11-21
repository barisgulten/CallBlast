import { useId } from 'react';
import { Sun, Moon, Globe } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { SUPPORTED_LANGUAGES } from '../i18n/translations';

export default function ThemeLanguageControls({ variant = 'default' }) {
  const { resolvedScheme, toggleScheme } = useTheme();
  const { lang, setLang, t } = useLanguage();
  const langSelectId = useId();

  const isGlass = variant === 'glass';
  const isDark = resolvedScheme === 'dark';

  const selectContainerClasses = isGlass
    ? 'relative flex items-center bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white transition-colors'
    : 'relative flex items-center bg-gray-100 hover:bg-gray-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 border border-gray-300/70 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-200 transition-colors';

  const selectClasses = isGlass
    ? 'appearance-none bg-transparent pl-8 pr-6 py-1.5 text-xs font-medium text-white outline-none cursor-pointer rounded-lg'
    : 'appearance-none bg-transparent pl-8 pr-6 py-1.5 text-xs font-medium text-gray-700 dark:text-slate-200 outline-none cursor-pointer rounded-lg';

  const iconClasses = isGlass
    ? 'w-3.5 h-3.5 text-brand-200 pointer-events-none absolute left-2.5'
    : 'w-3.5 h-3.5 text-gray-500 dark:text-slate-400 pointer-events-none absolute left-2.5';

  const chevronClasses = isGlass
    ? 'w-3 h-3 text-brand-200 pointer-events-none absolute right-2'
    : 'w-3 h-3 text-gray-500 dark:text-slate-400 pointer-events-none absolute right-2';

  const themeBtnClasses = isGlass
    ? 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-medium text-white transition-colors'
    : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 border border-gray-300/70 dark:border-slate-600 text-xs font-medium text-gray-700 dark:text-slate-200 transition-colors';

  return (
    <div className="flex items-center gap-2">
      {/* Language Selector */}
      <div className={selectContainerClasses}>
        <label htmlFor={langSelectId} className="visually-hidden">
          {t('language.selectLanguage')}
        </label>
        <Globe aria-hidden="true" className={iconClasses} />
        <select
          id={langSelectId}
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className={selectClasses}
        >
          {SUPPORTED_LANGUAGES.map((item) => (
            <option
              key={item.code}
              value={item.code}
              lang={item.code}
              className="bg-white text-gray-900 dark:bg-slate-900 dark:text-slate-100"
            >
              {item.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={chevronClasses}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {/* Theme Toggle (two-state opposite of rendered scheme) */}
      <button
        type="button"
        onClick={toggleScheme}
        aria-label={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
        className={themeBtnClasses}
      >
        {isDark ? (
          <Sun aria-hidden="true" className="w-4 h-4 text-amber-400" />
        ) : (
          <Moon aria-hidden="true" className="w-4 h-4" />
        )}
        <span className="whitespace-nowrap">
          {isDark ? t('theme.lightModeBtn') : t('theme.darkModeBtn')}
        </span>
      </button>
    </div>
  );
}
