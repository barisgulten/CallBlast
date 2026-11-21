import { useState, useEffect, Fragment } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Volume2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { get } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import StatusBadge from '../components/StatusBadge';

export default function Logs() {
  const { t, formatDate, formatTime } = useLanguage();
  const [blasts, setBlasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [callDetails, setCallDetails] = useState({});
  const [detailsLoading, setDetailsLoading] = useState({});

  useEffect(() => {
    loadBlasts();
  }, [page]);

  // Silently refresh while any displayed blast is still active
  useEffect(() => {
    const hasActiveBlast = blasts.some(
      (b) => b.status === 'in_progress' || b.status === 'started'
    );
    if (!hasActiveBlast) return;

    const timer = setInterval(async () => {
      await loadBlasts({ silent: true });
      if (expandedId) {
        try {
          let data;
          try {
            data = await get(`/logs/${expandedId}`);
          } catch {
            data = await get(`/blasts/${expandedId}`);
          }
          const calls = data.calls || data.details || data.results || [];
          setCallDetails((prev) => ({
            ...prev,
            [expandedId]: calls,
          }));
        } catch {
          // Ignore background refresh error for details
        }
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [blasts, expandedId, page]);

  async function loadBlasts({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
    }
    try {
      let data;
      try {
        data = await get(`/logs?page=${page}&limit=10`);
      } catch {
        data = await get(`/blasts?page=${page}&limit=10`);
      }

      if (Array.isArray(data)) {
        setBlasts(data);
        setTotalPages(1);
      } else {
        setBlasts(data.blasts || data.logs || data.data || []);
        setTotalPages(data.totalPages || Math.ceil((data.total || 0) / 10) || 1);
      }
    } catch {
      if (!silent) {
        toast.error(t('logs.loadError'));
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function toggleExpand(blastId) {
    if (expandedId === blastId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(blastId);

    if (!callDetails[blastId]) {
      setDetailsLoading((prev) => ({ ...prev, [blastId]: true }));
      try {
        let data;
        try {
          data = await get(`/logs/${blastId}`);
        } catch {
          data = await get(`/blasts/${blastId}`);
        }

        const calls = data.calls || data.details || data.results || [];
        setCallDetails((prev) => ({
          ...prev,
          [blastId]: calls,
        }));
      } catch {
        toast.error(t('logs.detailsError'));
      } finally {
        setDetailsLoading((prev) => ({ ...prev, [blastId]: false }));
      }
    }
  }

  function translateHangupCause(cause, status) {
    if (status === 'answered' || status === 'completed') {
      return t('logs.causeAnswered');
    }
    if (!cause) return t('logs.causeNoResponse');
    const c = String(cause).toLowerCase();
    if (c.includes('busy')) return t('logs.causeBusy');
    if (c.includes('no answer') || c.includes('timeout')) return t('logs.causeNoAnswer');
    if (c.includes('reject')) return t('logs.causeRejected');
    if (c.includes('unallocated') || c.includes('not found')) return t('logs.causeNotFound');
    if (c.includes('normal')) return t('logs.causeNormal');
    if (c.includes('failed') || c.includes('error')) return t('logs.causeFailed');
    return cause;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{t('logs.title')}</h1>
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
          {t('logs.subtitle')}
        </p>
      </div>

      {/* Table */}
      <div className="card-static overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="skeleton h-5 w-36" />
                <div className="skeleton h-5 w-28" />
                <div className="skeleton h-5 w-24" />
                <div className="skeleton h-5 w-16" />
                <div className="skeleton h-5 w-16" />
                <div className="skeleton h-5 w-16" />
                <div className="skeleton h-5 w-20" />
              </div>
            ))}
          </div>
        ) : blasts.length === 0 ? (
          <div className="text-center py-12">
            <FileText aria-hidden="true" className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400 font-medium">{t('logs.emptyTitle')}</p>
            <p className="text-gray-400 dark:text-slate-500 text-sm mt-1">
              {t('logs.emptyHint')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800/70 border-b border-gray-100 dark:border-slate-800">
                  <th scope="col" className="w-12 px-4 py-3 text-left">
                    <span className="visually-hidden">{t('logs.colExpand')}</span>
                  </th>
                  <th
                    scope="col"
                    className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {t('logs.colDate')}
                  </th>
                  <th
                    scope="col"
                    className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {t('logs.colTrigger')}
                  </th>
                  <th
                    scope="col"
                    className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {t('logs.colAudio')}
                  </th>
                  <th
                    scope="col"
                    className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {t('logs.colTotal')}
                  </th>
                  <th
                    scope="col"
                    className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {t('logs.colAnswered')}
                  </th>
                  <th
                    scope="col"
                    className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {t('logs.colFailed')}
                  </th>
                  <th
                    scope="col"
                    className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {t('logs.colStatus')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {blasts.map((blast) => {
                  const id = blast.blast_id || String(blast.id);
                  const isExpanded = expandedId === id;
                  const details = callDetails[id] || [];
                  const isLoadingDetails = detailsLoading[id];

                  const totalCalls = blast.total_calls ?? blast.totalCalls ?? blast.total ?? 0;
                  const answeredCalls = blast.answered ?? blast.answeredCalls ?? 0;
                  const failedCalls = blast.failed ?? blast.failedCalls ?? 0;
                  const dateDisplay = formatDate(blast.started_at || blast.created_at || blast.createdAt || blast.date);
                  const triggerDisplay =
                    blast.trigger_source ||
                    blast.triggeredBy ||
                    (blast.trigger_type === 'sip' ? t('logs.sipTriggerFallback') : t('logs.adminTriggerFallback'));
                  const audioName = blast.audio_name || t('logs.defaultAudioFallback');

                  return (
                    <Fragment key={id}>
                      <tr
                        className={`transition-colors cursor-pointer ${
                          isExpanded
                            ? 'bg-brand-50/40 dark:bg-brand-500/10'
                            : 'hover:bg-gray-50 dark:hover:bg-slate-800/40'
                        }`}
                        onClick={() => toggleExpand(id)}
                      >
                        <td className="px-4 py-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(id);
                            }}
                            aria-expanded={isExpanded}
                            aria-label={
                              isExpanded
                                ? t('logs.collapseAria', { date: dateDisplay })
                                : t('logs.expandAria', { date: dateDisplay })
                            }
                            className="p-1.5 rounded-lg hover:bg-gray-200/70 dark:hover:bg-slate-700/70 transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUp aria-hidden="true" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                            ) : (
                              <ChevronDown aria-hidden="true" className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                            )}
                          </button>
                        </td>
                        <td className="px-5 py-4 text-sm font-medium text-gray-900 dark:text-slate-100 whitespace-nowrap">
                          {dateDisplay}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-700 dark:text-slate-300">
                          <span className="font-mono text-xs bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded text-gray-800 dark:text-slate-200">
                            {triggerDisplay}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600 dark:text-slate-300">
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-slate-300">
                            <Volume2 aria-hidden="true" className="w-3.5 h-3.5 text-brand-500 dark:text-brand-400 flex-shrink-0" />
                            <span className="truncate max-w-[150px]">{audioName}</span>
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900 dark:text-slate-100 text-center font-bold">
                          {totalCalls}
                        </td>
                        <td className="px-4 py-4 text-sm text-green-600 dark:text-green-400 text-center font-bold">
                          {answeredCalls}
                        </td>
                        <td className="px-4 py-4 text-sm text-red-600 dark:text-red-400 text-center font-bold">
                          {failedCalls}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={blast.status} />
                        </td>
                      </tr>

                      {/* Expanded Call Details */}
                      {isExpanded && (
                        <tr>
                          <td
                            colSpan="8"
                            className="px-6 py-4 bg-gray-50/80 dark:bg-slate-950/70 border-y border-gray-100 dark:border-slate-800"
                          >
                            {isLoadingDetails ? (
                              <div className="flex items-center justify-center py-6">
                                <span className="spinner mr-2"></span>
                                <span className="text-sm font-medium text-gray-600 dark:text-slate-300">
                                  {t('logs.loadingDetails')}
                                </span>
                              </div>
                            ) : details.length === 0 ? (
                              <div className="text-center py-4 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800">
                                <AlertCircle aria-hidden="true" className="w-6 h-6 text-gray-400 dark:text-slate-500 mx-auto mb-1" />
                                <p className="text-sm text-gray-600 dark:text-slate-400 font-medium">
                                  {t('logs.noDetails')}
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {/* Details Header Bar */}
                                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400">
                                    {t('logs.detailsHeading', { count: details.length })}
                                  </h2>
                                  <div className="flex gap-2">
                                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 font-medium border border-green-200 dark:border-green-500/30">
                                      <CheckCircle2 aria-hidden="true" className="w-3 h-3" />{' '}
                                      {t('logs.successCount', {
                                        count: details.filter((c) => c.status === 'answered' || c.status === 'completed').length,
                                      })}
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 font-medium border border-red-200 dark:border-red-500/30">
                                      <XCircle aria-hidden="true" className="w-3 h-3" />{' '}
                                      {t('logs.failedCount', {
                                        count: details.filter(
                                          (c) =>
                                            c.status === 'failed' ||
                                            c.status === 'no_answer' ||
                                            c.status === 'busy' ||
                                            c.status === 'incomplete'
                                        ).length,
                                      })}
                                    </span>
                                  </div>
                                </div>

                                {/* Details Table */}
                                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                                  <table className="w-full">
                                    <thead>
                                      <tr className="bg-gray-100/70 dark:bg-slate-800/70 border-b border-gray-200 dark:border-slate-800 text-gray-600 dark:text-slate-300">
                                        <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold">
                                          {t('logs.detailColContact')}
                                        </th>
                                        <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold">
                                          {t('logs.detailColNumber')}
                                        </th>
                                        <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold">
                                          {t('logs.detailColStatus')}
                                        </th>
                                        <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold">
                                          {t('logs.detailColDuration')}
                                        </th>
                                        <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold">
                                          {t('logs.detailColTime')}
                                        </th>
                                        <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold">
                                          {t('logs.detailColCause')}
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                      {details.map((call, idx) => {
                                        const isSuccess =
                                          call.status === 'answered' ||
                                          (call.status === 'completed' && Number(call.duration) > 0);
                                        const durationSec = call.duration ? Math.round(Number(call.duration)) : 0;

                                        return (
                                          <tr
                                            key={call.id || idx}
                                            className={`hover:bg-gray-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                                              isSuccess
                                                ? 'bg-green-50/20 dark:bg-green-500/5'
                                                : 'bg-red-50/10 dark:bg-red-500/5'
                                            }`}
                                          >
                                            {/* Contact Name */}
                                            <td className="px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-slate-100">
                                              <span className="inline-flex items-center gap-2">
                                                <span
                                                  aria-hidden="true"
                                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                                    isSuccess
                                                      ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300'
                                                      : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300'
                                                  }`}
                                                >
                                                  {(call.name || call.number || '?')[0].toUpperCase()}
                                                </span>
                                                <span>{call.name || t('common.unnamed')}</span>
                                              </span>
                                            </td>

                                            {/* Phone Number */}
                                            <td className="px-4 py-2.5 text-sm font-mono font-medium text-gray-800 dark:text-slate-200">
                                              <span className="inline-flex items-center gap-1.5">
                                                <Phone aria-hidden="true" className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                                                {call.number || call.phone}
                                              </span>
                                            </td>

                                            {/* Status Badge */}
                                            <td className="px-4 py-2.5">
                                              <StatusBadge status={isSuccess ? 'answered' : (call.status || 'failed')} />
                                            </td>

                                            {/* Duration */}
                                            <td className="px-4 py-2.5 text-sm font-mono text-gray-700 dark:text-slate-300">
                                              {isSuccess ? (
                                                <span className="text-green-700 dark:text-green-400 font-semibold">
                                                  {durationSec} {t('common.secondsShort')}
                                                </span>
                                              ) : (
                                                <span className="text-gray-400 dark:text-slate-500">-</span>
                                              )}
                                            </td>

                                            {/* Dial Time */}
                                            <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                                              <span className="inline-flex items-center gap-1">
                                                <Clock aria-hidden="true" className="w-3 h-3 text-gray-400 dark:text-slate-500" />
                                                {formatTime(call.dial_time || call.created_at)}
                                              </span>
                                            </td>

                                            {/* Cause / Explanation */}
                                            <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-slate-300">
                                              <span
                                                className={`inline-flex items-center gap-1.5 ${
                                                  isSuccess
                                                    ? 'text-green-700 dark:text-green-400 font-medium'
                                                    : 'text-red-600 dark:text-red-400'
                                                }`}
                                              >
                                                {isSuccess ? (
                                                  <CheckCircle2
                                                    aria-hidden="true"
                                                    className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0"
                                                  />
                                                ) : (
                                                  <XCircle
                                                    aria-hidden="true"
                                                    className="w-3.5 h-3.5 text-red-500 dark:text-red-400 flex-shrink-0"
                                                  />
                                                )}
                                                <span>
                                                  {translateHangupCause(
                                                    call.hangup_cause,
                                                    isSuccess ? 'answered' : call.status
                                                  )}
                                                </span>
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {t('common.pageOf', { page, total: totalPages })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40"
              >
                <ChevronLeft aria-hidden="true" className="w-4 h-4" /> {t('common.previous')}
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40"
              >
                {t('common.next')} <ChevronRight aria-hidden="true" className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
