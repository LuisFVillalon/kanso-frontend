// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tag } from '@/app/types/task';
import type { Note } from '@/app/types/notes';
import type { ProfileFields } from '@/app/hooks/useProfile';
vi.mock('@/app/lib/supabase', () => ({ supabase: {} }));

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
