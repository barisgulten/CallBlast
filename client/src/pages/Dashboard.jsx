import { useState, useEffect, useId } from 'react';
import { Phone, Volume2, PhoneCall, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { get, post } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import ConfirmDialog from '../components/ConfirmDialog';
import StatusBadge from '../components/StatusBadge';
import BrandIcon from '../components/BrandIcon';

export default function Dashboard() {
  const { t, formatDate, formatPercent, formatGroupName, translateApiError } = useLanguage();
  const [stats, setStats] = useState(null);
  const [audioFiles, setAudioFiles] = useState([]);
  const [recentBlasts, setRecentBlasts] = useState([]);
  const [selectedAudio, setSelectedAudio] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [blastLoading, setBlastLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const audioSelectId = useId();
  const groupSelectId = useId();

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [statsData, audioData, blastsData, numbersData] = await Promise.all([
        get('/stats').catch(() => null),
        get('/audio').catch(() => []),
        get('/blasts?limit=5').catch(() => []),
        get('/numbers/groups').catch(() => []),
      ]);

      setStats(statsData || {
        totalNumbers: 0,
        totalAudioFiles: 0,
        totalCalls: 0,
        successRate: 0,
      });
      setAudioFiles(Array.isArray(audioData) ? audioData : audioData?.files || []);
      setRecentBlasts(Array.isArray(blastsData) ? blastsData : blastsData?.blasts || []);
      setGroups(Array.isArray(numbersData) ? numbersData : []);
    } catch {
      toast.error(t('dashboard.loadError'));
    } finally {
      setLoading(false);
    }
  }

  function handleBlastClick() {
    if (!selectedAudio) {
      toast.error(t('dashboard.selectAudioError'));
      return;
    }
    setConfirmOpen(true);
  }

  async function startBlast() {
    setBlastLoading(true);
    try {
      await post('/blasts', {
        audioFileId: selectedAudio,
        group: selectedGroup === 'all' ? null : selectedGroup,
      });
      toast.success(t('dashboard.startSuccess'));
      setConfirmOpen(false);
      loadDashboard();
    } catch (err) {
      toast.error(translateApiError(err, 'dashboard.startError'));
    } finally {
      setBlastLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card-static p-6">
              <div className="skeleton h-4 w-24 mb-3" />
              <div className="skeleton h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="card-static p-6">
          <div className="skeleton h-6 w-48 mb-4" />
          <div className="skeleton h-10 w-full mb-3" />
          <div className="skeleton h-10 w-full mb-3" />
          <div className="skeleton h-12 w-full" />
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: t('dashboard.statTotalNumbers'),
      value: stats?.totalNumbers || 0,
      icon: Phone,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-100 dark:bg-blue-500/15',
    },
    {
      label: t('dashboard.statAudioFiles'),
      value: stats?.totalAudioFiles || 0,
      icon: Volume2,
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBg: 'bg-purple-100 dark:bg-purple-500/15',
    },
    {
      label: t('dashboard.statTotalCalls'),
      value: stats?.totalCalls || 0,
      icon: PhoneCall,
      iconColor: 'text-green-600 dark:text-green-400',
      iconBg: 'bg-green-100 dark:bg-green-500/15',
    },
    {
      label: t('dashboard.statSuccessRate'),
      value: formatPercent(stats?.successRate || 0),
      icon: TrendingUp,
      iconColor: 'text-orange-600 dark:text-orange-400',
      iconBg: 'bg-orange-100 dark:bg-orange-500/15',
    },
  ];

  const confirmMessage =
    selectedGroup === 'all'
      ? t('dashboard.confirmAll')
      : t('dashboard.confirmGroup', { group: formatGroupName(selectedGroup) });

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{t('dashboard.title')}</h1>
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">{t('dashboard.subtitle')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <div key={i} className="card p-5 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{stat.value}</p>
              </div>
              <div className={`w-11 h-11 rounded-xl ${stat.iconBg} flex items-center justify-center`}>
                <stat.icon aria-hidden="true" className={`w-5 h-5 ${stat.iconColor}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Blast */}
        <div className="card-static p-6">
          <div className="flex items-center gap-2 mb-5">
            <BrandIcon className="w-5 h-5 text-red-500 dark:text-red-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
              {t('dashboard.quickBlastTitle')}
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor={audioSelectId} className="label">{t('dashboard.audioLabel')}</label>
              <select
                id={audioSelectId}
                value={selectedAudio}
                onChange={(e) => setSelectedAudio(e.target.value)}
                className="input"
              >
                <option value="">{t('dashboard.audioPlaceholder')}</option>
                {audioFiles.map((file) => (
                  <option key={file.id || file._id} value={file.id || file._id}>
                    {file.name || file.original_name || file.originalName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={groupSelectId} className="label">{t('dashboard.groupLabel')}</label>
              <select
                id={groupSelectId}
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="input"
              >
                <option value="all">{t('dashboard.groupAll')}</option>
                {groups.map((group) => (
                  <option key={group} value={group}>
                    {formatGroupName(group)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleBlastClick}
              className="w-full py-3.5 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-red-500/25 text-lg blast-btn-pulse flex items-center justify-center gap-2"
            >
              <BrandIcon className="w-5 h-5" />
              {t('dashboard.startBlastBtn')}
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card-static p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">
            {t('dashboard.recentTitle')}
          </h2>

          {recentBlasts.length === 0 ? (
            <div className="text-center py-8">
              <PhoneCall aria-hidden="true" className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-slate-400 text-sm">{t('dashboard.recentEmpty')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentBlasts.map((blast, i) => (
                <div
                  key={blast.id || blast._id || i}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 rounded-xl"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                      {t('dashboard.callsCount', {
                        count: blast.total_calls ?? blast.totalCalls ?? blast.total ?? 0,
                      })}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {formatDate(blast.started_at || blast.created_at || blast.createdAt || blast.date)}
                    </p>
                  </div>
                  <StatusBadge status={blast.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={startBlast}
        title={t('dashboard.confirmTitle')}
        message={confirmMessage}
        confirmText={t('dashboard.confirmBtn')}
        loading={blastLoading}
      />
    </div>
  );
}
