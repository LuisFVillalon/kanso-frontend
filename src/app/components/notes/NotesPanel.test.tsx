// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tag } from '@/app/types/task';
import type { Note } from '@/app/types/notes';
import type { ProfileFields } from '@/app/hooks/useProfile';
vi.mock('@/app/lib/supabase', () => ({ supabase: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('./NoteEditor', () => ({
  default: ({ note, showExport }: { note: Note; showExport?: boolean }) => (
    <div data-testid="note-editor" data-export={String(!!showExport)}>{note.title}</div>
  ),
}));

import NotesPanel from './NotesPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const school: Tag = { id: 1, name: 'School', color: '#4F46E5' };
const gym: Tag = { id: 2, name: 'Gym', color: '#10B981' };
const note = (id: number, title: string, tags: Tag[]) => ({
  id, title, content: '', tags, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
}) as unknown as Note;
const notes = [note(1, 'Lecture notes', [school]), note(2, 'Workout plan', [gym])];

let container: HTMLDivElement;
let root: Root;

// The home page's wiring: the shared tag filter narrows the notes it passes in.
const Harness: React.FC<{ initial: Tag[] }> = ({ initial }) => {
  const [selected, setSelected] = useState<Tag[]>(initial);
  const shown = selected.length === 0 ? notes : notes.filter(n => n.tags.some(t => selected.some(s => s.id === t.id)));
  return (
    <NotesPanel
      notes={shown}
      tags={[school, gym]}
      noteEditorOverlay={null}
      onUpdateNote={vi.fn()}
      onDeleteNote={vi.fn()}
      onArchiveNote={vi.fn()}
      onEditorChange={vi.fn()}
      tagFilter={selected}
      onToggleTag={tag => setSelected(prev => prev.filter(t => t.id !== tag.id))}
      onClearTags={() => setSelected([])}
      profile={{ notesViewMode: 'cards' } as unknown as ProfileFields}
      onSaveProfile={vi.fn()}
      noteOrder="newest"
      onNoteOrderChange={vi.fn()}
    />
  );
};

const render = (initial: Tag[]) => act(() => root.render(<Harness initial={initial} />));
const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
const text = () => container.textContent ?? '';

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('NotesPanel tag filter indicator', () => {
  it('shows nothing when no tags are selected', () => {
    render([]);
    expect(container.querySelector('[aria-label="Tag filter"]')).toBeNull();
    expect(text()).toContain('Lecture notes');
    expect(text()).toContain('Workout plan');
  });

  it('shows the selected tags as removable chips, and removing one widens the notes', () => {
    render([school]);
    expect(byLabel('Remove tag filter: School')).not.toBeNull();
    expect(text()).not.toContain('Workout plan');
    act(() => byLabel('Remove tag filter: School')!.click());
    expect(container.querySelector('[aria-label="Tag filter"]')).toBeNull();
    expect(text()).toContain('Workout plan');
  });

  it('clears every selected tag, even when the filter leaves no notes', () => {
    render([{ id: 3, name: 'Empty', color: '#000' }, school]);
    act(() => byLabel('Remove tag filter: School')!.click());
    expect(text()).toContain('No notes yet');
    expect(byLabel('Remove tag filter: Empty')).not.toBeNull();
    act(() => byLabel('Clear tag filter')!.click());
    expect(container.querySelector('[aria-label="Tag filter"]')).toBeNull();
    expect(text()).toContain('Lecture notes');
    expect(text()).toContain('Workout plan');
  });
});

// The home page's wiring of the open note: TaskManager holds which note is open.
const OpenNoteHarness: React.FC<{ viewMode: 'cards' | 'folders' }> = ({ viewMode }) => {
  const [open, setOpen] = useState<Note | null>(null);
  return (
    <NotesPanel
      notes={notes}
      tags={[school, gym]}
      noteEditorOverlay={open}
      onUpdateNote={vi.fn()}
      onDeleteNote={vi.fn()}
      onArchiveNote={vi.fn()}
      onEditorChange={setOpen}
      tagFilter={[]}
      onToggleTag={vi.fn()}
      onClearTags={vi.fn()}
      profile={{ notesViewMode: viewMode } as unknown as ProfileFields}
      onSaveProfile={vi.fn()}
      noteOrder="newest"
      onNoteOrderChange={vi.fn()}
    />
  );
};

const renderOpen = (viewMode: 'cards' | 'folders') => act(() => root.render(<OpenNoteHarness viewMode={viewMode} />));
/** Clicks the innermost element showing exactly this text (a card, folder or file icon). */
const clickText = (value: string) => act(() => {
  const matches = Array.from(document.body.querySelectorAll<HTMLElement>('*')).filter(el => el.textContent === value);
  matches[matches.length - 1].click();
});
const anyLabel = (label: string) => document.body.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
const editor = () => document.body.querySelector<HTMLElement>('[data-testid="note-editor"]');
/** Panel notes stay inside the Notes panel; centered ones portal over the whole page. */
const openIn = () => {
  const shown = editor();
  if (!shown) return null;
  return container.contains(shown) ? 'panel' : 'centered';
};

describe('NotesPanel opening a note', () => {
  beforeEach(() => window.localStorage.clear());

  it('opens a note from the cards in the Notes panel, with Export', () => {
    renderOpen('cards');
    clickText('Lecture notes');
    expect(openIn()).toBe('panel');
    expect(editor()!.dataset.export).toBe('true');
    expect(anyLabel('Expand')).not.toBeNull();
  });

  it('opens a note from a folder the same way, and leads back to the folder', () => {
    renderOpen('folders');
    clickText('School');
    clickText('Lecture notes');
    expect(openIn()).toBe('panel');
    expect(editor()!.dataset.export).toBe('true');
    act(() => anyLabel('Back to School')!.click());
    expect(editor()).toBeNull();
    expect(text()).toContain('1 note');
  });

  it('expands to the centered view, goes back to the panel, and remembers the choice for the next note', () => {
    renderOpen('cards');
    clickText('Lecture notes');
    act(() => anyLabel('Expand')!.click());
    expect(openIn()).toBe('centered');
    expect(JSON.parse(window.localStorage.getItem('tm-note-open-mode')!)).toBe('centered');
    act(() => anyLabel('Close')!.click());
    expect(editor()).toBeNull();

    clickText('Workout plan');
    expect(openIn()).toBe('centered');
    act(() => anyLabel('Back to panel')!.click());
    expect(openIn()).toBe('panel');
    expect(JSON.parse(window.localStorage.getItem('tm-note-open-mode')!)).toBe('panel');
  });

  it('opens folder notes centered too once the choice is centered', () => {
    window.localStorage.setItem('tm-note-open-mode', JSON.stringify('centered'));
    renderOpen('folders');
    clickText('Gym');
    clickText('Workout plan');
    expect(openIn()).toBe('centered');
    expect(anyLabel('Back to Gym')).not.toBeNull();
  });
});
