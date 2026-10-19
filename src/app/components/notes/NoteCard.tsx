'use client';

import React from 'react';
import { Archive, Trash2 } from 'lucide-react';
import { Note } from '@/app/types/notes';
import { stripHtml } from '@/app/utils/textUtils';
import { formatUpdatedDate } from '@/app/utils/dateUtils';
import TagChipList from '@/app/components/common/TagChipList';

interface NoteCardProps {
  note: Note;
  isActive: boolean;
  onClick: () => void;
  onDelete: (id: number) => void;
  onArchive?: (id: number) => void;
  /** True while an archive or delete request for this note is in flight. */
  deleting?: boolean;
}

const MAX_VISIBLE_TAGS = 2;

const NoteCard: React.FC<NoteCardProps> = ({ note, isActive, onClick, onDelete, onArchive, deleting }) => {
  const preview = stripHtml(note.content);
  const accentColor = note.tags[0]?.color;

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col rounded-xl border cursor-pointer overflow-hidden transition-colors"
      style={{
        backgroundColor: isActive ? 'var(--tm-accent-subtle)' : 'var(--tm-surface)',
        borderColor: isActive ? 'var(--tm-accent)' : 'var(--tm-border)',
      }}
      onMouseEnter={e => {
        if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--tm-surface-raised)';
      }}
      onMouseLeave={e => {
        if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--tm-surface)';
      }}
    >
      {/* Category strip — quiet color cue, quicker to scan than a folder icon */}
      <div
        className="h-[3px] w-full flex-shrink-0"
        style={{ backgroundColor: accentColor ?? 'var(--tm-border)' }}
      />

      <div className="flex flex-col flex-1 p-2.5 gap-1.5 min-w-0">
        <div className="flex items-start justify-between gap-1.5">
          <h3
            className="text-[13px] font-semibold leading-snug truncate flex-1 min-w-0"
            style={{ color: isActive ? 'var(--tm-accent)' : 'var(--tm-text-primary)' }}
          >
            {note.title || 'Untitled Note'}
          </h3>
          {onArchive && (
            <button
              onClick={e => { e.stopPropagation(); onArchive(note.id); }}
              disabled={deleting}
              className="btn btn-ghost flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 disabled:opacity-50 disabled:cursor-wait"
              title="Archive note"
              aria-label="Archive note"
            >
              <Archive className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onDelete(note.id); }}
            disabled={deleting}
            className="btn btn-danger-ghost flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 disabled:opacity-50 disabled:cursor-wait"
            title="Delete note"
            aria-label="Delete note"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-2 flex-1">
          {preview || <span className="italic text-text-muted">No content yet</span>}
        </p>

        <div className="flex items-end justify-between gap-1.5 min-w-0">
          <TagChipList tags={note.tags} size="2xs" maxVisible={MAX_VISIBLE_TAGS} className="min-w-0" />
          <span className="text-[9px] text-text-muted whitespace-nowrap flex-shrink-0">
            {formatUpdatedDate(note.updated_date)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default NoteCard;
