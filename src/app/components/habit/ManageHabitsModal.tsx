import React, { useState } from 'react';
import { X, Flame, Star, Grid2x2Plus, Pencil, Trash2, Save, CalendarDays, Loader2, Archive } from 'lucide-react';
import { Habit } from '@/app/types/habit';
import { Tag } from '@/app/types/task';
import Modal from '@/app/components/common/Modal';
import TagMultiSelect from '@/app/components/common/TagMultiSelect';

interface ManageHabitsModalProps {
  isOpen: boolean;
  onClose: () => void;
  habits: Habit[];
  availableTags?: Tag[];
  onCreateHabit?: () => void;
  onDeleteHabit?: (habit: Habit) => Promise<boolean>;
  onArchiveHabit?: (habit: Habit) => Promise<boolean>;
  onUpdateHabit?: (id: number, title: string, tags: Tag[], estimatedTime?: number | null) => Promise<void>;
  onViewHistory?: (id: number) => void;
}

const ManageHabitsModal: React.FC<ManageHabitsModalProps> = ({
  isOpen,
  onClose,
  habits,
  availableTags = [],
  onCreateHabit,
  onDeleteHabit,
  onArchiveHabit,
  onUpdateHabit,
  onViewHistory,
}) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState<Tag[]>([]);
  const [editEstimatedTime, setEditEstimatedTime] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingHabit, setDeletingHabit] = useState<Habit | null>(null);

  if (!isOpen) return null;

  const startEdit = (habit: Habit) => {
    setEditingId(habit.id);
    setEditTitle(habit.title);
    setEditTags(habit.tags.map(t => ({ id: t.id, name: t.name, color: t.color ?? '#6B7280' })));
    setEditEstimatedTime(habit.estimated_time ?? null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditTags([]);
    setEditEstimatedTime(null);
  };

  const toggleEditTag = (tag: Tag) => {
    setEditTags(prev =>
      prev.some(t => t.id === tag.id) ? prev.filter(t => t.id !== tag.id) : [...prev, tag],
    );
  };

  const handleSave = async (id: number) => {
    if (!editTitle.trim() || !onUpdateHabit) return;
    setSaving(true);
    try {
      await onUpdateHabit(id, editTitle.trim(), editTags, editEstimatedTime);
      cancelEdit();
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingHabit || !onDeleteHabit) return;
    setDeletingId(deletingHabit.id);
    try {
      await onDeleteHabit(deletingHabit);
    } finally {
      setDeletingId(null);
      setDeletingHabit(null);
    }
  };

  return (
    <Modal onClose={onClose} layer="raised" panelClassName="modal-panel max-w-md w-full">
      <div
        className="px-5 py-4 border-b border-border-subtle flex justify-between items-center"
        style={{ backgroundColor: 'var(--tm-surface)' }}
      >
        <h3 className="text-lg font-semibold text-text-primary">Manage Habits</h3>
        <div className="flex items-center gap-2">
          {onCreateHabit && (
            <button
              onClick={onCreateHabit}
              className="px-3 py-1.5 rounded-md font-medium text-sm flex items-center gap-2 btn-primary"
            >
              <Grid2x2Plus className="w-4 h-4" />
              Create Habit
            </button>
          )}
          <button onClick={onClose} className="btn btn-ghost" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-5">
        {habits.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">
            No habits yet. Create one to get started! Archived habits live on the Archive page.
          </p>
        ) : (
          <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto scrollbar-custom pr-1">
            {habits.map(habit => (
              <div
                key={habit.id}
                className="rounded-lg p-4 border border-border"
                style={{ backgroundColor: 'var(--tm-surface-raised)' }}
              >
                {editingId === habit.id ? (
                  /* ── Inline edit form ── */
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="input-field w-full text-sm"
                      autoFocus
                    />
                    <div>
                      <label className="block text-xs font-medium text-text-muted mb-1">Estimated Time (hours, optional)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={editEstimatedTime ?? ''}
                        onChange={e => setEditEstimatedTime(e.target.value === '' ? null : Number(e.target.value))}
                        placeholder="e.g. 0.5"
                        className="input-field w-full text-sm"
                      />
                    </div>
                    {availableTags.length > 0 && (
                      <TagMultiSelect
                        tags={availableTags}
                        isSelected={tag => editTags.some(t => t.id === tag.id)}
                        onToggle={toggleEditTag}
                        gridClassName="grid grid-cols-2 gap-1.5 p-2 rounded-md border border-border max-h-28 overflow-y-auto scrollbar-custom"
                        gridStyle={{ backgroundColor: 'var(--tm-surface)' }}
                        buttonClassName="px-2 py-1 rounded-full text-xs font-medium transition-colors"
                        unselectedBg="var(--tm-surface-raised)"
                      />
                    )}
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="btn btn-secondary px-3 py-1 text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSave(habit.id)}
                        disabled={saving || !editTitle.trim()}
                        className="btn btn-primary px-3 py-1 text-xs flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" />
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Read-only view ── */
                  <>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className="font-medium text-text-primary text-sm leading-snug">{habit.title}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {habit.estimated_time != null && (
                          <span className="text-xs font-semibold text-text-muted" title="Estimated time">
                            {Number.isInteger(habit.estimated_time) ? habit.estimated_time : habit.estimated_time.toFixed(1)}h
                          </span>
                        )}
                        <div className="flex items-center gap-1" title="Current streak">
                          <Flame className="w-4 h-4" style={{ color: '#F97316' }} />
                          <span className="text-sm font-semibold" style={{ color: '#F97316' }}>
                            {habit.current_streak}
                          </span>
                        </div>
                        <div className="flex items-center gap-1" title="Best streak">
                          <Star className="w-4 h-4" style={{ color: '#EAB308' }} />
                          <span className="text-sm font-semibold" style={{ color: '#EAB308' }}>
                            {habit.max_streak}
                          </span>
                        </div>
                        {onViewHistory && (
                          <button
                            onClick={() => onViewHistory(habit.id)}
                            className="btn btn-ghost p-1"
                            title="View history"
                            aria-label="View history"
                          >
                            <CalendarDays className="w-3.5 h-3.5 text-text-muted hover:text-text-primary" />
                          </button>
                        )}
                        {onUpdateHabit && (
                          <button
                            onClick={() => startEdit(habit)}
                            className="btn btn-ghost p-1"
                            title="Edit habit"
                            aria-label="Edit habit"
                          >
                            <Pencil className="w-3.5 h-3.5 text-text-muted hover:text-text-primary" />
                          </button>
                        )}
                        {onArchiveHabit && (
                          <button
                            onClick={() => onArchiveHabit(habit)}
                            className="btn btn-ghost p-1"
                            title="Archive habit"
                            aria-label={`Archive ${habit.title}`}
                          >
                            <Archive className="w-3.5 h-3.5 text-text-muted hover:text-text-primary" />
                          </button>
                        )}
                        {onDeleteHabit && (
                          <button
                            onClick={() => setDeletingHabit(habit)}
                            disabled={deletingId === habit.id}
                            className="btn btn-ghost p-1"
                            title="Delete habit"
                            aria-label="Delete habit"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-text-muted hover:text-danger" />
                          </button>
                        )}
                      </div>
                    </div>
                    {habit.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {habit.tags.map(tag => (
                          <span
                            key={tag.id}
                            className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: tag.color ?? '#6B7280' }}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-4 mt-2">
                      <span className="text-xs text-text-muted">
                        Current streak: <span className="font-medium" style={{ color: '#F97316' }}>{habit.current_streak} day{habit.current_streak !== 1 ? 's' : ''}</span>
                      </span>
                      <span className="text-xs text-text-muted">
                        Best: <span className="font-medium" style={{ color: '#EAB308' }}>{habit.max_streak} day{habit.max_streak !== 1 ? 's' : ''}</span>
                      </span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="btn btn-secondary px-5 py-2">
            Close
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {deletingHabit && (
        <Modal onClose={() => setDeletingHabit(null)} layer="top" panelClassName="modal-panel max-w-sm w-full p-6 space-y-4">
          <p className="text-center text-text-primary">
            Are you sure you want to delete the habit{' '}
            <span className="font-medium">{deletingHabit.title}</span>?
          </p>
          <p className="text-center text-sm text-text-muted">
            It moves to Recently deleted, where you can restore it with its history for 30 days.
          </p>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setDeletingHabit(null)}
              disabled={deletingId === deletingHabit.id}
              className="btn btn-secondary flex-1 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deletingId === deletingHabit.id}
              className="btn flex-1 py-2 text-white flex items-center justify-center gap-1.5"
              style={{ backgroundColor: 'var(--tm-danger)' }}
            >
              {deletingId === deletingHabit.id && <Loader2 className="w-4 h-4 animate-spin" />}
              {deletingId === deletingHabit.id ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  );
};

export default ManageHabitsModal;
