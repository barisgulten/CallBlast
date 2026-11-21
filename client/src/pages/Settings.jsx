import { useState, useEffect, useId } from 'react';
import { get, put, post } from '../api/client';
import toast from 'react-hot-toast';
import { Save, Server, Phone, Shield, RefreshCw, Palette, Sun, Moon, Monitor, Globe } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { SUPPORTED_LANGUAGES } from '../i18n/translations';

export default function Settings() {
  const { preference, systemScheme, setPreference } = useTheme();
  const { lang, setLang, t, translateApiError } = useLanguage();

  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});

  // Password change
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const langSelectId = useId();
  const cucmIpId = useId();
  const cucmIpHintId = useId();
  const cucmPortId = useId();
  const cucmPortHintId = useId();
  const maxConcId = useId();
  const maxConcHintId = useId();
  const ringTimeoutId = useId();
  const ringTimeoutHintId = useId();
  const retryFailedId = useId();
  const retryCountId = useId();
  const currentPwdId = useId();
  const newPwdId = useId();
  const confirmPwdId = useId();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await get('/settings');
      if (Array.isArray(data)) {
        const settingsMap = {};
        data.forEach((s) => {
          settingsMap[s.key] = s.value;
        });
        setSettings(settingsMap);
      } else if (data && typeof data === 'object') {
        setSettings(data);
      }
    } catch {
      toast.error(t('settings.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSipSettings = async () => {
    setSaving((prev) => ({ ...prev, sip: true }));
    try {
      await put('/settings', {
        cucm_ip: settings.cucm_ip,
        cucm_port: settings.cucm_port,
      });
      toast.success(t('settings.sipSaveSuccess'));
    } catch (err) {
      toast.error(translateApiError(err, 'settings.sipSaveError'));
    } finally {
      setSaving((prev) => ({ ...prev, sip: false }));
    }
  };

  const saveCallSettings = async () => {
    setSaving((prev) => ({ ...prev, call: true }));
    try {
      await put('/settings', {
        max_concurrent_calls: settings.max_concurrent_calls,
        ring_timeout: settings.ring_timeout,
        retry_failed: settings.retry_failed || 'false',
        retry_count: settings.retry_count || '1',
      });
      toast.success(t('settings.callSaveSuccess'));
    } catch (err) {
      toast.error(translateApiError(err, 'settings.callSaveError'));
    } finally {
      setSaving((prev) => ({ ...prev, call: false }));
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error(t('settings.passwordMismatch'));
      return;
    }
    if (passwords.newPassword.length < 6) {
      toast.error(t('settings.passwordTooShort'));
      return;
    }
    setSaving((prev) => ({ ...prev, password: true }));
    try {
      await post('/auth/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      toast.success(t('settings.passwordSuccess'));
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(translateApiError(err, 'settings.passwordError'));
    } finally {
      setSaving((prev) => ({ ...prev, password: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw aria-hidden="true" className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  const systemLabel = t('settings.themeSystemWithCurrent', {
    current: systemScheme === 'dark' ? t('theme.dark') : t('theme.light'),
  });

  const themeOptions = [
    {
      value: 'system',
      label: systemLabel,
      description: t('settings.themeSystemDesc'),
      icon: Monitor,
    },
    {
      value: 'light',
      label: t('theme.light'),
      description: t('settings.themeLightDesc'),
      icon: Sun,
    },
    {
      value: 'dark',
      label: t('theme.dark'),
      description: t('settings.themeDarkDesc'),
      icon: Moon,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{t('settings.title')}</h1>
        <p className="text-gray-500 dark:text-slate-400 mt-1">{t('settings.subtitle')}</p>
      </div>

      {/* Appearance & Language */}
      <div className="card-static p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-100 dark:bg-purple-500/15 rounded-lg">
            <Palette aria-hidden="true" className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
              {t('settings.appearanceHeading')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">{t('settings.appearanceSubtitle')}</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* 3-State Theme Selector */}
          <fieldset>
            <legend className="label mb-2">{t('settings.themeLegend')}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {themeOptions.map(({ value, label, description, icon: Icon }) => {
                const isSelected = preference === value;
                return (
                  <label
                    key={value}
                    className={`relative flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500 ${
                      isSelected
                        ? 'border-brand-600 dark:border-brand-400 bg-brand-50/70 dark:bg-brand-500/15 ring-2 ring-brand-500/20'
                        : 'border-gray-200 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-800/50 hover:border-brand-300 dark:hover:border-brand-500/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="color-theme"
                      value={value}
                      checked={isSelected}
                      onChange={() => setPreference(value)}
                      className="sr-only"
                    />
                    <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-brand-600 dark:text-brand-400 shrink-0">
                      <Icon aria-hidden="true" className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900 dark:text-slate-100">
                        {label}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                        {description}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Language Selector */}
          <div className="max-w-sm">
            <label htmlFor={langSelectId} className="label flex items-center gap-1.5">
              <Globe aria-hidden="true" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              {t('language.label')}
            </label>
            <select
              id={langSelectId}
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="input"
            >
              {SUPPORTED_LANGUAGES.map((item) => (
                <option key={item.code} value={item.code} lang={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{t('language.description')}</p>
          </div>
        </div>
      </div>

      {/* SIP Settings */}
      <div className="card-static p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 dark:bg-blue-500/15 rounded-lg">
            <Server aria-hidden="true" className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{t('settings.sipHeading')}</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">{t('settings.sipSubtitle')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor={cucmIpId} className="label">{t('settings.cucmIpLabel')}</label>
            <input
              id={cucmIpId}
              type="text"
              aria-describedby={cucmIpHintId}
              value={settings.cucm_ip || ''}
              onChange={(e) => handleSettingChange('cucm_ip', e.target.value)}
              className="input"
              placeholder="10.0.0.1"
            />
            <p id={cucmIpHintId} className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {t('settings.cucmIpHint')}
            </p>
          </div>

          <div>
            <label htmlFor={cucmPortId} className="label">{t('settings.cucmPortLabel')}</label>
            <input
              id={cucmPortId}
              type="text"
              aria-describedby={cucmPortHintId}
              value={settings.cucm_port || ''}
              onChange={(e) => handleSettingChange('cucm_port', e.target.value)}
              className="input"
              placeholder="5060"
            />
            <p id={cucmPortHintId} className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {t('settings.cucmPortHint')}
            </p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-800/60 rounded-lg text-xs text-blue-700 dark:text-blue-300">
          <span aria-hidden="true">💡</span> <strong>{t('settings.sipInfoPrefix')}</strong> {t('settings.sipInfoBody')}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={saveSipSettings}
            disabled={saving.sip}
            className="btn-primary"
          >
            {saving.sip ? (
              <RefreshCw aria-hidden="true" className="w-4 h-4 animate-spin" />
            ) : (
              <Save aria-hidden="true" className="w-4 h-4" />
            )}
            {t('common.save')}
          </button>
        </div>
      </div>

      {/* Call Settings */}
      <div className="card-static p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-green-100 dark:bg-green-500/15 rounded-lg">
            <Phone aria-hidden="true" className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{t('settings.callHeading')}</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">{t('settings.callSubtitle')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor={maxConcId} className="label">{t('settings.maxConcurrentLabel')}</label>
            <input
              id={maxConcId}
              type="number"
              min="1"
              max="100"
              aria-describedby={maxConcHintId}
              value={settings.max_concurrent_calls || ''}
              onChange={(e) => handleSettingChange('max_concurrent_calls', e.target.value)}
              className="input"
              placeholder="50"
            />
            <p id={maxConcHintId} className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {t('settings.maxConcurrentHint')}
            </p>
          </div>

          <div>
            <label htmlFor={ringTimeoutId} className="label">{t('settings.ringTimeoutLabel')}</label>
            <input
              id={ringTimeoutId}
              type="number"
              min="10"
              max="120"
              aria-describedby={ringTimeoutHintId}
              value={settings.ring_timeout || ''}
              onChange={(e) => handleSettingChange('ring_timeout', e.target.value)}
              className="input"
              placeholder="30"
            />
            <p id={ringTimeoutHintId} className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {t('settings.ringTimeoutHint')}
            </p>
          </div>

          <div>
            <label htmlFor={retryFailedId} className="label">{t('settings.retryFailedLabel')}</label>
            <select
              id={retryFailedId}
              value={settings.retry_failed || 'false'}
              onChange={(e) => handleSettingChange('retry_failed', e.target.value)}
              className="input"
            >
              <option value="false">{t('common.no')}</option>
              <option value="true">{t('common.yes')}</option>
            </select>
          </div>

          {settings.retry_failed === 'true' && (
            <div>
              <label htmlFor={retryCountId} className="label">{t('settings.retryCountLabel')}</label>
              <input
                id={retryCountId}
                type="number"
                min="1"
                max="5"
                value={settings.retry_count || '1'}
                onChange={(e) => handleSettingChange('retry_count', e.target.value)}
                className="input"
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={saveCallSettings}
            disabled={saving.call}
            className="btn-primary"
          >
            {saving.call ? (
              <RefreshCw aria-hidden="true" className="w-4 h-4 animate-spin" />
            ) : (
              <Save aria-hidden="true" className="w-4 h-4" />
            )}
            {t('common.save')}
          </button>
        </div>
      </div>

      {/* Password Change */}
      <div className="card-static p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-amber-100 dark:bg-amber-500/15 rounded-lg">
            <Shield aria-hidden="true" className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
              {t('settings.passwordHeading')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">{t('settings.passwordSubtitle')}</p>
          </div>
        </div>

        <form onSubmit={changePassword} className="space-y-4 max-w-md">
          <div>
            <label htmlFor={currentPwdId} className="label">{t('settings.currentPasswordLabel')}</label>
            <input
              id={currentPwdId}
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(e) =>
                setPasswords((prev) => ({ ...prev, currentPassword: e.target.value }))
              }
              className="input"
              required
            />
          </div>

          <div>
            <label htmlFor={newPwdId} className="label">{t('settings.newPasswordLabel')}</label>
            <input
              id={newPwdId}
              type="password"
              name="newPassword"
              autoComplete="new-password"
              value={passwords.newPassword}
              onChange={(e) =>
                setPasswords((prev) => ({ ...prev, newPassword: e.target.value }))
              }
              className="input"
              required
              minLength={6}
            />
          </div>

          <div>
            <label htmlFor={confirmPwdId} className="label">{t('settings.confirmPasswordLabel')}</label>
            <input
              id={confirmPwdId}
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              value={passwords.confirmPassword}
              onChange={(e) =>
                setPasswords((prev) => ({ ...prev, confirmPassword: e.target.value }))
              }
              className="input"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={saving.password}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving.password ? (
              <RefreshCw aria-hidden="true" className="w-4 h-4 animate-spin" />
            ) : (
              <Shield aria-hidden="true" className="w-4 h-4" />
            )}
            {t('settings.changePasswordBtn')}
          </button>
        </form>
      </div>

      {/* System Info */}
      <div className="bg-gray-100/70 dark:bg-slate-900/70 rounded-xl border border-gray-200 dark:border-slate-800 p-6">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          {t('settings.systemInfoHeading')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-slate-400">{t('settings.versionLabel')}</span>{' '}
            <span className="font-medium text-gray-900 dark:text-slate-100">1.0.0</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-slate-400">{t('settings.ariLabel')}</span>{' '}
            <span className="font-medium text-gray-900 dark:text-slate-100">
              {settings.ari_connected === 'true' ? (
                <span className="text-green-600 dark:text-green-400">● {t('settings.ariConnected')}</span>
              ) : (
                <span className="text-red-600 dark:text-red-400">● {t('settings.ariDisconnected')}</span>
              )}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-slate-400">{t('settings.sipTrunkLabel')}</span>{' '}
            <span className="font-medium text-gray-900 dark:text-slate-100">
              {settings.cucm_ip || t('settings.notConfigured')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
