import { useState, useEffect, useRef, useId } from 'react';
import { Upload, Play, Pause, Star, Trash2, Volume2, FileAudio, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { get, del, put, upload, getBlob } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import ConfirmDialog from '../components/ConfirmDialog';

export default function AudioFiles() {
  const { t, formatDateOnly, translateApiError } = useLanguage();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [loadingAudioId, setLoadingAudioId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Upload states
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);
  const playAbortRef = useRef(null);
  const uploadNameId = useId();

  useEffect(() => {
    loadFiles();
    return () => stopCurrentAudio();
  }, []);

  async function loadFiles() {
    setLoading(true);
    try {
      const data = await get('/audio');
      setFiles(Array.isArray(data) ? data : data?.files || []);
    } catch {
      toast.error(t('audio.loadError'));
    } finally {
      setLoading(false);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  }

  function validateAndSetFile(file) {
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.wav') && !ext.endsWith('.mp3')) {
      toast.error(t('audio.invalidTypeError'));
      return;
    }
    setUploadFile(file);
    if (!uploadName) {
      setUploadName(file.name.replace(/\.(wav|mp3)$/i, ''));
    }
  }

  async function handleUpload() {
    if (!uploadFile) {
      toast.error(t('audio.selectFileError'));
      return;
    }
    if (!uploadName.trim()) {
      toast.error(t('audio.enterNameError'));
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('audio', uploadFile);
      formData.append('name', uploadName.trim());

      await upload('/audio', formData);
      toast.success(t('audio.uploadSuccess'));
      setUploadFile(null);
      setUploadName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadFiles();
    } catch (err) {
      toast.error(translateApiError(err, 'audio.uploadError'));
    } finally {
      setUploading(false);
    }
  }

  function stopCurrentAudio() {
    if (playAbortRef.current) {
      playAbortRef.current.abort();
      playAbortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setPlayingId(null);
    setLoadingAudioId(null);
  }

  async function togglePlay(fileId) {
    if (playingId === fileId || loadingAudioId === fileId) {
      stopCurrentAudio();
      return;
    }

    stopCurrentAudio();

    const controller = new AbortController();
    playAbortRef.current = controller;
    setLoadingAudioId(fileId);

    let errorShown = false;
    try {
      const blob = await getBlob(`/audio/${fileId}/download`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!blob || blob.size === 0) {
        throw new Error(t('audio.emptyAudioError'));
      }

      const objectUrl = URL.createObjectURL(blob);
      audioUrlRef.current = objectUrl;

      const audio = new Audio(objectUrl);
      audioRef.current = audio;

      audio.onended = () => stopCurrentAudio();
      audio.onerror = () => {
        stopCurrentAudio();
        if (!errorShown) {
          errorShown = true;
          toast.error(t('audio.playbackError'));
        }
      };

      await audio.play();
      if (controller.signal.aborted) return;
      if (playAbortRef.current === controller) {
        playAbortRef.current = null;
      }
      setLoadingAudioId(null);
      setPlayingId(fileId);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      stopCurrentAudio();
      if (!errorShown) {
        errorShown = true;
        toast.error(translateApiError(err, 'audio.playbackError'));
      }
    }
  }

  async function setDefault(fileId) {
    try {
      await put(`/audio/${fileId}/default`, {});
      toast.success(t('audio.defaultSuccess'));
      loadFiles();
    } catch (err) {
      toast.error(translateApiError(err, 'audio.actionError'));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id || deleteTarget._id;
    setDeleteLoading(true);
    try {
      await del(`/audio/${targetId}`);
      toast.success(t('audio.deleteSuccess'));
      if (playingId === targetId || loadingAudioId === targetId) {
        stopCurrentAudio();
      }
      setDeleteTarget(null);
      loadFiles();
    } catch (err) {
      toast.error(translateApiError(err, 'audio.deleteError'));
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{t('audio.title')}</h1>
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">{t('audio.subtitle')}</p>
      </div>

      {/* Upload Section */}
      <div className="card-static p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Upload aria-hidden="true" className="w-5 h-5 text-brand-500" />
          {t('audio.uploadHeading')}
        </h2>

        <button
          type="button"
          aria-label={t('audio.dropzoneAria')}
          className={`w-full block border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
            dragOver
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
              : 'border-gray-300 dark:border-slate-700 hover:border-brand-400 dark:hover:border-brand-500/60 hover:bg-gray-50 dark:hover:bg-slate-800/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileAudio
            aria-hidden="true"
            className={`w-10 h-10 mx-auto mb-3 ${
              dragOver ? 'text-brand-500' : 'text-gray-400 dark:text-slate-500'
            }`}
          />
          {uploadFile ? (
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{uploadFile.name}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 dark:text-slate-300">
                {t('audio.dropzonePrompt')}{' '}
                <span className="text-brand-600 dark:text-brand-400 font-medium">
                  {t('audio.dropzoneClick')}
                </span>
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{t('audio.dropzoneHint')}</p>
            </div>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,.mp3"
          onChange={handleFileSelect}
          className="hidden"
          tabIndex={-1}
        />

        {uploadFile && (
          <div className="mt-4 flex flex-col sm:flex-row gap-3 animate-fade-in">
            <div className="flex-1">
              <label htmlFor={uploadNameId} className="label">{t('audio.fileNameLabel')}</label>
              <input
                id={uploadNameId}
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                className="input"
                placeholder={t('audio.fileNamePlaceholder')}
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setUploadFile(null);
                  setUploadName('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="btn-secondary"
              >
                {t('common.cancel')}
              </button>
              <button type="button" onClick={handleUpload} className="btn-primary" disabled={uploading}>
                {uploading ? (
                  <>
                    <span className="spinner"></span>
                    {t('audio.uploadingBtn')}
                  </>
                ) : (
                  <>
                    <Upload aria-hidden="true" className="w-4 h-4" /> {t('audio.uploadBtn')}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Files Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card-static p-5">
              <div className="skeleton h-5 w-3/4 mb-3" />
              <div className="skeleton h-4 w-1/2 mb-2" />
              <div className="skeleton h-4 w-1/3 mb-4" />
              <div className="skeleton h-9 w-full" />
            </div>
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="card-static p-12 text-center">
          <Volume2 aria-hidden="true" className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-slate-400 font-medium">{t('audio.emptyTitle')}</p>
          <p className="text-gray-400 dark:text-slate-500 text-sm mt-1">{t('audio.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map((file) => {
            const id = file.id || file._id;
            const isPlaying = playingId === id;
            const isLoadingAudio = loadingAudioId === id;
            const isDefault = Boolean(file.isDefault || file.is_default);
            const rawDate = file.created_at || file.createdAt || file.uploadDate;
            const formattedDate = formatDateOnly(rawDate);
            const displayName = file.name || file.original_name || file.originalName || file.filename;

            return (
              <div key={id} className="card p-5 animate-slide-up">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">
                        {displayName}
                      </h3>
                      {isDefault && (
                        <Star aria-hidden="true" className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-slate-400 truncate mt-0.5">
                      {file.original_name || file.originalName || file.filename}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400 mb-4">
                  <Clock aria-hidden="true" className="w-3.5 h-3.5" />
                  <span>{formattedDate}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => togglePlay(id)}
                    aria-label={
                      isPlaying
                        ? t('audio.stopAria', { name: displayName })
                        : t('audio.playAria', { name: displayName })
                    }
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                      isPlaying
                        ? 'bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300'
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {isLoadingAudio ? (
                      <>
                        <span className="spinner"></span>
                        {t('audio.loadingAudio')}
                      </>
                    ) : isPlaying ? (
                      <>
                        <Pause aria-hidden="true" className="w-4 h-4" />
                        {t('audio.stop')}
                      </>
                    ) : (
                      <>
                        <Play aria-hidden="true" className="w-4 h-4" />
                        {t('audio.play')}
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setDefault(id)}
                    aria-label={t('audio.setDefaultAria', { name: displayName })}
                    aria-pressed={isDefault}
                    className={`p-2 rounded-lg transition-colors ${
                      isDefault
                        ? 'bg-yellow-50 dark:bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                        : 'hover:bg-yellow-50 dark:hover:bg-yellow-500/15 text-gray-400 dark:text-slate-400 hover:text-yellow-600 dark:hover:text-yellow-400'
                    }`}
                  >
                    <Star aria-hidden="true" className={`w-4 h-4 ${isDefault ? 'fill-yellow-500' : ''}`} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteTarget(file)}
                    aria-label={t('audio.deleteAria', { name: displayName })}
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/15 text-gray-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    <Trash2 aria-hidden="true" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('audio.deleteTitle')}
        message={t('audio.deleteMessage', {
          name: deleteTarget?.name || deleteTarget?.original_name || deleteTarget?.originalName || '',
        })}
        confirmText={t('common.delete')}
        loading={deleteLoading}
      />
    </div>
  );
}
