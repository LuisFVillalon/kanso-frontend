// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOSAVE_DELAY_MS, useNoteAutosave, type NoteChanges } from './useNoteAutosave';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Api = ReturnType<typeof useNoteAutosave>;
type Save = (id: number, changes: NoteChanges) => Promise<boolean>;

let container: HTMLDivElement;
let root: Root;
/** The hook's latest return value, refreshed after every render. */
const latest: { current: Api | null } = { current: null };

const capture = (api: Api) => { latest.current = api; };

const Harness: React.FC<{ noteId: number | null; onSave: Save; onResult: (api: Api) => void }> = ({ noteId, onSave, onResult }) => {
  const result = useNoteAutosave(noteId, onSave);
  useEffect(() => { onResult(result); });
  return null;
};

const render = (noteId: number | null, onSave: Save) =>
  act(() => root.render(<Harness noteId={noteId} onSave={onSave} onResult={capture} />));

/** Lets pending promise callbacks (the awaited save) settle inside act. */
const settle = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe('useNoteAutosave', () => {
  it('starts saved, shows saving while an edit waits, then saves it once after the quiet period', async () => {
    const onSave = vi.fn<Save>().mockResolvedValue(true);
    render(1, onSave);
    expect(latest.current!.status).toBe('saved');

    act(() => latest.current!.schedule({ content: '<p>a</p>' }));
    act(() => latest.current!.schedule({ content: '<p>ab</p>' }));
    expect(latest.current!.status).toBe('saving');
    expect(onSave).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(AUTOSAVE_DELAY_MS); });
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(1, { content: '<p>ab</p>' });
    expect(latest.current!.status).toBe('saved');
    expect(latest.current!.savedAt).toBeInstanceOf(Date);
  });

  it('merges title and content edits made within one quiet period', async () => {
    const onSave = vi.fn<Save>().mockResolvedValue(true);
    render(1, onSave);
    act(() => latest.current!.schedule({ title: 'Lecture 4' }));
    act(() => latest.current!.schedule({ content: '<p>ATP</p>' }));
    act(() => { vi.advanceTimersByTime(AUTOSAVE_DELAY_MS); });
    await settle();
    expect(onSave).toHaveBeenCalledWith(1, { title: 'Lecture 4', content: '<p>ATP</p>' });
  });

  it('shows an error when a save fails, and sends the failed changes again with the next save', async () => {
    const onSave = vi.fn<Save>().mockResolvedValueOnce(false).mockResolvedValue(true);
    render(1, onSave);
    act(() => latest.current!.schedule({ title: 'Lost?' }));
    act(() => { vi.advanceTimersByTime(AUTOSAVE_DELAY_MS); });
    await settle();
    expect(latest.current!.status).toBe('error');

    act(() => latest.current!.schedule({ content: '<p>later</p>' }));
    act(() => { vi.advanceTimersByTime(AUTOSAVE_DELAY_MS); });
    await settle();
    expect(onSave).toHaveBeenLastCalledWith(1, { title: 'Lost?', content: '<p>later</p>' });
    expect(latest.current!.status).toBe('saved');
  });

  it('treats a thrown save as a failure', async () => {
    const onSave = vi.fn<Save>().mockRejectedValue(new Error('offline'));
    render(1, onSave);
    act(() => latest.current!.schedule({ title: 'x' }));
    act(() => { vi.advanceTimersByTime(AUTOSAVE_DELAY_MS); });
    await settle();
    expect(latest.current!.status).toBe('error');
  });

  it('saveNow skips the wait and includes anything queued', async () => {
    const onSave = vi.fn<Save>().mockResolvedValue(true);
    render(1, onSave);
    act(() => latest.current!.schedule({ title: 'Queued' }));
    await act(async () => { await latest.current!.saveNow({ content: '<p>now</p>' }); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(1, { title: 'Queued', content: '<p>now</p>' });
    expect(latest.current!.status).toBe('saved');

    // The queued save was taken over, so nothing fires later.
    act(() => { vi.advanceTimersByTime(AUTOSAVE_DELAY_MS * 2); });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('sends the previous note\'s queued edit when switching notes, and starts the new note as saved', async () => {
    const onSave = vi.fn<Save>().mockResolvedValue(true);
    render(1, onSave);
    act(() => latest.current!.schedule({ content: '<p>note one</p>' }));
    render(2, onSave);
    await settle();
    expect(onSave).toHaveBeenCalledWith(1, { content: '<p>note one</p>' });
    expect(latest.current!.status).toBe('saved');
    expect(latest.current!.savedAt).toBeNull();
  });

  it('does nothing without a note', () => {
    const onSave = vi.fn<Save>().mockResolvedValue(true);
    render(null, onSave);
    act(() => latest.current!.schedule({ title: 'x' }));
    act(() => { vi.advanceTimersByTime(AUTOSAVE_DELAY_MS); });
    expect(onSave).not.toHaveBeenCalled();
    expect(latest.current!.status).toBe('saved');
  });
});
