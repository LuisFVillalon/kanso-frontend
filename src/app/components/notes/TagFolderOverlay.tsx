'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileSymlink, X } from 'lucide-react';
import { Note } from '@/app/types/notes';
import { Tag } from '@/app/types/task';
import NoteFileIcon from './NoteFileIcon';
import NoteEditor from './NoteEditor';
import Modal from '@/app/components/common/Modal';

interface TagFolderOverlayProps {
  tag: Tag;
  notes: Note[];
  activeNoteId: number | null;
  allTags: Tag[];
  onUpdate: (id: number, changes: Partial<Pick<Note, 'title' | 'content' | 'tags'>>) => void | Promise<boolean>;
  onDeleteNote: (id: number) => void;
  onArchiveNote?: (id: number) => void;
  onClose: () => void;
  /**
   * When provided, picking a note closes the overlay and hands the note to
   * the caller instead of opening the overlay's own internal editor — used
   * on the /notes page so the note opens in the main right-hand editor
   * panel rather than an editor confined to the overlay's positioned
   * ancestor (the left sidebar).
   */
  onSelectNote?: (note: Note) => void;
}

const TagFolderOverlay: React.FC<TagFolderOverlayProps> = ({
  tag,
  notes,
  activeNoteId,
  allTags,
  onUpdate,
  onDeleteNote,
  onArchiveNote,
  onClose,
  onSelectNote,
}) => {
  const router = useRouter();
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedNote) {
          setSelectedNote(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectedNote]);

  const isEditorView = selectedNote !== null;

  return (
    <Modal
      onClose={onClose}
      position="absolute"
      closeOnEscape={false}
      closeOnBackdropClick={!isEditorView}
      panelClassName={`modal-panel relative flex flex-col overflow-hidden
        ${isEditorView ? 'w-full h-full' : 'w-[90%] max-h-[90%]'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--tm-border)] shrink-0">
        <div className="flex items-center gap-2">
          {isEditorView ? (
            <button
              onClick={() => setSelectedNote(null)}
              className="btn btn-ghost p-1"
              aria-label="Back to folder"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
          )}
          <h2 className="text-sm text-[var(--tm-text-primary)]">
            {isEditorView ? selectedNote.title || 'Untitled' : tag.name}
          </h2>
          {!isEditorView && (
            <span className="text-xs text-[var(--tm-text-muted)]">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isEditorView && (
            <button
              onClick={() => { router.push(`/notes?id=${selectedNote!.id}`); onClose(); }}
              className="btn btn-ghost p-1"
              aria-label="View in Notes"
              title="View in Notes"
            >
              <FileSymlink className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="btn btn-ghost p-1"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      {isEditorView ? (
        <div className="flex-1 overflow-hidden flex flex-col">
          <NoteEditor
            note={selectedNote}
            allTags={allTags}
            onUpdate={async (id, changes) => {
              const ok = await onUpdate(id, changes);
              setSelectedNote(prev => prev?.id === id ? { ...prev, ...changes } : prev);
              return ok !== false;
            }}
          />
        </div>
      ) : (
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
                    if (onSelectNote) {
                      onSelectNote(note);
                      onClose();
                    } else {
                      setSelectedNote(note);
                    }
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
      )}
    </Modal>
  );
};

export default TagFolderOverlay;
