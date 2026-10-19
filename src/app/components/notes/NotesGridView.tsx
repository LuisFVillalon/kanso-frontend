'use client';

import React, { useState, useMemo } from 'react';
import { FileText } from 'lucide-react';
import { Note } from '@/app/types/notes';
import { Tag } from '@/app/types/task';
import NoteFileIcon from './NoteFileIcon';
import NoteFolder from './NoteFolder';

interface NotesGridViewProps {
  notes: Note[];
  allTags: Tag[];
  activeNoteId: number | null;
  onSelectNote: (note: Note) => void;
  onDeleteNote: (id: number) => void;
  onArchiveNote?: (id: number) => void;
  onFolderClick?: (tag: Tag, notes: Note[]) => void;
  /** Use a wider responsive column count (for full-width contexts like TaskManager). */
  wide?: boolean;
  /** When set, only these tags may appear as folders (e.g. an active tag filter), even if notes carry other tags too. */
  tagFilter?: Tag[];
}

const NotesGridView: React.FC<NotesGridViewProps> = ({
  notes,
  allTags,
  activeNoteId,
  onSelectNote,
  onDeleteNote,
  onArchiveNote,
  onFolderClick,
  wide = false,
  tagFilter,
}) => {
  const [openFolderTagId, setOpenFolderTagId] = useState<number | null>(null);

  // Only surface tags that actually appear among the current (filtered) notes,
  // preserving the canonical allTags ordering for visual stability. When a
  // tag filter is active, further restrict folders to just the selected
  // tags — a note can carry other tags too, but those shouldn't get folders.
  const activeTags = useMemo(() => {
    const presentIds = new Set(notes.flatMap(n => n.tags.map(t => t.id)));
    const candidateTags = tagFilter && tagFilter.length > 0
      ? allTags.filter(t => tagFilter.some(sel => sel.id === t.id))
      : allTags;
    return candidateTags.filter(t => presentIds.has(t.id));
  }, [notes, allTags, tagFilter]);

  const notesByTag = useMemo(() => {
    const map = new Map<number, Note[]>();
    activeTags.forEach(tag => {
      map.set(tag.id, notes.filter(n => n.tags.some(t => t.id === tag.id)));
    });
    return map;
  }, [notes, activeTags]);

  // Notes whose only tags are archived (absent from allTags) get no folder,
  // so they sit with the untagged notes instead of vanishing from the grid.
  const untaggedNotes = useMemo(() => {
    const folderTagIds = new Set(allTags.map(t => t.id));
    return notes.filter(n => !n.tags.some(t => folderTagIds.has(t.id)));
  }, [notes, allTags]);

  const handleFolderClick = (tag: Tag) => {
    if (onFolderClick) {
      onFolderClick(tag, notesByTag.get(tag.id) ?? []);
    } else {
      setOpenFolderTagId(prev => (prev === tag.id ? null : tag.id));
    }
  };

  // Column count tracks the container's own width (not the viewport), so the
  // grid stays correct whether it's rendered in a narrow sidebar or a wide panel.
  const gridClass = 'grid gap-1';
  const gridStyle = { gridTemplateColumns: `repeat(auto-fill, minmax(${wide ? 64 : 56}px, 1fr))` };

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center">
        <FileText className="w-6 h-6 text-text-muted mb-2" />
        <p className="text-sm text-text-secondary">No notes here yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Main grid: tag folders first, then untagged file icons */}
      <div className={gridClass} style={gridStyle}>
        {activeTags.map(tag => (
          <NoteFolder
            key={tag.id}
            tag={tag}
            noteCount={notesByTag.get(tag.id)?.length ?? 0}
            isOpen={openFolderTagId === tag.id}
            onToggle={() => handleFolderClick(tag)}
          />
        ))}
        {untaggedNotes.map(note => (
          <NoteFileIcon
            key={note.id}
            note={note}
            isActive={note.id === activeNoteId}
            onClick={() => onSelectNote(note)}
            onDelete={onDeleteNote}
            onArchive={onArchiveNote}
          />
        ))}
      </div>

      {/* Inline expansion — used when no external overlay handler is wired up */}
      {!onFolderClick && openFolderTagId !== null && (() => {
        const tag = activeTags.find(t => t.id === openFolderTagId);
        const tagNotes = notesByTag.get(openFolderTagId) ?? [];
        if (!tag || tagNotes.length === 0) return null;
        return (
          <div className="pl-2 border-l-2" style={{ borderColor: tag.color }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: tag.color }}>
              {tag.name}
            </p>
            <div className={gridClass} style={gridStyle}>
              {tagNotes.map(note => (
                <NoteFileIcon
                  key={note.id}
                  note={note}
                  isActive={note.id === activeNoteId}
                  onClick={() => onSelectNote(note)}
                  onDelete={onDeleteNote}
                  onArchive={onArchiveNote}
                />
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default NotesGridView;
