'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { X, FileSymlink } from 'lucide-react';
import { Note } from '@/app/types/notes';
import { Tag } from '@/app/types/task';
import NoteEditor from './NoteEditor';
import Modal from '@/app/components/common/Modal';

interface NoteEditorOverlayProps {
  note: Note;
  allTags: Tag[];
  onUpdate: (id: number, changes: Partial<Pick<Note, 'title' | 'content' | 'tags'>>) => void | Promise<boolean>;
  onDeleteNote: (id: number) => void;
  onClose: () => void;
}

const NoteEditorOverlay: React.FC<NoteEditorOverlayProps> = ({
  note,
  allTags,
  onUpdate,
  onClose,
}) => {
  const router = useRouter();

  return (
    <Modal onClose={onClose} layer="top" panelClassName="modal-panel w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--tm-border)] shrink-0">
        <h2 className="text-sm text-[var(--tm-text-primary)] truncate">
          {note.title || 'Untitled'}
        </h2>
        <div className="flex items-center gap-1 shrink-0">
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
      <div className="flex-1 overflow-hidden flex flex-col">
        <NoteEditor
          note={note}
          allTags={allTags}
          onUpdate={onUpdate}
        />
      </div>
    </Modal>
  );
};

export default NoteEditorOverlay;
