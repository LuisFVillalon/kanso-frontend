// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '@/app/types/notes';

vi.mock('@/app/lib/supabase', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: null } }) } },
}));
vi.mock('@/app/lib/backend-api', () => ({
  startNoteSession: vi.fn(() => Promise.resolve({ id: 1 })),
  endNoteSession: vi.fn(() => Promise.resolve()),
  endNoteSessionKeepalive: vi.fn(),
  fetchNoteTimeSpent: vi.fn(() => Promise.resolve(120)),
}));

import { useNoteSession } from './useNoteSession';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Api = ReturnType<typeof useNoteSession>;

let container: HTMLDivElement;
let root: Root;
const latest: { current: Api | null } = { current: null };

const Harness: React.FC<{ note: Note }> = ({ note }) => {
  const result = useNoteSession(note);
  useEffect(() => { latest.current = result; });
  return null;
};

const note = (id: number, persistedId?: number) => ({
  id, persistedId, title: 'Lecture 4', content: '', tags: [],
  created_date: '2026-10-01T00:00:00Z', updated_date: '2026-10-01T00:00:00Z',
}) as Note;

const render = (n: Note) => act(() => root.render(<Harness note={n} />));
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const minutes = (n: number) => act(() => { vi.advanceTimersByTime(n * 60_000); });

let hidden = false;
const setHidden = (value: boolean) => act(() => {
  hidden = value;
  document.dispatchEvent(new Event('visibilitychange'));
});

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe('useNoteSession', () => {
  it('counts only the time the tab is visible on this visit', async () => {
    render(note(7));
    await settle();
    expect(latest.current!.pastSeconds).toBe(120);

    minutes(2);
    setHidden(true);
    minutes(600);
    setHidden(false);
    minutes(1);
    expect(latest.current!.visitSeconds()).toBe(180);
  });

  it('does not count a draft until it is saved', async () => {
    render(note(-1));
    minutes(5);
    expect(latest.current!.visitSeconds()).toBe(0);

    render(note(-1, 9));
    await settle();
    minutes(1);
    expect(latest.current!.visitSeconds()).toBe(60);
  });
});
