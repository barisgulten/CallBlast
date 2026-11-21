import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Numbers from './pages/Numbers';
import AudioFiles from './pages/AudioFiles';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Triggers from './pages/Triggers';

const ROUTE_TITLE_KEYS = {
  '/login': 'routes.login',
  '/': 'routes.dashboard',
  '/triggers': 'routes.triggers',
  '/numbers': 'routes.numbers',
  '/audio': 'routes.audio',
  '/logs': 'routes.logs',
  '/settings': 'routes.settings',
};

function RouteTitleUpdater() {
  const { pathname } = useLocation();
  const { t, lang } = useLanguage();

  useEffect(() => {
    const titleKey = ROUTE_TITLE_KEYS[pathname] || 'routes.dashboard';
    document.title = `${t(titleKey)} | ${t('common.brandName')}`;
  }, [pathname, lang, t]);

  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <RouteTitleUpdater />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/triggers" element={<Triggers />} />
              <Route path="/numbers" element={<Numbers />} />
              <Route path="/audio" element={<AudioFiles />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                borderRadius: '12px',
                padding: '12px 16px',
                fontSize: '14px',
                background: 'var(--surface-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              },
              success: {
                iconTheme: { primary: '#10b981', secondary: '#fff' },
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: '#fff' },
              },
            }}
          />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
