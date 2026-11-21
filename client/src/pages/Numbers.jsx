import { useState, useEffect, useRef, useId } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Upload,
  Phone,
  Users,
  FolderPlus,
  Download,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { get, post, put, del } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import StatusBadge from '../components/StatusBadge';

export default function Numbers() {
  const { t, formatGroupName, translateApiError } = useLanguage();
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [groups, setGroups] = useState([]);

  // Modal states for Number Add/Edit
  const [formOpen, setFormOpen] = useState(false);
  const [editingNumber, setEditingNumber] = useState(null);
  const [formData, setFormData] = useState({ name: '', number: '', group_name: 'Genel' });
  const [formLoading, setFormLoading] = useState(false);

  // Delete states
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Group Management Modal states
  const [groupsModalOpen, setGroupsModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupDeleteTarget, setGroupDeleteTarget] = useState(null);

  // CSV Import states
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef(null);

  const searchInputId = useId();
  const groupFilterId = useId();
  const contactFormId = useId();
  const contactNameId = useId();
  const contactPhoneId = useId();
  const contactPhoneHintId = useId();
  const contactGroupId = useId();
  const newGroupNameId = useId();
  const newGroupDescId = useId();
  const csvTextareaId = useId();

  useEffect(() => {
    loadNumbers();
    loadGroups();
  }, []);

  async function loadNumbers() {
    setLoading(true);
    try {
      const data = await get('/numbers');
      const list = Array.isArray(data) ? data : data?.numbers || [];
      setNumbers(list);
    } catch {
      toast.error(t('numbers.loadError'));
    } finally {
      setLoading(false);
    }
  }

  async function loadGroups() {
    try {
      const data = await get('/groups');
      const list = Array.isArray(data) ? data : [];
      setGroups(list);
    } catch {
      setGroups([{ name: 'Genel' }]);
    }
  }

  function openAddModal() {
    setEditingNumber(null);
    setFormData({ name: '', number: '', group_name: groups[0]?.name || 'Genel' });
    setFormOpen(true);
  }

  function openEditModal(num) {
    setEditingNumber(num);
    setFormData({
      name: num.name || '',
      number: num.number || num.phone || '',
      group_name: num.group_name || num.group || 'Genel',
    });
    setFormOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.number.trim()) {
      toast.error(t('numbers.phoneRequiredError'));
      return;
    }
    setFormLoading(true);
    try {
      const payload = {
        name: formData.name.trim() || formData.number.trim(),
        number: formData.number.trim(),
        group_name: formData.group_name || 'Genel',
      };

      if (editingNumber) {
        await put(`/numbers/${editingNumber.id}`, payload);
        toast.success(t('numbers.updatedSuccess'));
      } else {
        await post('/numbers', payload);
        toast.success(t('numbers.addedSuccess'));
      }
      setFormOpen(false);
      loadNumbers();
    } catch (err) {
      toast.error(translateApiError(err, 'numbers.actionError'));
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await del(`/numbers/${deleteTarget.id}`);
      toast.success(t('numbers.deletedSuccess'));
      setDeleteTarget(null);
      loadNumbers();
    } catch (err) {
      toast.error(translateApiError(err, 'numbers.deleteError'));
    } finally {
      setDeleteLoading(false);
    }
  }

  async function toggleStatus(num) {
    try {
      const newActive = num.active ? 0 : 1;
      await put(`/numbers/${num.id}`, { active: newActive });
      toast.success(newActive ? t('numbers.activatedToast') : t('numbers.deactivatedToast'));
      loadNumbers();
    } catch (err) {
      toast.error(translateApiError(err, 'numbers.statusError'));
    }
  }

  // ─── Group Management Handlers ─────────────────────────────────────────────
  async function handleAddGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) {
      toast.error(t('numbers.groupNameRequiredError'));
      return;
    }
    setGroupLoading(true);
    try {
      const addedName = newGroupName.trim();
      await post('/groups', {
        name: addedName,
        description: newGroupDesc.trim() || null,
      });
      toast.success(t('numbers.groupAddedSuccess', { name: addedName }));
      setNewGroupName('');
      setNewGroupDesc('');
      loadGroups();
    } catch (err) {
      toast.error(translateApiError(err, 'numbers.groupAddError'));
    } finally {
      setGroupLoading(false);
    }
  }

  async function handleDeleteGroup() {
    if (!groupDeleteTarget) return;
    setGroupLoading(true);
    try {
      const deletedName = groupDeleteTarget.name;
      await del(`/groups/${groupDeleteTarget.id}`);
      toast.success(t('numbers.groupDeletedSuccess', { name: deletedName }));
      setGroupDeleteTarget(null);
      loadGroups();
      loadNumbers();
    } catch (err) {
      toast.error(translateApiError(err, 'numbers.groupDeleteError'));
    } finally {
      setGroupLoading(false);
    }
  }

  // ─── CSV Import Handlers ───────────────────────────────────────────────────
  function parseCSV(text) {
    if (!text || !text.trim()) {
      setParsedRows([]);
      return;
    }
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const parsed = [];

    for (const line of lines) {
      let parts = [];
      if (line.includes(';')) {
        parts = line.split(';');
      } else if (line.includes('\t')) {
        parts = line.split('\t');
      } else {
        parts = line.split(',');
      }

      parts = parts.map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length < 2) continue;

      const p0Lower = parts[0].toLowerCase();
      const p1Lower = parts[1].toLowerCase();
      if (
        (p0Lower === 'ad' || p0Lower === 'name' || p0Lower === 'isim') &&
        (p1Lower.includes('num') || p1Lower.includes('tel') || p1Lower.includes('phone'))
      ) {
        continue;
      }

      const name = parts[0];
      const number = parts[1];
      const group_name = parts[2] || 'Genel';

      if (number && /^[0-9+\-\s()]+$/.test(number)) {
        parsed.push({
          name: name || number,
          number: number.replace(/[\s()-]/g, ''),
          group_name: group_name || 'Genel',
        });
      }
    }

    setParsedRows(parsed);
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setImportText(content);
        parseCSV(content);
      }
    };
    reader.readAsText(file);
  }

  function downloadSampleCSV() {
    const sampleContent = t('numbers.sampleCsvContent');
    const blob = new Blob([sampleContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', t('numbers.sampleCsvFilename'));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleImportSubmit() {
    if (parsedRows.length === 0) {
      toast.error(t('numbers.csvEmptyError'));
      return;
    }
    setImportLoading(true);
    try {
      const res = await post('/numbers/import', parsedRows);
      toast.success(t('numbers.csvImportSuccess', { count: res.imported || parsedRows.length }));
      setImportOpen(false);
      setImportText('');
      setParsedRows([]);
      loadNumbers();
      loadGroups();
    } catch (err) {
      toast.error(translateApiError(err, 'numbers.csvImportError'));
    } finally {
      setImportLoading(false);
    }
  }

  // ─── Filtered Numbers ──────────────────────────────────────────────────────
  const filteredNumbers = numbers.filter((num) => {
    const matchesSearch =
      !search ||
      (num.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (num.number || num.phone || '').includes(search);
    const grp = num.group_name || num.group || 'Genel';
    const matchesGroup = !filterGroup || grp === filterGroup;
    return matchesSearch && matchesGroup;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{t('numbers.title')}</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            {t('numbers.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setGroupsModalOpen(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <Users aria-hidden="true" className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            {t('numbers.manageGroups')}
          </button>
          <button
            type="button"
            onClick={() => {
              setImportOpen(true);
              setImportText('');
              setParsedRows([]);
            }}
            className="btn-secondary flex items-center gap-2"
          >
            <Upload aria-hidden="true" className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            {t('numbers.csvImport')}
          </button>
          <button type="button" onClick={openAddModal} className="btn-primary flex items-center gap-2">
            <Plus aria-hidden="true" className="w-4 h-4" />
            {t('numbers.addContact')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <search className="card-static p-4 block">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <label htmlFor={searchInputId} className="visually-hidden">
              {t('numbers.searchLabel')}
            </label>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500"
            />
            <input
              id={searchInputId}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('numbers.searchPlaceholder')}
              className="input pl-9"
            />
          </div>
          <div className="w-full sm:w-56">
            <label htmlFor={groupFilterId} className="visually-hidden">
              {t('numbers.groupFilterLabel')}
            </label>
            <select
              id={groupFilterId}
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="input w-full"
            >
              <option value="">{t('numbers.allGroupsCount', { count: numbers.length })}</option>
              {groups.map((g) => (
                <option key={g.id || g.name} value={g.name}>
                  {formatGroupName(g.name)} {g.member_count !== undefined ? `(${g.member_count})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </search>

      {/* Table */}
      <div className="card-static overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="skeleton h-5 flex-1" />
                <div className="skeleton h-5 w-32" />
                <div className="skeleton h-5 w-24" />
                <div className="skeleton h-5 w-20" />
              </div>
            ))}
          </div>
        ) : filteredNumbers.length === 0 ? (
          <div className="text-center py-12">
            <Phone aria-hidden="true" className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400 font-medium">
              {search || filterGroup ? t('numbers.emptyFiltered') : t('numbers.emptyDefault')}
            </p>
            {!search && !filterGroup && (
              <div className="mt-4 flex justify-center gap-3">
                <button type="button" onClick={openAddModal} className="btn-primary">
                  <Plus aria-hidden="true" className="w-4 h-4" /> {t('numbers.addFirst')}
                </button>
                <button type="button" onClick={() => setImportOpen(true)} className="btn-secondary">
                  <Upload aria-hidden="true" className="w-4 h-4" /> {t('numbers.uploadWithCsv')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800/70 border-b border-gray-100 dark:border-slate-800">
                  <th
                    scope="col"
                    className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {t('numbers.colName')}
                  </th>
                  <th
                    scope="col"
                    className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {t('numbers.colNumber')}
                  </th>
                  <th
                    scope="col"
                    className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {t('numbers.colGroup')}
                  </th>
                  <th
                    scope="col"
                    className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {t('numbers.colStatus')}
                  </th>
                  <th
                    scope="col"
                    className="text-right px-6 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {t('numbers.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {filteredNumbers.map((num) => {
                  const grpName = num.group_name || num.group || 'Genel';
                  const isActive = num.active !== 0 && num.active !== false && num.status !== 'inactive';
                  const contactLabel = num.name || num.number || num.phone || '';
                  return (
                    <tr key={num.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-slate-100">
                        {num.name || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300 font-mono font-medium">
                        {num.number || num.phone}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 rounded-md text-xs font-medium border border-purple-100 dark:border-purple-500/30">
                          <Users aria-hidden="true" className="w-3 h-3" />
                          {formatGroupName(grpName)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={isActive ? 'active' : 'inactive'} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => toggleStatus(num)}
                            aria-label={
                              isActive
                                ? t('numbers.deactivateAria', { name: contactLabel })
                                : t('numbers.activateAria', { name: contactLabel })
                            }
                            aria-pressed={isActive}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            {isActive ? (
                              <ToggleRight aria-hidden="true" className="w-5 h-5 text-green-600 dark:text-green-400" />
                            ) : (
                              <ToggleLeft aria-hidden="true" className="w-5 h-5 text-gray-400 dark:text-slate-500" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(num)}
                            aria-label={t('numbers.editAria', { name: contactLabel })}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Edit2 aria-hidden="true" className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(num)}
                            aria-label={t('numbers.deleteAria', { name: contactLabel })}
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors"
                          >
                            <Trash2 aria-hidden="true" className="w-4 h-4 text-red-500 dark:text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Add/Edit Number Modal ─────────────────────────────────────────── */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingNumber ? t('numbers.editModalTitle') : t('numbers.addModalTitle')}
        footer={
          <>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="btn-secondary"
              disabled={formLoading}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              form={contactFormId}
              className="btn-primary"
              disabled={formLoading}
            >
              {formLoading ? (
                <span className="spinner"></span>
              ) : editingNumber ? (
                t('common.update')
              ) : (
                t('common.save')
              )}
            </button>
          </>
        }
      >
        <form id={contactFormId} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={contactNameId} className="label">{t('numbers.nameLabel')}</label>
            <input
              id={contactNameId}
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              placeholder={t('numbers.namePlaceholder')}
            />
          </div>
          <div>
            <label htmlFor={contactPhoneId} className="label">{t('numbers.phoneLabel')}</label>
            <input
              id={contactPhoneId}
              type="text"
              aria-describedby={contactPhoneHintId}
              value={formData.number}
              onChange={(e) => setFormData({ ...formData, number: e.target.value })}
              className="input font-mono"
              placeholder={t('numbers.phonePlaceholder')}
              required
            />
            <p id={contactPhoneHintId} className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {t('numbers.phoneHint')}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor={contactGroupId} className="label mb-0">{t('numbers.groupSelectLabel')}</label>
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setGroupsModalOpen(true);
                }}
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
              >
                {t('numbers.newGroupLink')}
              </button>
            </div>
            <select
              id={contactGroupId}
              value={formData.group_name}
              onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
              className="input"
            >
              {groups.map((g) => (
                <option key={g.id || g.name} value={g.name}>
                  {formatGroupName(g.name)}
                </option>
              ))}
              {!groups.some((g) => g.name === 'Genel') && (
                <option value="Genel">{formatGroupName('Genel')}</option>
              )}
            </select>
          </div>
        </form>
      </Modal>

      {/* ─── Group Management Modal ────────────────────────────────────────── */}
      <Modal
        isOpen={groupsModalOpen}
        onClose={() => setGroupsModalOpen(false)}
        title={t('numbers.groupsModalTitle')}
        size="lg"
        footer={
          <button type="button" onClick={() => setGroupsModalOpen(false)} className="btn-secondary">
            {t('common.close')}
          </button>
        }
      >
        <div className="space-y-6">
          {/* Add Group Form */}
          <form
            onSubmit={handleAddGroup}
            className="p-4 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-100 dark:border-slate-700/60 space-y-3"
          >
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-1.5">
              <FolderPlus aria-hidden="true" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              {t('numbers.addGroupHeading')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={newGroupNameId} className="visually-hidden">
                  {t('numbers.groupNamePlaceholder')}
                </label>
                <input
                  id={newGroupNameId}
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder={t('numbers.groupNamePlaceholder')}
                  className="input text-sm"
                  required
                />
              </div>
              <div className="flex gap-2">
                <label htmlFor={newGroupDescId} className="visually-hidden">
                  {t('numbers.groupDescPlaceholder')}
                </label>
                <input
                  id={newGroupDescId}
                  type="text"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder={t('numbers.groupDescPlaceholder')}
                  className="input text-sm flex-1"
                />
                <button
                  type="submit"
                  disabled={groupLoading || !newGroupName.trim()}
                  className="btn-primary text-sm whitespace-nowrap"
                >
                  {groupLoading ? <span className="spinner"></span> : t('common.add')}
                </button>
              </div>
            </div>
          </form>

          {/* Group List */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
              {t('numbers.existingGroups')}
            </h3>
            <div className="divide-y divide-gray-100 dark:divide-slate-800 border border-gray-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
              {groups.length === 0 ? (
                <div className="p-4 text-center text-gray-500 dark:text-slate-400 text-sm">
                  {t('numbers.noGroups')}
                </div>
              ) : (
                groups.map((g) => (
                  <div
                    key={g.id || g.name}
                    className="p-3.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-slate-100 text-sm">
                          {formatGroupName(g.name)}
                        </span>
                        {g.member_count !== undefined && (
                          <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded-full font-medium">
                            {t('numbers.memberCount', { count: g.member_count })}
                          </span>
                        )}
                      </div>
                      {g.description && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{g.description}</p>
                      )}
                    </div>
                    {g.name !== 'Genel' && g.id && (
                      <button
                        type="button"
                        onClick={() => setGroupDeleteTarget(g)}
                        aria-label={t('numbers.deleteGroupAria', { name: g.name })}
                        className="p-1.5 text-gray-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors"
                      >
                        <Trash2 aria-hidden="true" className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
              {t('numbers.groupDeleteNote')}
            </p>
          </div>
        </div>
      </Modal>

      {/* ─── CSV Import Modal ──────────────────────────────────────────────── */}
      <Modal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('numbers.csvModalTitle')}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              className="btn-secondary"
              disabled={importLoading}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleImportSubmit}
              className="btn-primary"
              disabled={importLoading || parsedRows.length === 0}
            >
              {importLoading ? (
                <span className="spinner"></span>
              ) : (
                t('numbers.importBtnCount', { count: parsedRows.length })
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 border border-blue-100 dark:border-blue-800/60 rounded-xl text-xs">
            <div>
              <p className="font-semibold">{t('numbers.csvFormatTitle')}</p>
              <p className="text-blue-700 dark:text-blue-300 mt-0.5">
                {t('numbers.csvFormatDesc')}
              </p>
            </div>
            <button
              type="button"
              onClick={downloadSampleCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded-lg text-blue-700 dark:text-blue-300 font-medium hover:bg-blue-100 dark:hover:bg-slate-700 transition-colors shrink-0 ml-3"
            >
              <Download aria-hidden="true" className="w-3.5 h-3.5" />
              {t('numbers.downloadSample')}
            </button>
          </div>

          {/* Upload Button */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.txt"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <FileText aria-hidden="true" className="w-4 h-4 text-gray-600 dark:text-slate-300" />
              {t('numbers.selectCsvFile')}
            </button>
            <span className="text-xs text-gray-500 dark:text-slate-400">{t('numbers.pasteHint')}</span>
          </div>

          <div>
            <label htmlFor={csvTextareaId} className="visually-hidden">
              {t('numbers.csvTextareaLabel')}
            </label>
            <textarea
              id={csvTextareaId}
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                parseCSV(e.target.value);
              }}
              className="input font-mono text-xs"
              rows={5}
              placeholder={t('numbers.csvPlaceholder')}
            />
          </div>

          {/* Preview */}
          {parsedRows.length > 0 && (
            <div className="border border-green-200 dark:border-green-800/60 bg-green-50/50 dark:bg-green-950/30 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2 text-green-800 dark:text-green-300 text-xs font-semibold">
                <CheckCircle2 aria-hidden="true" className="w-4 h-4 text-green-600 dark:text-green-400" />
                {t('numbers.previewCount', { count: parsedRows.length })}
              </div>
              <div className="max-h-36 overflow-y-auto divide-y divide-green-100 dark:divide-green-900/50 text-xs">
                {parsedRows.slice(0, 10).map((row, idx) => (
                  <div key={idx} className="py-1 flex justify-between text-gray-700 dark:text-slate-200 font-mono">
                    <span>{row.name}</span>
                    <span className="font-semibold">{row.number}</span>
                    <span className="text-purple-700 dark:text-purple-300 font-sans">
                      {formatGroupName(row.group_name)}
                    </span>
                  </div>
                ))}
                {parsedRows.length > 10 && (
                  <p className="text-xs text-gray-500 dark:text-slate-400 pt-1 text-center italic">
                    {t('numbers.moreCount', { count: parsedRows.length - 10 })}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Number Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('numbers.deleteNumberTitle')}
        message={t('numbers.deleteNumberMessage', {
          name: deleteTarget?.name || deleteTarget?.number || '',
        })}
        confirmText={t('common.delete')}
        loading={deleteLoading}
      />

      {/* Delete Group Confirm */}
      <ConfirmDialog
        isOpen={!!groupDeleteTarget}
        onClose={() => setGroupDeleteTarget(null)}
        onConfirm={handleDeleteGroup}
        title={t('numbers.deleteGroupTitle')}
        message={t('numbers.deleteGroupMessage', { name: groupDeleteTarget?.name || '' })}
        confirmText={t('numbers.deleteGroupConfirm')}
        loading={groupLoading}
      />
    </div>
  );
}
