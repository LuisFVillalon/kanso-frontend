'use client';

import React from 'react';
import { Archive, FileText, Trash2 } from 'lucide-react';
import { Note } from '@/app/types/notes';

interface NoteFileIconProps {
  note: Note;
  isActive: boolean;
  onClick: () => void;
  onDelete: (id: number) => void;
  onArchive?: (id: number) => void;
}

const NoteFileIcon: React.FC<NoteFileIconProps> = ({ note, isActive, onClick, onDelete, onArchive }) => (
  <div
    onClick={onClick}
    className="group relative flex flex-col items-center gap-0.5 p-1 cursor-pointer"
  >
    {onArchive && (
      <button
        onClick={e => { e.stopPropagation(); onArchive(note.id); }}
        className="btn btn-ghost absolute top-0 left-0 opacity-0 group-hover:opacity-100 p-0.5 z-10"
        title="Archive note"
        aria-label="Archive note"
      >
        <Archive className="w-3 h-3" />
      </button>
    )}
    <button
      onClick={e => { e.stopPropagation(); onDelete(note.id); }}
      className="btn btn-danger-ghost absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-0.5 z-10"
      title="Delete note"
      aria-label="Delete note"
    >
      <Trash2 className="w-3 h-3" />
    </button>

    <FileText
      className="w-10 h-10 transition-opacity group-hover:opacity-80"
      fill="currentColor"
      stroke="none"
      style={{ color: isActive ? 'var(--tm-accent)' : 'var(--tm-text-muted)' }}
    />

    <span
      className="text-[11px] font-medium text-center leading-tight line-clamp-2 w-full"
      style={{ color: isActive ? 'var(--tm-accent)' : 'var(--tm-text-secondary)' }}
    >
      {note.title || 'Untitled'}
    </span>
  </div>
);

export default NoteFileIcon;
