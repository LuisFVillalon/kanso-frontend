// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '@/app/types/notes';

vi.mock('@/app/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/hooks/useNoteSession', () => ({ useNoteSession: () => 0 }));
vi.mock('@/app/context/TasksContext', () => ({
  useTasksContext: () => ({ addTask: vi.fn(), discardTask: vi.fn() }),
}));

import { ToastProvider } from '@/app/context/ToastContext';
import NoteEditor from './NoteEditor';
import { AUTOSAVE_DELAY_MS } from '@/app/hooks/useNoteAutosave';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Update = (id: number, changes: Partial<Pick<Note, 'title' | 'content' | 'tags'>>) => Promise<boolean>;

const note: Note = {
  id: 7,
  title: 'Lecture 4',
  content: '<h2>Overview</h2><p>Cells make ATP.</p>',
  tags: [],
  created_date: '2026-10-01T00:00:00Z',
  updated_date: '2026-10-01T00:00:00Z',
};

let container: HTMLDivElement;
let root: Root;

const render = (onUpdate: Update, extended = true) =>
  act(() => root.render(
    <ToastProvider>
      <NoteEditor note={note} allTags={[]} onUpdate={onUpdate} onToggleSidebar={vi.fn()} showExtendedActions={extended} />
    </ToastProvider>,
  ));

const byLabel = (label: string) => container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const status = () => container.querySelector('[role="status"]')?.textContent ?? '';
const titleInput = () => byLabel('Note title') as HTMLInputElement;
const editorHtml = () => container.querySelector('.notes-editor')?.innerHTML ?? '';
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

/** Types into the controlled title input the way React listens for it. */
const typeTitle = (value: string) => act(() => {
  const input = titleInput();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

/** Runs a toolbar menu item: opens the menu, then clicks the item by its text. */
const clickMenuItem = (menuLabel: string, itemText: string) => {
  act(() => byLabel(menuLabel)!.click());
  const item = Array.from(container.querySelectorAll<HTMLElement>('[role^="menuitem"]'))
    .find(el => el.textContent?.includes(itemText));
  expect(item, `${itemText} in ${menuLabel}`).toBeTruthy();
  act(() => item!.click());
};

beforeEach(() => {
  // jsdom doesn't lay anything out, so it has no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('NoteEditor saving', () => {
  it('has no Save button: it shows Saved, then Saving while an edit waits, then Saved again', async () => {
    const onUpdate = vi.fn<Update>().mockResolvedValue(true);
    render(onUpdate);
    expect(Array.from(container.querySelectorAll('button')).some(b => b.textContent?.trim() === 'Save')).toBe(false);
    expect(status()).toContain('Saved');

    typeTitle('Lecture 4: Cell respiration');
    expect(status()).toContain('Saving');
    act(() => { vi.advanceTimersByTime(AUTOSAVE_DELAY_MS); });
    await settle();
    expect(onUpdate).toHaveBeenCalledWith(7, { title: 'Lecture 4: Cell respiration' });
    expect(status()).toContain('Saved');
  });

  it('turns a failed save into "Not saved", and clicking it saves the title and body again', async () => {
    const onUpdate = vi.fn<Update>().mockResolvedValueOnce(false).mockResolvedValue(true);
    render(onUpdate);
    typeTitle('Changed');
    act(() => { vi.advanceTimersByTime(AUTOSAVE_DELAY_MS); });
    await settle();

    const retry = byLabel('Not saved. Try saving again');
    expect(retry).not.toBeNull();
    await act(async () => { retry!.click(); });
    await settle();
    expect(onUpdate).toHaveBeenLastCalledWith(7, expect.objectContaining({ title: 'Changed', content: expect.stringContaining('ATP') }));
    expect(status()).toContain('Saved');
  });

  it('saves right away on Ctrl+S instead of opening the browser\'s save dialog', async () => {
    const onUpdate = vi.fn<Update>().mockResolvedValue(true);
    render(onUpdate);
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => { titleInput().dispatchEvent(event); });
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(onUpdate).toHaveBeenCalledWith(7, expect.objectContaining({ title: 'Lecture 4', content: expect.stringContaining('Overview') }));
  });
});

describe('NoteEditor toolbar', () => {
  it('keeps the sidebar toggle off phones, where the sidebar is already hidden', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    const toggle = byLabel('Collapse sidebar');
    expect(toggle?.parentElement?.className).toContain('hidden sm:flex');
  });

  it('turns the current line into a checklist', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    act(() => (byLabel('Checklist (Ctrl+Shift+9)') as HTMLButtonElement).click());
    expect(editorHtml()).toContain('data-type="taskList"');
  });

  it('inserts a divider and a quote from the Insert menu', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    clickMenuItem('Insert', 'Divider');
    expect(editorHtml()).toContain('<hr');
    clickMenuItem('Insert', 'Quote');
    expect(editorHtml()).toContain('<blockquote');
  });

  it('offers PDF, details, outline and focus mode on the Notes page', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    act(() => byLabel('More note actions')!.click());
    const items = Array.from(container.querySelectorAll('[role^="menuitem"]')).map(el => el.textContent);
    expect(items).toEqual(['Download PDF', 'Note details', 'Outline', 'Focus modeCtrl+Shift+F']);
  });

  it('leaves PDF and focus mode out of the home-panel overlay', () => {
    render(vi.fn<Update>().mockResolvedValue(true), false);
    act(() => byLabel('More note actions')!.click());
    const items = Array.from(container.querySelectorAll('[role^="menuitem"]')).map(el => el.textContent);
    expect(items).toEqual(['Note details', 'Outline']);
    expect(byLabel('Resources')).toBeNull();
  });

  it('lists the note\'s headings in the outline', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    clickMenuItem('More note actions', 'Outline');
    expect(byLabel('Note outline')?.textContent).toContain('Overview');
  });

  it('shows words, reading time and time in the note', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    clickMenuItem('More note actions', 'Note details');
    const details = byLabel('Note details')?.textContent ?? '';
    expect(details).toContain('Words4');
    expect(details).toContain('Reading time1 min');
    expect(details).toContain('Time in this note');
  });

  it('opens focus mode and leaves it with Escape', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    clickMenuItem('More note actions', 'Focus mode');
    expect(byLabel('More note actions')).toBeNull();
    expect(container.textContent).toContain('Leave focus');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(byLabel('More note actions')).not.toBeNull();
  });

  it('leaves focus mode on Escape typed in the note, even once the editor has marked the key handled', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    clickMenuItem('More note actions', 'Focus mode');
    // In a real browser the editor calls preventDefault on Escape before it reaches the document.
    const body = container.querySelector('.notes-editor')!;
    body.addEventListener('keydown', e => e.preventDefault());
    act(() => { body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    expect(byLabel('More note actions')).not.toBeNull();
  });
});
