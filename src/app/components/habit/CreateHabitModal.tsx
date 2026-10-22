import React, { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Tag, NewHabit } from '@/app/types/task';
import Modal from '@/app/components/common/Modal';
import TagMultiSelect from '@/app/components/common/TagMultiSelect';
import HabitTimeGoalField from './HabitTimeGoalField';

interface CreateHabitModalProps {
  isOpen: boolean;
  onClose: () => void;
  newHabit: NewHabit;
  onHabitChange: (habit: NewHabit) => void;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
  availableTags: Tag[];
}


const CreateHabitModal: React.FC<CreateHabitModalProps> = ({
  isOpen,
  onClose,
  newHabit,
  onHabitChange,
  onSubmit,
  availableTags,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    setIsSubmitting(true);
    try {
      await onSubmit(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTag = (tag: Tag) => {
    const alreadySelected = newHabit.tags.some(t => t.id === tag.id);
    onHabitChange({
      ...newHabit,
      tags: alreadySelected
        ? newHabit.tags.filter(t => t.id !== tag.id)
        : [...newHabit.tags, tag],
    });
  };

  return (
    <Modal onClose={onClose} layer="raised">
      {/* Header */}
      <div
        className="px-5 py-4 border-b border-border-subtle flex justify-between items-center"
        style={{ backgroundColor: 'var(--tm-surface)' }}
      >
        <h3 className="text-lg font-semibold text-text-primary">Create a Habit</h3>
        <button onClick={onClose} className="btn btn-ghost" aria-label="Close">
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Habit Name</label>
          <input
            type="text"
            value={newHabit.title}
            onChange={(e) => onHabitChange({ ...newHabit, title: e.target.value })}
            className="input-field"
            placeholder="e.g. Morning Run"
            required
          />
        </div>

        {/* Daily time goal (stored as estimated_time, in hours) */}
        <HabitTimeGoalField
          value={newHabit.estimated_time}
          onChange={hours => onHabitChange({ ...newHabit, estimated_time: hours })}
        />

        {/* Tags */}
        {availableTags.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Tags</label>
            <TagMultiSelect
              tags={availableTags}
              isSelected={tag => newHabit.tags.some(t => t.id === tag.id)}
              onToggle={toggleTag}
              gridClassName="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg border border-border max-h-36 overflow-y-auto scrollbar-custom"
              gridStyle={{ backgroundColor: 'var(--tm-surface-raised)' }}
              buttonClassName="px-3 py-2 rounded-full text-sm font-medium transition-all hover:scale-100 active:scale-95"
              unselectedBg="var(--tm-surface)"
              scaleAnimation
            />
            {newHabit.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 items-center">
                <span className="text-xs text-text-muted">Selected:</span>
                {newHabit.tags.map(tag => (
                  <span
                    key={tag.id}
                    className="chip rounded-full px-2"
                    style={{ backgroundColor: tag.color, color: 'white' }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="btn btn-secondary flex-1 py-2">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1 py-2 flex items-center justify-center gap-1.5">
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Creating…' : 'Create Habit'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateHabitModal;
