// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '@/app/types/notes';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('./NoteEditor', () => ({ default: () => <div /> }));

import NoteEditorOverlay, { NoteOpenMode } from './NoteEditorOverlay';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const note = { id: 1, title: 'Lecture', content: '', tags: [] } as unknown as Note;

let container: HTMLDivElement;
let root: Root;

const panelClass = (mode: NoteOpenMode) => {
  act(() => root.render(
    <NoteEditorOverlay note={note} allTags={[]} onUpdate={vi.fn()} onDeleteNote={vi.fn()} onClose={vi.fn()} mode={mode} onModeChange={vi.fn()} />,
  ));
  return document.querySelector('.modal-panel')!.className;
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('NoteEditorOverlay', () => {
  it('sizes the expanded note wide enough for the whole toolbar, within the window', () => {
    const classes = panelClass('centered').split(' ');
    expect(classes).toContain('max-w-4xl');
    expect(classes).toContain('w-full');
  });

  it('fills the Notes panel when not expanded', () => {
    expect(panelClass('panel')).toContain('h-full');
  });
});
