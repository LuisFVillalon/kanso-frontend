'use client';

import React, { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useNotesContext } from '@/app/context/NotesContext';
import { useTagsContext } from '@/app/context/TagsContext';
import { useAuth } from '@/app/context/AuthContext';
import { Note } from '@/app/types/notes';
import { useResizableSplit } from '@/app/hooks/useResizableSplit';
import { useProfile } from '@/app/hooks/useProfile';
import { usePersistedPref } from '@/app/hooks/usePersistedPref';
import NotesList, { ViewMode } from './NotesList';
import NoteEditor from './NoteEditor';
import DragHandle from '@/app/components/common/DragHandle';
import PageSpinner from '@/app/components/common/PageSpinner';

const isViewMode = (c: unknown): c is ViewMode => c === 'cards' || c === 'folders';

interface NotesViewProps {
  embedded?: boolean;
}

const MIN_SIDE = 160;
const MAX_SIDE = 560;
const DEFAULT_SIDE = 288;

const NotesView: React.FC<NotesViewProps> = ({ embedded = false }) => {
  const { notes, isLoading: notesLoading, addNote, updateNote, deleteNote, archiveNote, discardDraft, pendingNoteIds } = useNotesContext();
  const { user } = useAuth();
  const { profile, saveProfile } = useProfile(user);
  const [viewMode, setViewMode] = usePersistedPref<ViewMode>(
    'tm-notes-view-mode',
    'cards',
    isViewMode,
    profile.notesViewMode as ViewMode | null,
    next => { saveProfile({ ...profile, notesViewMode: next }); },
  );
  const [searchTerm, setSearchTerm] = useState('');

  const filteredNotes = searchTerm.trim()
    ? notes.filter(n =>
        n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.content.replace(/<[^>]+>/g, '').toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : notes;
  const { tags, tagsLoading } = useTagsContext();
  const searchParams = useSearchParams();

  const [activeNoteId, setActiveNoteIdRaw] = useState<number | null>(null);
  // Wraps setActiveNoteId so switching away from an untouched draft note
  // removes it instead of leaving a phantom "Untitled Note" in the list.
  const setActiveNoteId = useCallback((id: number | null) => {
    setActiveNoteIdRaw(prev => {
      if (prev !== null && prev !== id) discardDraft(prev);
      return id;
    });
  }, [discardDraft]);
  const [mobileView, setMobileView]       = useState<'list' | 'editor'>('list');
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [leftWidth, setLeftWidth]         = useState(DEFAULT_SIDE);
  const [isResizingLeft, setIsResizingLeft]   = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [appliedUrlNoteId, setAppliedUrlNoteId] = useState<string | null>(null);

  const urlNoteIdParam = searchParams.get('id');
  if (urlNoteIdParam && notes.length > 0 && appliedUrlNoteId !== urlNoteIdParam) {
    setAppliedUrlNoteId(urlNoteIdParam);
    const id = parseInt(urlNoteIdParam, 10);
    if (!isNaN(id) && notes.some(n => n.id === id) && activeNoteId !== id) {
      setActiveNoteId(id);
      setMobileView('editor');
    }
  }

  const activeNote: Note | null = notes.find(n => n.id === activeNoteId) ?? null;

  const handleSelectNote = (note: Note) => { setActiveNoteId(note.id); setMobileView('editor'); };

  const handleNewNote = async () => {
    const created = await addNote();
    setActiveNoteId(created.id);
    setMobileView('editor');
  };

  // Deleting or archiving the open note moves the editor on to the next one.
  const handleRemoveNote = (remove: (id: number) => unknown) => (id: number) => {
    remove(id);
    if (activeNoteId === id) {
      const next = notes.filter(n => n.id !== id)[0] ?? null;
      setActiveNoteId(next?.id ?? null);
      if (!next) setMobileView('list');
    }
  };

  const handleLeftDragStart = useResizableSplit(panelRef, {
    min: MIN_SIDE, max: MAX_SIDE, anchor: 'left',
    onResize: setLeftWidth,
    onResizingChange: setIsResizingLeft,
  });

  if (notesLoading || tagsLoading) return <PageSpinner />;

  const panel = (
    <div
      ref={panelRef}
      className="card overflow-hidden flex"
      style={{ height: embedded ? 'calc(100vh - 280px)' : 'calc(100vh - 96px)', minHeight: '420px' }}
    >
      {/* Left sidebar */}
      <div
        className={`flex-shrink-0 flex-col overflow-hidden ${
          isResizingLeft ? '' : 'transition-[width] duration-300 ease-in-out'
        } ${mobileView === 'editor' ? 'hidden sm:flex' : 'flex'} ${sidebarOpen ? 'border-r border-border-subtle' : ''}`}
        style={{ width: sidebarOpen ? leftWidth : 0 }}
      >
        <div style={{ width: leftWidth }} className="flex flex-col flex-1 overflow-hidden">
          <NotesList
            notes={filteredNotes}
            activeNoteId={activeNoteId}
            allTags={tags}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onSelectNote={handleSelectNote}
            onNewNote={handleNewNote}
            onUpdateNote={updateNote}
            onDeleteNote={handleRemoveNote(deleteNote)}
            onArchiveNote={handleRemoveNote(archiveNote)}
            pendingNoteIds={pendingNoteIds}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
      </div>

      {sidebarOpen && <DragHandle onMouseDown={handleLeftDragStart} />}

      {/* Editor panel */}
      <div className={`flex-1 flex-col min-w-0 ${mobileView === 'list' ? 'hidden sm:flex' : 'flex'}`}>
        <button
          onClick={() => setMobileView('list')}
          className="sm:hidden flex items-center gap-1 px-4 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary border-b border-border-subtle transition-colors shrink-0"
          style={{ backgroundColor: 'var(--tm-surface-raised)' }}
        >
          <ChevronLeft className="w-4 h-4" />
          All Notes
        </button>

        <NoteEditor
          note={activeNote}
          allTags={tags}
          onUpdate={updateNote}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(v => !v)}
          showExtendedActions
        />
      </div>
    </div>
  );

  if (embedded) return <div className="w-full">{panel}</div>;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-5 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Home
        </Link>
        <span className="text-text-muted select-none">/</span>
        <h1 className="text-2xl sm:text-3xl text-text-primary">Notes</h1>
      </div>
      <div className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-4 md:px-6 lg:px-8 pb-4 sm:pb-6 min-h-0">
        {panel}
      </div>
    </div>
  );
};

export default NotesView;
