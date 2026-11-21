import { useState, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import ThemeLanguageControls from '../components/ThemeLanguageControls';
import BrandIcon from '../components/BrandIcon';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { t, translateApiError } = useLanguage();
  const navigate = useNavigate();

  const usernameId = useId();
  const passwordId = useId();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError(t('login.errorRequired'));
      return;
    }

    setLoading(true);
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(translateApiError(err, 'login.errorFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-dark-surface relative min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-indigo-900 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      {/* Top-right theme & language controls */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeLanguageControls variant="glass" />
      </div>

      <main className="relative w-full max-w-md z-10">
        {/* Logo Section */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-brand-400 to-brand-600 rounded-2xl shadow-2xl shadow-brand-500/30 mb-4">
            <BrandIcon className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">{t('common.brandName')}</h1>
          <p className="text-brand-200 text-sm">{t('login.subtitle')}</p>
        </div>

        {/* Login Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white/15 animate-slide-up"
        >
          <h2 className="text-xl font-semibold text-white mb-6">{t('login.title')}</h2>

          {error && (
            <div
              role="alert"
              className="mb-4 p-3 bg-red-500/20 border border-red-400/40 rounded-xl text-red-100 text-sm animate-fade-in"
            >
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor={usernameId} className="block text-sm font-medium text-brand-100 mb-1.5">
                {t('login.usernameLabel')}
              </label>
              <input
                id={usernameId}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/10 border border-white/25 rounded-xl text-white placeholder-brand-200/60 focus:ring-2 focus:ring-brand-400 focus:border-brand-400 outline-none transition-all"
                placeholder={t('login.usernamePlaceholder')}
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor={passwordId} className="block text-sm font-medium text-brand-100 mb-1.5">
                {t('login.passwordLabel')}
              </label>
              <div className="relative">
                <input
                  id={passwordId}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/10 border border-white/25 rounded-xl text-white placeholder-brand-200/60 focus:ring-2 focus:ring-brand-400 focus:border-brand-400 outline-none transition-all pr-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-200 hover:text-white transition-colors"
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="w-4 h-4" />
                  ) : (
                    <Eye aria-hidden="true" className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-2.5 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-medium rounded-xl transition-all duration-200 shadow-lg shadow-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                <span>{t('login.submitting')}</span>
              </>
            ) : (
              t('login.submit')
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
