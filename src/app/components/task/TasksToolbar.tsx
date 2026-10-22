'use client';

import React, { useId } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, Tag as TagIcon, X } from 'lucide-react';
import { useMenu } from '@/app/hooks/useMenu';
import type { Tag, TaskShow, TaskSortKey, TaskView } from '@/app/types/task';

const SHOWS: { key: TaskShow; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Completed' },
  { key: 'all', label: 'All' },
];

const SORTS: { key: TaskSortKey; label: string }[] = [
  { key: 'due', label: 'Due date' },
  { key: 'priority', label: 'Priority' },
  { key: 'duration', label: 'Est. time' },
  { key: 'created', label: 'Created' },
];

// What each direction means for each sort key, for the direction button's name.
const DIRECTION: Record<TaskSortKey, { asc: string; desc: string }> = {
  due: { asc: 'soonest first', desc: 'latest first' },
  priority: { asc: 'highest first', desc: 'lowest first' },
  duration: { asc: 'shortest first', desc: 'longest first' },
  created: { asc: 'oldest first', desc: 'newest first' },
};

interface TasksToolbarProps {
  view: TaskView;
  onViewChange: (view: TaskView) => void;
  tags: Tag[];
  selectedTags: Tag[];
  onToggleTag: (tag: Tag) => void;
  onClearTags: () => void;
  /** Keeps everything on one row that scrolls sideways (a narrow panel). */
  compact?: boolean;
}

/**
 * The Tasks panel's list controls: which tasks to show, how to sort them,
 * and which tags to filter by. Selected tags show as removable chips; the
 * full list is in the Tags menu.
 */
const TasksToolbar: React.FC<TasksToolbarProps> = ({
  view, onViewChange, tags, selectedTags, onToggleTag, onClearTags, compact = false,
}) => {
  const sortId = useId();
  const tagMenu = useMenu();
  const direction = DIRECTION[view.sortKey][view.sortOrder];
  const flip = view.sortOrder === 'asc' ? 'desc' : 'asc';

  return (
    <div className="relative">
      <div
        role="toolbar"
        aria-label="Task list controls"
        className={`tasks-toolbar scrollbar-none ${compact ? 'flex-nowrap overflow-x-auto' : 'flex-nowrap overflow-x-auto md:flex-wrap md:overflow-visible'}`}
      >
        <div className="seg flex-shrink-0" role="group" aria-label="Show">
          {SHOWS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={view.show === key}
              onClick={() => onViewChange({ ...view, show: key })}
              className="seg-btn"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <label htmlFor={sortId} className="sr-only">Sort tasks by</label>
          <select
            id={sortId}
            value={view.sortKey}
            onChange={e => onViewChange({ ...view, sortKey: e.target.value as TaskSortKey })}
            className="toolbar-control pr-7"
          >
            {SORTS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => onViewChange({ ...view, sortOrder: flip })}
            aria-label={`Sort direction: ${direction}. Switch to ${DIRECTION[view.sortKey][flip]}`}
            title={`${direction[0].toUpperCase()}${direction.slice(1)}: click to flip`}
            className="toolbar-control px-2"
          >
            {view.sortOrder === 'asc'
              ? <ArrowUpNarrowWide className="w-4 h-4" aria-hidden />
              : <ArrowDownWideNarrow className="w-4 h-4" aria-hidden />}
          </button>
        </div>

        <span className="w-px h-5 flex-shrink-0" style={{ backgroundColor: 'var(--tm-border)' }} aria-hidden />

        {selectedTags.map(tag => (
          <button
            key={tag.id}
            type="button"
            onClick={() => onToggleTag(tag)}
            aria-label={`Remove tag filter: ${tag.name}`}
            className="tag-chip tag-chip-on flex-shrink-0"
          >
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: tag.color }} aria-hidden />
            <span className="truncate max-w-[10rem]">{tag.name}</span>
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        ))}

        <button {...tagMenu.triggerProps} className="tag-chip flex-shrink-0">
          <TagIcon className="w-3.5 h-3.5" aria-hidden />
          {selectedTags.length > 0 ? 'Tags' : 'Filter by tag'}
        </button>
      </div>

      {tagMenu.open && (
        <div {...tagMenu.menuProps} aria-label="Filter by tag" className="menu-pop left-0 top-full mt-1 max-h-72 overflow-y-auto scrollbar-custom">
          {tags.length === 0 && <p className="px-2.5 py-1.5 text-xs text-text-muted">No tags yet</p>}
          {tags.map(tag => {
            const checked = selectedTags.some(t => t.id === tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                onClick={() => onToggleTag(tag)}
                className="menu-row"
              >
                <span
                  className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border"
                  style={checked
                    ? { backgroundColor: tag.color, borderColor: tag.color, color: '#fff' }
                    : { borderColor: 'var(--tm-border-strong)' }}
                  aria-hidden
                >
                  {checked && <Check className="w-3 h-3" />}
                </span>
                <span className="flex-1 truncate">{tag.name}</span>
              </button>
            );
          })}
          {selectedTags.length > 0 && (
            <>
              <div className="menu-sep" role="separator" />
              <button type="button" role="menuitem" onClick={() => { onClearTags(); tagMenu.close(); }} className="menu-row">
                <X className="w-4 h-4" aria-hidden />
                Clear tags
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default TasksToolbar;
