// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '@/app/types/notes';

const api = vi.hoisted(() => ({ createNote: vi.fn(), updateNote: vi.fn() }));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_err: unknown, fallback: string) => fallback }));
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => vi.fn() }));

import { useNotes } from './useNotes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tag = { id: 1, name: 'Red', color: '#ef4444' };
const saved = { id: 7, title: 'Note', content: '', tags: [tag], created_date: '2026-10-01', updated_date: '2026-10-02' } as Note;

let hook: ReturnType<typeof useNotes>;
const Probe: React.FC<{ onResult: (r: typeof hook) => void }> = ({ onResult }) => {
  onResult(useNotes(false));
  return null;
};

let root: Root;
beforeEach(() => {
  api.createNote.mockReset().mockResolvedValue(saved);
  api.updateNote.mockReset().mockResolvedValue(saved);
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe onResult={r => { hook = r; }} />));
});
afterEach(() => act(() => root.unmount()));

describe('useNotes tag sync token', () => {
  it('bumps once the server has saved a note\'s tags', async () => {
    await act(async () => { await hook.updateNote(7, { tags: [tag] }); });
    expect(hook.tagSyncToken).toBe(1);
  });

  it('bumps once a draft is created with its tags', async () => {
    let draft: Note;
    act(() => { draft = hook.addNote(); });
    await act(async () => { await hook.updateNote(draft.id, { tags: [tag] }); });
    expect(api.createNote).toHaveBeenCalledOnce();
    expect(hook.tagSyncToken).toBe(1);
  });

  it('stays put for edits that leave the tags alone', async () => {
    await act(async () => { await hook.updateNote(7, { content: 'typing' }); });
    expect(hook.tagSyncToken).toBe(0);
  });

  it('stays put when the save fails', async () => {
    api.updateNote.mockRejectedValue(new Error('500'));
    await act(async () => { await hook.updateNote(7, { tags: [tag] }); });
    expect(hook.tagSyncToken).toBe(0);
  });
});
