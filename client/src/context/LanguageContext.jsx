import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { translations, SUPPORTED_LANGUAGES, API_ERROR_KEYS } from '../i18n/translations';

const STORAGE_KEY = 'callblast_lang';
const LanguageContext = createContext(null);

function resolveInitialLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'tr' || stored === 'en' || stored === 'de') {
      return stored;
    }
  } catch {
    // Ignore storage access errors
  }

  if (typeof navigator !== 'undefined' && navigator.language) {
    const lower = navigator.language.toLowerCase();
    if (lower.startsWith('en')) return 'en';
    if (lower.startsWith('de')) return 'de';
  }
  return 'tr';
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

export function parseSqliteDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return Number.isNaN(dateStr.getTime()) ? null : dateStr;

  const str = String(dateStr).trim();
  const isoCandidate = !str.includes('T') && /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(str)
    ? `${str.replace(' ', 'T')}Z`
    : str;

  const parsed = new Date(isoCandidate);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(str);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(resolveInitialLanguage);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleStorage = (event) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setLangState(resolveInitialLanguage());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setLang = useCallback((nextLang) => {
    const normalized = nextLang === 'en' || nextLang === 'de' ? nextLang : 'tr';
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // Ignore storage access errors
    }
    setLangState(normalized);
  }, []);

  const locale = useMemo(() => {
    const found = SUPPORTED_LANGUAGES.find((item) => item.code === lang);
    return found ? found.locale : 'tr-TR';
  }, [lang]);

  const t = useCallback(
    (key, params = {}) => {
      const activeDict = translations[lang] || translations.tr;
      let template = getNestedValue(activeDict, key);
      if (template === undefined) {
        template = getNestedValue(translations.tr, key);
      }
      if (typeof template !== 'string') {
        return key;
      }

      return template.replace(/\{(\w+)\}/g, (_match, paramName) => {
        return params[paramName] !== undefined && params[paramName] !== null
          ? String(params[paramName])
          : '';
      });
    },
    [lang]
  );

  const formatDate = useCallback(
    (dateStr) => {
      if (!dateStr) return '-';
      const d = parseSqliteDate(dateStr);
      if (!d) return String(dateStr);
      return d.toLocaleString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    [locale]
  );

  const formatDateOnly = useCallback(
    (dateStr) => {
      if (!dateStr) return '-';
      const d = parseSqliteDate(dateStr);
      if (!d) return String(dateStr);
      return d.toLocaleDateString(locale);
    },
    [locale]
  );

  const formatTime = useCallback(
    (dateStr) => {
      if (!dateStr) return '-';
      const d = parseSqliteDate(dateStr);
      if (!d) return '-';
      return d.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    },
    [locale]
  );

  const formatPercent = useCallback(
    (num) => {
      const value = Number(num) || 0;
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: 2,
      }).format(value / 100);
    },
    [locale]
  );

  const formatGroupName = useCallback(
    (name) => {
      if (name === 'Genel') return t('common.generalGroup');
      if (name === 'all') return t('common.all');
      return name;
    },
    [t]
  );

  const translateApiError = useCallback(
    (errOrMsg, fallbackKey) => {
      const rawMessage = typeof errOrMsg === 'string' ? errOrMsg : errOrMsg?.message;
      if (rawMessage && API_ERROR_KEYS[rawMessage]) {
        return t(API_ERROR_KEYS[rawMessage]);
      }
      if (rawMessage) {
        return rawMessage;
      }
      return fallbackKey ? t(fallbackKey) : '';
    },
    [t]
  );

  return (
    <LanguageContext.Provider
      value={{
        lang,
        locale,
        setLang,
        t,
        formatDate,
        formatDateOnly,
        formatTime,
        formatPercent,
        formatGroupName,
        translateApiError,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
