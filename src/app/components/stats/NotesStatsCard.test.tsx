// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesOverlay } from './NotesStatsCard';
import type { Note } from '@/app/types/notes';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/app/lib/backend-api', () => ({
  fetchNoteTimeSpentForRange: vi.fn(() => Promise.resolve({ 1: 600 })),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const notes: Note[] = [
  { id: 1, title: 'Lecture', content: '<p>hello world</p>', tags: [], created_date: '2026-10-20T10:00:00Z', updated_date: '2026-10-22T10:00:00Z' },
];

describe('Notes overlay', () => {
  it("keeps this week's time breakdown and drops the overall one", async () => {
    await act(async () => {
      root.render(<NotesOverlay notes={notes} noteTags={[]} />);
    });
    const slideLabels = [...container.querySelectorAll('button[aria-label^="Show "]')].map(b => b.getAttribute('aria-label'));
    expect(slideLabels).toContain("Show This Week's Time Breakdown");
    expect(slideLabels).not.toContain('Show Overall Time Breakdown');
    expect(container.textContent).not.toContain('Overall Time Breakdown');
  });
});
