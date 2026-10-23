'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, FileText, LayoutGrid, FolderClosed, ArrowDownUp, Loader2, Filter } from 'lucide-react';
import { Note } from '@/app/types/notes';
import { Tag } from '@/app/types/task';
import NoteCard from './NoteCard';
import NotesGridView from './NotesGridView';
import TagFolderOverlay from './TagFolderOverlay';

interface NotesListProps {
  notes: Note[];
  activeNoteId: number | null;
  allTags: Tag[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSelectNote: (note: Note) => void;
  onNewNote: () => void | Promise<void>;
  onDeleteNote: (id: number) => void;
  onArchiveNote: (id: number) => void;
  pendingNoteIds?: Set<number>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export type ViewMode = 'cards' | 'folders';
type SortOrder = 'recent' | 'oldest';

const NotesList: React.FC<NotesListProps> = ({
  notes,
  activeNoteId,
  allTags,
  searchTerm,
  onSearchChange,
  onSelectNote,
  onNewNote,
  onDeleteNote,
  onArchiveNote,
  pendingNoteIds,
  viewMode,
  onViewModeChange,
}) => {
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const [tagFolderOverlay, setTagFolderOverlay] = useState<Tag | null>(null);
  const [creatingNote, setCreatingNote] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [tagFilterOpen, setTagFilterOpen] = useState(false);
  const tagFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tagFilterOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (tagFilterRef.current && !tagFilterRef.current.contains(e.target as Node)) {
        setTagFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [tagFilterOpen]);

  const toggleTagFilter = (tag: Tag) => {
    setSelectedTags(prev =>
      prev.some(t => t.id === tag.id) ? prev.filter(t => t.id !== tag.id) : [...prev, tag],
    );
  };

  const handleNewNoteClick = async () => {
    if (creatingNote) return;
    setCreatingNote(true);
    try {
      await onNewNote();
    } finally {
      setCreatingNote(false);
    }
  };

  // A tag archived while selected stops filtering — it's no longer offered here.
  const activeSelectedTags = useMemo(
    () => selectedTags.filter(sel => allTags.some(t => t.id === sel.id)),
    [selectedTags, allTags],
  );

  const sortedNotes = useMemo(() => {
    const filtered = activeSelectedTags.length === 0
      ? notes
      : notes.filter(note => note.tags.some(t => activeSelectedTags.some(sel => sel.id === t.id)));
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.updated_date).getTime() - new Date(b.updated_date).getTime(),
    );
    return sortOrder === 'recent' ? sorted.reverse() : sorted;
  }, [notes, sortOrder, activeSelectedTags]);

  // Read live so notes archived or deleted from inside the open folder leave it.
  const folderNotes = useMemo(
    () => (tagFolderOverlay ? sortedNotes.filter(n => n.tags.some(t => t.id === tagFolderOverlay.id)) : []),
    [sortedNotes, tagFolderOverlay],
  );

