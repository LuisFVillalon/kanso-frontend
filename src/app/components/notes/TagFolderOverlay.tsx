'use client';

import React from 'react';
import { X } from 'lucide-react';
import { Note } from '@/app/types/notes';
import { Tag } from '@/app/types/task';
import NoteFileIcon from './NoteFileIcon';
import Modal from '@/app/components/common/Modal';

interface TagFolderOverlayProps {
  tag: Tag;
  notes: Note[];
  activeNoteId: number | null;
  onDeleteNote: (id: number) => void;
  onArchiveNote?: (id: number) => void;
  onClose: () => void;
  /**
   * Picking a note closes the folder and hands the note to the caller, which
   * opens it where its other notes open: the /notes page's editor, or the
   * home page's note view.
   */
  onSelectNote: (note: Note) => void;
}

const TagFolderOverlay: React.FC<TagFolderOverlayProps> = ({
  tag,
  notes,
  activeNoteId,
  onDeleteNote,
  onArchiveNote,
  onClose,
  onSelectNote,
}) => (
  <Modal
    onClose={onClose}
    position="absolute"
    panelClassName="modal-panel relative flex flex-col overflow-hidden w-[90%] max-h-[90%]"
  >
    {/* Header */}
    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--tm-border)] shrink-0">
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-3 h-3 rounded-full"
          style={{ backgroundColor: tag.color }}
        />
        <h2 className="text-sm text-[var(--tm-text-primary)]">{tag.name}</h2>
        <span className="text-xs text-[var(--tm-text-muted)]">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </span>
      </div>
      <button
        onClick={onClose}
        className="btn btn-ghost p-1"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>

    {/* Body */}
    <div className="p-4 overflow-y-auto scrollbar-custom">
      {notes.length > 0 ? (
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}
        >
          {notes.map(note => (
            <NoteFileIcon
              key={note.id}
              note={note}
              isActive={note.id === activeNoteId}
              onClick={() => {
                onSelectNote(note);
                onClose();
              }}
              onDelete={onDeleteNote}
              onArchive={onArchiveNote}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--tm-text-muted)] text-center py-6">
          No notes in this folder
        </p>
      )}
    </div>
  </Modal>
);

export default TagFolderOverlay;
