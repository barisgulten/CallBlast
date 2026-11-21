import { useLanguage } from '../context/LanguageContext';

export default function StatusBadge({ status }) {
  const { t } = useLanguage();

  const statusClasses = {
    answered: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
    completed: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
    success: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
    active: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',

    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
    started: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
    incomplete:
      'bg-amber-100 text-amber-900 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
    ringing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
    initiating: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',

    failed: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
    no_answer: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
    error: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
    inactive: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300',

    busy: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
    cancelled: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300',
    stopped: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300',
  };

  const translatedLabel = status && statusClasses[status] ? t(`status.${status}`) : status;
  const className = statusClasses[status] || 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {translatedLabel}
    </span>
  );
}
