// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tag } from '@/app/types/task';
import type { Note } from '@/app/types/notes';

type Update = (id: number, changes: Partial<Pick<Note, 'title' | 'content'>>) => Promise<boolean>;

/** The onUpdate each mounted editor was given, newest last. */
const editorUpdates: Update[] = [];

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('./NoteEditor', () => ({
  default: ({ onUpdate }: { onUpdate: Update }) => {
    editorUpdates.push(onUpdate);
    return null;
  },
}));

import TagFolderOverlay from './TagFolderOverlay';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const school: Tag = { id: 1, name: 'School', color: '#4F46E5' };
const note = (id: number, title: string) => ({
  id, title, content: `<p>${title}</p>`, tags: [school], created_date: '2026-10-01T00:00:00Z', updated_date: '2026-10-01T00:00:00Z',
}) as Note;
const notes = [note(1, 'Lecture notes'), note(2, 'Lab report')];

let container: HTMLDivElement;
let root: Root;

const openNote = (title: string) => act(() => {
  Array.from(document.body.querySelectorAll<HTMLElement>('span'))
    .find(el => el.textContent === title)!.click();
});
const header = () => document.body.querySelector('h2')?.textContent;

beforeEach(() => {
  editorUpdates.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('TagFolderOverlay', () => {
  it('keeps a late save of the previous note out of the note now open', async () => {
    act(() => root.render(
      <TagFolderOverlay
        tag={school}
        notes={notes}
        activeNoteId={null}
        allTags={[school]}
        onUpdate={vi.fn<Update>().mockResolvedValue(true)}
        onDeleteNote={vi.fn()}
        onClose={vi.fn()}
      />,
    ));
    openNote('Lecture notes');
    const updateFirst = editorUpdates[editorUpdates.length - 1];
    act(() => document.body.querySelector<HTMLElement>('[aria-label="Back to folder"]')!.click());
    openNote('Lab report');
    expect(header()).toBe('Lab report');

    await act(async () => { await updateFirst(1, { title: 'Lecture notes, edited' }); });
    expect(header()).toBe('Lab report');
  });
});
