'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Archive, Filter } from 'lucide-react';
import { Tag } from '@/app/types/task';

interface ArchiveTagFilterProps {
  /** The tags offered — those carried by the items in the current tab. */
  tags: Tag[];
  selectedIds: ReadonlySet<number>;
  isArchived: (tag: Tag) => boolean;
  onToggle: (tag: Tag) => void;
  onClear: () => void;
}

/**
 * The archive page's tag filter — the same button + checkbox popover as the
 * notes list filter, but its options can include archived tags (archived
 * items keep them), which are labeled as such.
 */
const ArchiveTagFilter: React.FC<ArchiveTagFilterProps> = ({ tags, selectedIds, isArchived, onToggle, onClear }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = selectedIds.size;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="relative flex items-center justify-center gap-1.5 h-8 min-w-8 px-2 sm:px-2.5 rounded-lg border text-sm font-medium transition-colors"
        style={{
          borderColor: count > 0 ? 'var(--tm-accent)' : 'var(--tm-border)',
          color: count > 0 ? 'var(--tm-accent)' : 'var(--tm-text-muted)',
        }}
        title="Filter by tag"
        aria-label="Filter by tag"
        aria-expanded={open}
        aria-pressed={count > 0}
      >
        <Filter className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Tags</span>
        {count > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold leading-none"
            style={{ backgroundColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' }}
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 top-full mt-1 right-0 card p-1.5 flex flex-col gap-1 min-w-[180px] max-w-[min(260px,calc(100vw-2rem))]"
          style={{ boxShadow: 'var(--tm-shadow-lg)' }}
        >
          <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto scrollbar-custom">
            {tags.map(tag => {
              const checked = selectedIds.has(tag.id);
              const archived = isArchived(tag);
              return (
                <label
                  key={tag.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: checked ? 'var(--tm-accent-subtle)' : 'transparent' }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(tag)}
                    className="accent-accent flex-shrink-0"
                  />
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className={`text-xs truncate ${archived ? 'text-text-muted' : 'text-text-primary'}`}>{tag.name}</span>
                  {archived && (
                    <span className="ml-auto flex items-center gap-0.5 text-[10px] text-text-muted flex-shrink-0" title="This tag is archived">
                      <Archive className="w-3 h-3" />
                      Archived
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          {count > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-[10px] font-medium text-text-muted hover:text-text-primary transition-colors text-center pt-0.5"
            >
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ArchiveTagFilter;
