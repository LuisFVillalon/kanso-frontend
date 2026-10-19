import React from 'react';
import { Calendar, Clock } from 'lucide-react';
import { Tag } from '@/app/types/task';
import DurationPicker from './DurationPicker';

export interface TaskFormData {
  title: string;
  description: string;
  priority: number | null;
  due_date: string | Date | null;
  due_time: string | Date | null;
  tags: Tag[];
  category?: string | null;
  estimated_time?: number | null;
}

interface TaskFormFieldsProps {
  values: TaskFormData;
  onChange: (next: TaskFormData) => void;
  tags: Tag[];
  onToggleTag: (tag: Tag) => void;
  activeTaskCount: number;
  usedPriorityLevels: number[];
}

const TaskFormFields: React.FC<TaskFormFieldsProps> = ({
  values,
  onChange,
  tags,
  onToggleTag,
  activeTaskCount,
  usedPriorityLevels,
}) => {
  const occupiedPriorities = new Set(
    usedPriorityLevels.filter(p => p !== values.priority),
  );
  const maxPriority = Math.max(activeTaskCount, values.priority ?? 0);
  const priorityRange = Array.from({ length: maxPriority || activeTaskCount + 1 }, (_, i) => i + 1);
  const availablePriorities = priorityRange.filter(
    p => p === values.priority || !occupiedPriorities.has(p),
  );

  const set = (patch: Partial<TaskFormData>) => onChange({ ...values, ...patch });

  const dueDateValue =
    values.due_date instanceof Date
      ? values.due_date.toISOString().slice(0, 10)
      : typeof values.due_date === 'string'
      ? values.due_date
      : '';

  const dueTimeValue =
    values.due_time instanceof Date
      ? values.due_time.toISOString().slice(11, 16)
      : values.due_time ?? '';

  return (
    <>
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Title <span style={{ color: 'var(--tm-danger)' }}>*</span>
        </label>
        <input
          type="text"
          required
          value={values.title}
          onChange={e => set({ title: e.target.value })}
          placeholder="Enter task title"
          className="input-field"
        />
      </div>

      {/* Priority */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">Priority</label>
        <select
          value={values.priority ?? ''}
          onChange={e => set({ priority: e.target.value === '' ? null : parseInt(e.target.value) })}
          className="input-field"
        >
          <option value="">No priority</option>
          {availablePriorities.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <p className="text-xs text-text-muted mt-1">
          1 = highest priority. Leave blank for no priority.
          {availablePriorities.length > 0 && ` Available: ${availablePriorities.length > 3 ? `${availablePriorities[0]}, ..., ${availablePriorities[availablePriorities.length - 1]}` : availablePriorities.join(', ')}.`}
        </p>
      </div>

      {/* Due Date & Time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Due Date</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted pointer-events-none" />
            <input
              type="date"
              value={dueDateValue}
              onChange={e => set({ due_date: e.target.value })}
              className="input-field pl-10"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Due Time</label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted pointer-events-none" />
            <input
              type="time"
              value={dueTimeValue}
              onChange={e => set({ due_time: e.target.value })}
              className="input-field pl-10"
            />
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">Description</label>
        <textarea
          value={values.description}
          onChange={e => set({ description: e.target.value })}
          placeholder="Add task details…"
          rows={3}
          className="input-field resize-y min-h-[72px] max-h-[400px]"
        />
      </div>

      {/* Estimated Duration */}
      <div>
        <label id="estimated-duration-label" className="block text-sm font-medium text-text-secondary mb-2">
          Estimated Duration
        </label>
        <DurationPicker
          value={values.estimated_time}
          onChange={hours => set({ estimated_time: hours })}
        />
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">Tags</label>
        <div
          className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-4 rounded-lg border border-border max-h-48 overflow-y-auto scrollbar-custom"
          style={{ backgroundColor: 'var(--tm-surface-raised)' }}
        >
          {tags.map(tag => {
            const selected = values.tags.some(t => t.id === tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggleTag(tag)}
                style={{
                  backgroundColor: selected ? tag.color : 'var(--tm-surface)',
                  color: selected ? '#ffffff' : 'var(--tm-text-primary)',
                  border: `1px solid ${selected ? tag.color : 'var(--tm-border)'}`,
                  transform: selected ? 'scale(1)' : 'scale(0.97)',
                }}
                className="px-3 py-2 rounded-full text-sm font-medium transition-all hover:scale-100 active:scale-95"
              >
                {tag.name}
              </button>
            );
          })}
        </div>
        {values.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-text-muted">Selected:</span>
            {values.tags.map(tag => (
              <span
                key={tag.id}
                className="chip rounded-full px-2"
                style={{ backgroundColor: tags.find(t => t.id === tag.id)?.color ?? 'var(--tm-accent)', color: 'white' }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

    </>
  );
};

export default TaskFormFields;
