'use client';

import React, { useMemo, useState } from 'react';
import { ArrowDownUp, FileText, LayoutGrid, FolderClosed, X } from 'lucide-react';
import NoteCard from '@/app/components/notes/NoteCard';
import NotesGridView from '@/app/components/notes/NotesGridView';
import TagFolderOverlay from '@/app/components/notes/TagFolderOverlay';
import NoteEditorOverlay, { isNoteOpenMode, type NoteOpenMode } from '@/app/components/notes/NoteEditorOverlay';
import { Note } from '@/app/types/notes';
import { Tag } from '@/app/types/task';
import { usePersistedPref } from '@/app/hooks/usePersistedPref';
import type { ProfileFields, useProfile } from '@/app/hooks/useProfile';

interface NotesPanelProps {
  notes: Note[];
  tags: Tag[];
  noteEditorOverlay: Note | null;
  onUpdateNote: (id: number, changes: Partial<Pick<Note, 'title' | 'content' | 'tags'>>) => void | Promise<boolean>;
  onDeleteNote: (id: number) => void;
  onArchiveNote: (id: number) => void;
  onEditorChange: (note: Note | null) => void;
  /** User-adjustable scroll-area height in px (overrides the default responsive height). */
  heightPx?: number | null;
  isLoading?: boolean;
  pendingNoteIds?: Set<number>;
  /** The tag filter set from the Tasks toolbar; shown here as removable chips, and only these tags may appear as folders. */
  tagFilter: Tag[];
  onToggleTag: (tag: Tag) => void;
  onClearTags: () => void;
  profile: ProfileFields;
  onSaveProfile: ReturnType<typeof useProfile>['saveProfile'];
  /** Edit-recency order of `notes`, toggled from the panel header. */
  noteOrder: NoteOrder;
  onNoteOrderChange: (order: NoteOrder) => void;
}

export type NoteOrder = 'newest' | 'oldest';
export const isNoteOrder = (c: unknown): c is NoteOrder => c === 'newest' || c === 'oldest';

type ViewMode = 'cards' | 'folders';
const isViewMode = (c: unknown): c is ViewMode => c === 'cards' || c === 'folders';

const NotesPanelSkeleton: React.FC = () => (
  <div className="card-glass p-3 sm:p-4 mt-2">
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="h-24 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--tm-surface-raised)' }} />
      ))}
    </div>
  </div>
);

