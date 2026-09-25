import React, { useState } from 'react';
import { X, Trash2, FolderPen, FolderPlus, Loader2 } from 'lucide-react';
import { Tag } from '@/app/types/task';
import { THEME_ACCENT_COLORS } from '@/app/lib/theme';
import ColorSwatchPicker from '@/app/components/common/ColorSwatchPicker';
import Modal from '@/app/components/common/Modal';

interface EditTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  allTags: Tag[];
  onDeleteTag?: (tag: Tag) => void | Promise<boolean>;
  onEditTag?: (tag: Tag) => void | Promise<boolean>;
  onCreateTag?: () => void;
}

const EditTagModal: React.FC<EditTagModalProps> = ({
  isOpen,
  onClose,
  allTags,
  onDeleteTag,
  onEditTag,
  onCreateTag
}) => {
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedColor, setEditedColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!isOpen) return null;

  const handleDeleteClick = (t: Tag, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingTag(t);
  };

  const handleEditClick = (t: Tag, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTag(t);
    setEditedName(t.name);
    setEditedColor(t.color);
  };

  const handleSaveEdit = async () => {
    if (!editingTag || !onEditTag || !editedName.trim()) return;
    setSaving(true);
    try {
      const result = await onEditTag({ ...editingTag, name: editedName.trim(), color: editedColor });
      if (result === false) return;
      setEditingTag(null);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingTag || !onDeleteTag) return;
    setDeleting(true);
    try {
      const result = await onDeleteTag(deletingTag);
      if (result === false) return;
      setDeletingTag(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {/* Main modal */}
      <Modal onClose={onClose} layer="elevated" panelClassName="modal-panel max-w-sm w-full">
        <div
          className="px-5 py-4 border-b border-border-subtle flex justify-between items-center"
          style={{ backgroundColor: 'var(--tm-surface)' }}
        >
          <h3 className="text-lg font-semibold text-text-primary">Manage Tags</h3>
          <div className="flex items-center gap-2">
            {onCreateTag && (
              <button
                onClick={onCreateTag}
                className="px-3 py-1.5 rounded-md font-medium text-sm flex items-center gap-1.5 btn-primary"
              >
                <FolderPlus className="w-4 h-4" />
                Create Tag
              </button>
            )}
            <button onClick={onClose} className="btn btn-ghost" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-3 gap-3">
            {allTags.map((t) => (
              <div key={t.id} className="relative group">
                <div
                  style={{ backgroundColor: t.color }}
                  className="px-4 py-3 rounded-lg text-white font-medium text-sm text-center transition-all"
                >
                  {t.name}
                </div>
                {/* Edit — top-left */}
                <button
                  type="button"
                  onClick={(e) => handleEditClick(t, e)}
                  className="absolute -top-2 -left-2 p-1.5 rounded-full text-[var(--tm-accent-text)] opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                  style={{ backgroundColor: 'var(--tm-accent)', boxShadow: 'var(--tm-shadow-md)' }}
                  title="Edit tag"
                  aria-label={`Edit ${t.name}`}
                >
                  <FolderPen className="w-3 h-3" />
                </button>
                {/* Delete — top-right */}
                <button
                  type="button"
                  onClick={(e) => handleDeleteClick(t, e)}
                  className="absolute -top-2 -right-2 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                  style={{ backgroundColor: 'var(--tm-danger)', boxShadow: 'var(--tm-shadow-md)' }}
                  title="Delete tag"
                  aria-label={`Delete ${t.name}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      {deletingTag && (
        <Modal onClose={() => setDeletingTag(null)} layer="top" panelClassName="modal-panel max-w-sm w-full p-6 space-y-4">
          <p className="text-center text-text-primary">
            Are you sure you want to delete the tag{' '}
            <span
              className="chip rounded-full text-white font-medium"
              style={{ backgroundColor: deletingTag.color }}
            >
              {deletingTag.name}
            </span>
            ?
          </p>
          <p className="text-center text-sm text-text-muted">This action cannot be undone.</p>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setDeletingTag(null)}
              disabled={deleting}
              className="btn btn-secondary flex-1 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="btn flex-1 py-2 text-white flex items-center justify-center gap-1.5"
              style={{ backgroundColor: 'var(--tm-danger)' }}
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit tag sub-modal */}
      {editingTag && (
        <Modal onClose={() => setEditingTag(null)} layer="top">
          <div
            className="px-5 py-4 border-b border-border-subtle flex justify-between items-center"
            style={{ backgroundColor: 'var(--tm-surface)' }}
          >
            <h3 className="text-lg font-semibold text-text-primary">Edit Tag</h3>
            <button onClick={() => setEditingTag(null)} className="btn btn-ghost" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Tag Name</label>
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="input-field"
                placeholder="Enter tag name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Tag Color</label>
              <ColorSwatchPicker
                colors={THEME_ACCENT_COLORS}
                value={editedColor}
                onChange={setEditedColor}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setEditingTag(null)}
                disabled={saving}
                className="btn btn-secondary flex-1 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={!editedName.trim() || saving}
                className="btn btn-primary flex-1 py-2 flex items-center justify-center gap-1.5"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default EditTagModal;
