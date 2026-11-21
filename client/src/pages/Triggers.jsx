import { useState, useEffect, useId } from 'react';
import { Radio, Plus, Edit2, Trash2, Phone, Volume2, Users, CheckCircle, XCircle, Headphones } from 'lucide-react';
import toast from 'react-hot-toast';
import { get, post, put, del } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Triggers() {
  const { t, formatGroupName, translateApiError } = useLanguage();
  const [triggers, setTriggers] = useState([]);
  const [audioFiles, setAudioFiles] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    number: '',
    audio_file_id: '',
    prompt_audio_id: '',
    group_name: 'all',
    description: '',
    active: true,
  });
  const [submitting, setSubmitting] = useState(false);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const nameInputId = useId();
  const numberInputId = useId();
  const numberHintId = useId();
  const audioSelectId = useId();
  const audioHintId = useId();
  const promptSelectId = useId();
  const promptHintId = useId();
  const groupSelectId = useId();
  const groupHintId = useId();
  const descInputId = useId();
  const activeCheckboxId = useId();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [triggersData, audioData, groupsData] = await Promise.all([
        get('/triggers').catch(() => []),
        get('/audio').catch(() => []),
        get('/numbers/groups').catch(() => []),
      ]);

      setTriggers(Array.isArray(triggersData) ? triggersData : []);
      setAudioFiles(Array.isArray(audioData) ? audioData : audioData?.files || []);
      setGroups(Array.isArray(groupsData) ? groupsData : []);
    } catch {
      toast.error(t('triggers.loadError'));
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingTrigger(null);
    setFormData({
      name: '',
      number: '',
      audio_file_id: audioFiles.length > 0 ? audioFiles[0].id : '',
      prompt_audio_id: '',
      group_name: 'all',
      description: '',
      active: true,
    });
    setModalOpen(true);
  }

  function openEditModal(trigger) {
    setEditingTrigger(trigger);
    setFormData({
      name: trigger.name,
      number: trigger.number,
      audio_file_id: trigger.audio_file_id || '',
      prompt_audio_id: trigger.prompt_audio_id || '',
      group_name: trigger.group_name || 'all',
      description: trigger.description || '',
      active: trigger.active === 1,
    });
    setModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim() || !formData.number.trim()) {
      toast.error(t('triggers.validationError'));
      return;
    }

    setSubmitting(true);
    try {
      if (editingTrigger) {
        await put(`/triggers/${editingTrigger.id}`, formData);
        toast.success(t('triggers.updatedSuccess'));
      } else {
        await post('/triggers', formData);
        toast.success(t('triggers.createdSuccess'));
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(translateApiError(err, 'triggers.actionError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await del(`/triggers/${deleteTarget.id}`);
      toast.success(t('triggers.deletedSuccess'));
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      toast.error(translateApiError(err, 'triggers.deleteError'));
    } finally {
      setDeleteLoading(false);
    }
  }

  async function toggleStatus(trigger) {
    try {
      const nextActive = trigger.active !== 1;
      await put(`/triggers/${trigger.id}`, {
        active: nextActive,
      });
      toast.success(nextActive ? t('triggers.enabledToast') : t('triggers.disabledToast'));
      loadData();
    } catch (err) {
      toast.error(translateApiError(err, 'triggers.statusError'));
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{t('triggers.title')}</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            {t('triggers.subtitle')}
          </p>
        </div>
        <button type="button" onClick={openCreateModal} className="btn-primary flex items-center gap-2">
          <Plus aria-hidden="true" className="w-4 h-4" /> {t('triggers.addButton')}
        </button>
      </div>

      {/* Trigger Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card-static p-6 space-y-4">
              <div className="skeleton h-6 w-3/4" />
              <div className="skeleton h-4 w-1/2" />
              <div className="skeleton h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : triggers.length === 0 ? (
        <div className="card-static p-12 text-center">
          <Radio aria-hidden="true" className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-slate-400 font-medium">{t('triggers.emptyTitle')}</p>
          <p className="text-gray-400 dark:text-slate-500 text-sm mt-1">
            {t('triggers.emptyHint')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {triggers.map((trigger) => {
            const isActive = trigger.active === 1;

            return (
              <div
                key={trigger.id}
                className={`card p-6 border-l-4 transition-all ${
                  isActive
                    ? 'border-l-brand-500'
                    : 'border-l-gray-300 dark:border-l-slate-700 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between mb-4 gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">{trigger.name}</h2>
                    {trigger.description && (
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{trigger.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleStatus(trigger)}
                    aria-label={
                      isActive
                        ? t('triggers.disableAria', { name: trigger.name })
                        : t('triggers.enableAria', { name: trigger.name })
                    }
                    aria-pressed={isActive}
                    className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {isActive ? (
                      <CheckCircle aria-hidden="true" className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle aria-hidden="true" className="w-5 h-5 text-gray-400 dark:text-slate-500" />
                    )}
                  </button>
                </div>

                <div className="space-y-2.5 text-sm mb-6 bg-gray-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-gray-100 dark:border-slate-700/60">
                  <div className="flex items-center gap-2.5 text-gray-700 dark:text-slate-300">
                    <Phone aria-hidden="true" className="w-4 h-4 text-brand-600 dark:text-brand-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500 dark:text-slate-400">{t('triggers.triggerNumber')}</span>
                    <span className="font-mono font-bold text-brand-700 dark:text-brand-300 bg-brand-100/60 dark:bg-brand-500/20 px-2 py-0.5 rounded-md text-xs">
                      {trigger.number}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 text-gray-700 dark:text-slate-300">
                    <Volume2 aria-hidden="true" className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500 dark:text-slate-400">{t('triggers.targetAudio')}</span>
                    <span className="font-medium text-gray-900 dark:text-slate-100 truncate text-xs">
                      {trigger.audio_name || t('triggers.defaultAudioFallback')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 text-gray-700 dark:text-slate-300">
                    <Headphones aria-hidden="true" className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500 dark:text-slate-400">{t('triggers.callerPrompt')}</span>
                    <span className="font-medium text-gray-900 dark:text-slate-100 truncate text-xs">
                      {trigger.prompt_audio_name || t('triggers.defaultPromptFallback')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 text-gray-700 dark:text-slate-300">
                    <Users aria-hidden="true" className="w-4 h-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500 dark:text-slate-400">{t('triggers.targetGroup')}</span>
                    <span className="font-medium text-xs px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                      {trigger.group_name === 'all' ? t('triggers.allDirectory') : formatGroupName(trigger.group_name)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => openEditModal(trigger)}
                    aria-label={t('triggers.editAria', { name: trigger.name })}
                    className="p-2 text-gray-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/15 rounded-lg transition-colors"
                  >
                    <Edit2 aria-hidden="true" className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(trigger)}
                    aria-label={t('triggers.deleteAria', { name: trigger.name })}
                    className="p-2 text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-lg transition-colors"
                  >
                    <Trash2 aria-hidden="true" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTrigger ? t('triggers.editModalTitle') : t('triggers.createModalTitle')}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={nameInputId} className="label">{t('triggers.nameLabel')}</label>
            <input
              id={nameInputId}
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              placeholder={t('triggers.namePlaceholder')}
            />
          </div>

          <div>
            <label htmlFor={numberInputId} className="label">{t('triggers.numberLabel')}</label>
            <input
              id={numberInputId}
              type="text"
              required
              aria-describedby={numberHintId}
              value={formData.number}
              onChange={(e) => setFormData({ ...formData, number: e.target.value })}
              className="input font-mono"
              placeholder={t('triggers.numberPlaceholder')}
            />
            <p id={numberHintId} className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {t('triggers.numberHint')}
            </p>
          </div>

          <div>
            <label htmlFor={audioSelectId} className="label">{t('triggers.audioLabel')}</label>
            <select
              id={audioSelectId}
              aria-describedby={audioHintId}
              value={formData.audio_file_id}
              onChange={(e) => setFormData({ ...formData, audio_file_id: e.target.value })}
              className="input"
            >
              <option value="">{t('triggers.audioDefaultOption')}</option>
              {audioFiles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.original_name} {a.is_default ? t('triggers.defaultTag') : ''}
                </option>
              ))}
            </select>
            <p id={audioHintId} className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {t('triggers.audioHint')}
            </p>
          </div>

          <div>
            <label htmlFor={promptSelectId} className="label">{t('triggers.promptLabel')}</label>
            <select
              id={promptSelectId}
              aria-describedby={promptHintId}
              value={formData.prompt_audio_id}
              onChange={(e) => setFormData({ ...formData, prompt_audio_id: e.target.value })}
              className="input"
            >
              <option value="">{t('triggers.promptDefaultOption')}</option>
              {audioFiles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.original_name}
                </option>
              ))}
            </select>
            <p id={promptHintId} className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {t('triggers.promptHint')}
            </p>
          </div>

          <div>
            <label htmlFor={groupSelectId} className="label">{t('triggers.groupLabel')}</label>
            <select
              id={groupSelectId}
              aria-describedby={groupHintId}
              value={formData.group_name}
              onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
              className="input"
            >
              <option value="all">{t('triggers.groupAllOption')}</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {t('triggers.groupPrefix', { name: formatGroupName(g) })}
                </option>
              ))}
            </select>
            <p id={groupHintId} className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {t('triggers.groupHint')}
            </p>
          </div>

          <div>
            <label htmlFor={descInputId} className="label">{t('triggers.descriptionLabel')}</label>
            <textarea
              id={descInputId}
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input"
              placeholder={t('triggers.descriptionPlaceholder')}
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id={activeCheckboxId}
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4"
            />
            <label htmlFor={activeCheckboxId} className="text-sm font-medium text-gray-700 dark:text-slate-300">
              {t('triggers.activeLabel')}
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="btn-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? t('common.saving') : editingTrigger ? t('common.update') : t('common.create')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('triggers.deleteTitle')}
        message={t('triggers.deleteMessage', {
          name: deleteTarget?.name || '',
          number: deleteTarget?.number || '',
        })}
        confirmText={t('common.delete')}
        loading={deleteLoading}
      />
    </div>
  );
}