const NotesPanel: React.FC<NotesPanelProps> = ({
  notes,
  tags,
  noteEditorOverlay,
  onUpdateNote,
  onDeleteNote,
  onArchiveNote,
  onEditorChange,
  heightPx,
  isLoading,
  pendingNoteIds,
  tagFilter,
  onToggleTag,
  onClearTags,
  profile,
  onSaveProfile,
  noteOrder,
  onNoteOrderChange,
}) => {
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [viewMode, setViewMode] = usePersistedPref<ViewMode>(
    'tm-notes-view-mode',
    'cards',
    isViewMode,
    profile.notesViewMode as ViewMode | null,
    next => { onSaveProfile({ ...profile, notesViewMode: next }); },
  );
  // Every note opens the same way, from the cards or a folder; this device remembers the last choice.
  const [openMode, setOpenMode] = usePersistedPref<NoteOpenMode>('tm-note-open-mode', 'panel', isNoteOpenMode);
  const [notesFolderOverlay, setNotesFolderOverlay] = useState<Tag | null>(null);
  // The folder the open note was picked from, so its header can lead back there.
  const [openedFromFolder, setOpenedFromFolder] = useState<Tag | null>(null);
  const openNote = (note: Note, folder: Tag | null = null) => {
    setActiveNoteId(note.id);
    setOpenedFromFolder(folder);
    onEditorChange(note);
  };
  const closeNote = () => {
    setOpenedFromFolder(null);
    onEditorChange(null);
  };
  // Read live so notes archived or deleted from inside the open folder leave it.
  const folderNotes = useMemo(
    () => (notesFolderOverlay ? notes.filter(n => n.tags.some(t => t.id === notesFolderOverlay.id)) : []),
    [notes, notesFolderOverlay],
  );

  return (
    <div className="relative flex flex-col space-y-2 sm:space-y-3">
      {!isLoading && (notes.length > 0 || tagFilter.length > 0) && (
        <div className="panel-header">
          {tagFilter.length > 0 && (
            <div role="group" aria-label="Tag filter" className="flex items-center gap-1.5 min-w-0 overflow-x-auto overscroll-x-contain scrollbar-none">
              {tagFilter.map(tag => (
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
              <button type="button" onClick={onClearTags} aria-label="Clear tag filter" className="tag-chip flex-shrink-0">
                Clear
              </button>
            </div>
          )}
          {notes.length > 0 && (
            <div role="group" aria-label="Notes view" className="ml-auto flex items-center gap-1.5 flex-shrink-0">
              {/* View toggle — cards (new) vs. folders (the original file/folder browser) */}
              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'cards' ? 'folders' : 'cards')}
                aria-label={viewMode === 'cards' ? 'Show folder view' : 'Show card view'}
                title={viewMode === 'cards' ? 'Show folder view' : 'Show card view'}
                className="relative w-14 h-7 rounded-full border border-border-subtle shadow-sm transition-colors duration-200"
                style={{
                  backgroundColor: viewMode === 'folders'
                    ? 'color-mix(in srgb, var(--tm-accent) 55%, white 45%)'
                    : 'var(--tm-border-subtle)',
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200 ease-out"
                  style={{ transform: `translateX(${viewMode === 'folders' ? 28 : 0}px)` }}
                />
                <span className="absolute inset-0.5 flex items-center justify-between pointer-events-none">
                  <span className="w-6 h-6 flex items-center justify-center">
                    <LayoutGrid className={`w-3.5 h-3.5 transition-colors ${viewMode === 'cards' ? 'text-white' : 'text-text-muted'}`} />
                  </span>
                  <span className="w-6 h-6 flex items-center justify-center">
                    <FolderClosed className={`w-3.5 h-3.5 transition-colors ${viewMode === 'folders' ? 'text-white' : 'text-text-muted'}`} />
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNoteOrderChange(noteOrder === 'newest' ? 'oldest' : 'newest')}
                aria-label={`Notes order: ${noteOrder === 'newest' ? 'newest' : 'oldest'} first. Switch to ${noteOrder === 'newest' ? 'oldest' : 'newest'} first`}
                title="Flip the notes' order"
                className="toolbar-control gap-1.5"
              >
                <ArrowDownUp className="w-3.5 h-3.5" aria-hidden />
                {noteOrder === 'newest' ? 'Newest first' : 'Oldest first'}
              </button>
            </div>
          )}
        </div>
      )}
      {isLoading ? (
        <NotesPanelSkeleton />
      ) : notes.length === 0 ? (
        <div className="card-glass p-6 sm:p-8 text-center mt-2">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: 'var(--tm-surface-raised)' }}
          >
            <FileText className="w-6 h-6 text-text-muted" />
          </div>
          <h3 className="text-base font-semibold text-text-primary mb-2">No notes yet</h3>
          <p className="text-sm text-text-secondary">Create a note to get started</p>
        </div>
      ) : (
        <>
          <div
            className="overflow-y-auto h-[50vh] lg:h-[600px] pl-2 pr-1 scrollbar-custom pt-2"
            data-panel-body
            style={heightPx ? { height: `${heightPx}px` } : undefined}
          >
            {viewMode === 'cards' ? (
              <div
                className="grid gap-2 pb-2"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
              >
                {notes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    isActive={note.id === activeNoteId}
                    onClick={() => openNote(note)}
                    onDelete={onDeleteNote}
                    onArchive={onArchiveNote}
                    deleting={pendingNoteIds?.has(note.id)}
                  />
                ))}
              </div>
            ) : (
              <NotesGridView
                notes={notes}
                allTags={tags}
                activeNoteId={activeNoteId}
                onSelectNote={note => openNote(note)}
                onDeleteNote={onDeleteNote}
                onArchiveNote={onArchiveNote}
                onFolderClick={tag => setNotesFolderOverlay(tag)}
                wide
                tagFilter={tagFilter}
              />
            )}
          </div>
        </>
      )}

      {notesFolderOverlay && (
        <TagFolderOverlay
          tag={notesFolderOverlay}
          notes={folderNotes}
          activeNoteId={activeNoteId}
          onDeleteNote={onDeleteNote}
          onArchiveNote={onArchiveNote}
          onClose={() => setNotesFolderOverlay(null)}
          onSelectNote={note => openNote(note, notesFolderOverlay)}
        />
      )}

      {noteEditorOverlay && (
        <NoteEditorOverlay
          note={noteEditorOverlay}
          allTags={tags}
          onUpdate={onUpdateNote}
          onDeleteNote={id => { onDeleteNote(id); closeNote(); }}
          onClose={closeNote}
          mode={openMode}
          onModeChange={setOpenMode}
          onBack={openedFromFolder ? () => { setNotesFolderOverlay(openedFromFolder); closeNote(); } : undefined}
          backLabel={openedFromFolder ? `Back to ${openedFromFolder.name}` : undefined}
        />
      )}
    </div>
  );
};

export default NotesPanel;
