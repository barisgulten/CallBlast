import { useEffect, useId } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  loading = false,
}) {
  const { t } = useLanguage();
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
        aria-hidden="true"
      />

      <div className="relative bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm animate-slide-up">
        <div className="p-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/15 flex items-center justify-center mb-4">
            <AlertTriangle aria-hidden="true" className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-2">
            {title}
          </h2>
          <p id={descId} className="text-gray-500 dark:text-slate-400 text-sm">
            {message}
          </p>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="btn-secondary flex-1 justify-center"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="btn-danger flex-1 justify-center"
          >
            {loading ? <span className="spinner"></span> : (confirmText || t('common.confirm'))}
          </button>
        </div>
      </div>
    </div>
  );
}
