import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'color-scheme';
const ThemeContext = createContext(null);

function readStoredPreference() {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val === 'light' || val === 'dark' ? val : 'system';
  } catch {
    return 'system';
  }
}

function getSystemScheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function syncMetaColorScheme(preference) {
  if (typeof document === 'undefined') return;
  let meta = document.querySelector('meta[name="color-scheme"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'color-scheme';
    document.head.appendChild(meta);
  }
  meta.content = preference === 'light' || preference === 'dark' ? preference : 'light dark';
  document.documentElement.classList.toggle('dark', preference === 'dark');
  document.documentElement.classList.toggle('light', preference === 'light');
}

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readStoredPreference);
  const [systemScheme, setSystemScheme] = useState(getSystemScheme);

  // Sync <meta name="color-scheme"> when preference changes
  useEffect(() => {
    syncMetaColorScheme(preference);
  }, [preference]);

  // Listen to OS color scheme changes without clearing explicit user overrides
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event) => {
      setSystemScheme(event.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Sync theme override across browser tabs
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleStorage = (event) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setPreferenceState(readStoredPreference());
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setPreference = useCallback((next) => {
    const normalized = next === 'light' || next === 'dark' ? next : 'system';
    try {
      if (normalized === 'system') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, normalized);
      }
    } catch {
      // Ignore storage errors (e.g., private browsing / blocked storage)
    }
    setPreferenceState(normalized);
  }, []);

  const resolvedScheme = preference === 'system' ? systemScheme : preference;

  // Two-state toggle logic: flip currently rendered scheme, and revert to 'system'
  // when the target happens to match the OS preference at toggle time.
  const toggleScheme = useCallback(() => {
    const target = resolvedScheme === 'dark' ? 'light' : 'dark';
    if (target === systemScheme) {
      setPreference('system');
    } else {
      setPreference(target);
    }
  }, [resolvedScheme, systemScheme, setPreference]);

  return (
    <ThemeContext.Provider
      value={{
        preference,
        systemScheme,
        resolvedScheme,
        setPreference,
        toggleScheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
