'use client';

import React from 'react';
import type { Tag } from '@/app/types/task';

interface EventTagPickerProps {
  tags: Tag[];
  selected: Tag[];
  onToggle: (tag: Tag) => void;
  /** Names the group, e.g. the id of a visible label. */
  'aria-labelledby'?: string;
  className?: string;
}

/** Tag chips that each toggle, with the tag's color as a dot and, once picked, as the chip's tint. */
const EventTagPicker: React.FC<EventTagPickerProps> = ({ tags, selected, onToggle, 'aria-labelledby': labelledBy, className = '' }) => {
  if (tags.length === 0) {
    return <p className="text-xs text-text-muted">No tags yet. Make some from Manage tags to color your events.</p>;
  }
  return (
    <div role="group" aria-labelledby={labelledBy} className={`flex flex-wrap gap-1.5 ${className}`}>
      {tags.map(tag => {
        const on = selected.some(t => t.id === tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(tag)}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors"
            style={{
              borderColor: on ? tag.color : 'var(--tm-border)',
              backgroundColor: on ? `color-mix(in srgb, ${tag.color} 16%, var(--tm-surface))` : 'var(--tm-surface)',
              color: 'var(--tm-text-primary)',
            }}
          >
            <span aria-hidden className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
            {tag.name}
          </button>
        );
      })}
    </div>
  );
};

export const toggleTag = (tags: Tag[], tag: Tag): Tag[] =>
  tags.some(t => t.id === tag.id) ? tags.filter(t => t.id !== tag.id) : [...tags, tag];

export default EventTagPicker;