  return (
    <div className="relative flex flex-col h-full">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border-subtle"
        style={{ backgroundColor: 'var(--tm-surface)' }}
      >
        <h2 className="text-lg text-text-primary">Notes</h2>
        <button
          onClick={handleNewNoteClick}
          disabled={creatingNote}
          className="btn btn-primary px-3 py-1.5 text-sm gap-1.5 disabled:opacity-70 disabled:cursor-wait"
        >
          {creatingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {creatingNote ? 'Creating…' : 'New Note'}
        </button>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none" />
          <input
            type="text"
            placeholder="Search notes…"
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            className="input-field pl-9"
          />
        </div>

        {/* Sort by edit recency */}
        <button
          onClick={() => setSortOrder(prev => (prev === 'recent' ? 'oldest' : 'recent'))}
          className="flex items-center justify-center w-8 h-8 rounded-lg border transition-colors flex-shrink-0"
          style={{ borderColor: 'var(--tm-border)', color: 'var(--tm-text-muted)' }}
          title={sortOrder === 'recent' ? 'Sorted by most recently edited — click to reverse' : 'Sorted by least recently edited — click to reverse'}
          aria-label="Toggle sort by edit recency"
        >
          <ArrowDownUp className="w-3.5 h-3.5" />
        </button>

        {/* Tag filter */}
        <div ref={tagFilterRef} className="relative flex-shrink-0">
          <button
            onClick={() => setTagFilterOpen(prev => !prev)}
            className="relative flex items-center justify-center w-8 h-8 rounded-lg border transition-colors flex-shrink-0"
            style={{
              borderColor: activeSelectedTags.length > 0 ? 'var(--tm-accent)' : 'var(--tm-border)',
              color: activeSelectedTags.length > 0 ? 'var(--tm-accent)' : 'var(--tm-text-muted)',
            }}
            title="Filter by tag"
            aria-label="Filter by tag"
            aria-pressed={activeSelectedTags.length > 0}
          >
            <Filter className="w-3.5 h-3.5" />
            {activeSelectedTags.length > 0 && (
              <span
                className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold leading-none"
                style={{ backgroundColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' }}
              >
                {activeSelectedTags.length}
              </span>
            )}
          </button>

          {tagFilterOpen && (
            <div
              className="absolute z-50 top-full mt-1 right-0 card p-1.5 flex flex-col gap-1 min-w-[160px]"
              style={{ boxShadow: 'var(--tm-shadow-lg)' }}
            >
              <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto scrollbar-custom">
                {allTags.length === 0 && (
                  <p className="px-2 py-1 text-xs text-text-muted">No tags yet</p>
                )}
                {allTags.map(tag => {
                  const checked = selectedTags.some(t => t.id === tag.id);
                  return (
                    <label
                      key={tag.id}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: checked ? 'var(--tm-accent-subtle)' : 'transparent' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTagFilter(tag)}
                        className="accent-accent flex-shrink-0"
                      />
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                      <span className="text-xs text-text-primary truncate">{tag.name}</span>
                    </label>
                  );
                })}
              </div>
              {activeSelectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="text-[10px] font-medium text-text-muted hover:text-text-primary transition-colors text-center pt-0.5"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>

        {/* View toggle — cards vs. folders */}
        <button
          type="button"
          onClick={() => onViewModeChange(viewMode === 'cards' ? 'folders' : 'cards')}
          aria-label={viewMode === 'cards' ? 'Show folder view' : 'Show card view'}
          title={viewMode === 'cards' ? 'Show folder view' : 'Show card view'}
          className="relative w-14 h-7 rounded-full border border-border-subtle shadow-sm transition-colors duration-200 flex-shrink-0"
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
      </div>

      {/* ── Notes ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-custom">
        {sortedNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
              style={{ backgroundColor: 'var(--tm-surface-raised)' }}
            >
              <FileText className="w-6 h-6 text-text-muted" />
            </div>
            <p className="text-sm font-medium text-text-secondary">
              {searchTerm || activeSelectedTags.length > 0 ? 'No notes match your filters' : 'No notes yet'}
            </p>
            {!searchTerm && activeSelectedTags.length === 0 && (
              <p className="text-xs text-text-muted mt-1">Click New Note to get started</p>
            )}
          </div>
        ) : viewMode === 'cards' ? (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
          >
            {sortedNotes.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                isActive={note.id === activeNoteId}
                onClick={() => onSelectNote(note)}
                onDelete={onDeleteNote}
                onArchive={onArchiveNote}
                deleting={pendingNoteIds?.has(note.id)}
              />
            ))}
          </div>
        ) : (
          <NotesGridView
            notes={sortedNotes}
            allTags={allTags}
            activeNoteId={activeNoteId}
            onSelectNote={onSelectNote}
            onDeleteNote={onDeleteNote}
            onArchiveNote={onArchiveNote}
            onFolderClick={tag => setTagFolderOverlay(tag)}
            tagFilter={activeSelectedTags}
          />
        )}
      </div>

      {tagFolderOverlay && (
        <TagFolderOverlay
          tag={tagFolderOverlay}
          notes={folderNotes}
          activeNoteId={activeNoteId}
          onDeleteNote={onDeleteNote}
          onArchiveNote={onArchiveNote}
          onClose={() => setTagFolderOverlay(null)}
          onSelectNote={onSelectNote}
        />
      )}
    </div>
  );
};

export default NotesList;
