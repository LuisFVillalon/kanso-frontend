'use client';

import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowLeft, X, FileSymlink, Maximize2, Minimize2 } from 'lucide-react';
import { Note } from '@/app/types/notes';
import { Tag } from '@/app/types/task';
import NoteEditor from './NoteEditor';
import Modal from '@/app/components/common/Modal';

/** Where the home page shows an open note: filling the Notes panel, or centered over the page. */
export type NoteOpenMode = 'panel' | 'centered';
export const isNoteOpenMode = (c: unknown): c is NoteOpenMode => c === 'panel' || c === 'centered';

interface NoteEditorOverlayProps {
  note: Note;
  allTags: Tag[];
  onUpdate: (id: number, changes: Partial<Pick<Note, 'title' | 'content' | 'tags'>>) => void | Promise<boolean>;
  onDeleteNote: (id: number) => void;
  onClose: () => void;
  mode: NoteOpenMode;
  onModeChange: (mode: NoteOpenMode) => void;
  /** Set when the note was opened from a tag folder: returns to that folder. */
  onBack?: () => void;
  backLabel?: string;
}

const NoteEditorOverlay: React.FC<NoteEditorOverlayProps> = ({
  note,
  allTags,
  onUpdate,
  onClose,
  mode,
  onModeChange,
  onBack,
  backLabel,
}) => {
  const router = useRouter();
  const centered = mode === 'centered';
  const [editorHost] = useState(() => {
    if (typeof document === 'undefined') return null;
    const host = document.createElement('div');
    host.style.display = 'contents';
    return host;
  });
  const placeEditor = useCallback((slot: HTMLDivElement | null) => {
    if (slot && editorHost) slot.appendChild(editorHost);
  }, [editorHost]);

  return (
    <>
    <Modal
      onClose={onClose}
      layer={centered ? 'top' : 'base'}
      position={centered ? 'fixed' : 'absolute'}
      closeOnBackdropClick={centered}
      panelClassName={centered
        ? 'modal-panel w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden'
        : 'modal-panel relative w-full h-full flex flex-col overflow-hidden'}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--tm-border)] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="btn btn-ghost p-1 shrink-0"
              aria-label={backLabel}
              title={backLabel}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <h2 className="text-sm text-[var(--tm-text-primary)] truncate">
            {note.title || 'Untitled'}
          </h2>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onModeChange(centered ? 'panel' : 'centered')}
            className="btn btn-ghost p-1"
            aria-label={centered ? 'Back to panel' : 'Expand'}
            title={centered ? 'Back to panel' : 'Expand'}
          >
            {centered ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => { router.push(`/notes?id=${note.id}`); onClose(); }}
            className="btn btn-ghost p-1"
            aria-label="View in Notes"
            title="View in Notes"
          >
            <FileSymlink className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="btn btn-ghost p-1"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div ref={placeEditor} className="flex-1 overflow-hidden flex flex-col" />
    </Modal>
    {editorHost && createPortal(
      <NoteEditor
        note={note}
        allTags={allTags}
        onUpdate={onUpdate}
        showExport
      />,
      editorHost,
    )}
    </>
  );
};

export default NoteEditorOverlay;
