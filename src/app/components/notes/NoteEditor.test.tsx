// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '@/app/types/notes';

vi.mock('@/app/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/hooks/useNoteSession', () => ({ useNoteSession: () => ({ pastSeconds: 0, visitSeconds: () => 0 }) }));

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

/** Lays the editor out at a given width; jsdom otherwise measures nothing. */
const atWidth = (width: number) => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width } as DOMRect);
};

const menuItems = (menuLabel: string) => {
  act(() => byLabel(menuLabel)!.click());
  const items = Array.from(container.querySelectorAll('[role^="menuitem"]')).map(el => el.textContent);
  act(() => byLabel(menuLabel)!.click());
  return items;
};

const formattingRow = () => container.querySelector('[role="toolbar"][aria-label="Text formatting"]');

describe('NoteEditor toolbar', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the sidebar toggle off phones, where the sidebar is already hidden', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    const toggle = byLabel('Collapse sidebar');
    expect(toggle?.parentElement?.className).toContain('hidden sm:flex');
  });

  it('puts the note in the first row and formatting in a second row, in the prototype\'s order', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    const row = formattingRow();
    expect(row?.className).toContain('overflow-x-auto');
    expect(row?.className).not.toContain('flex-wrap ');
    const labels = Array.from(row!.querySelectorAll('button')).map(b => b.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Undo (Ctrl+Z)', 'Redo (Ctrl+Shift+Z)',
      'Text style, paragraph',
      'Bold (Ctrl+B)', 'Italic (Ctrl+I)', 'Underline (Ctrl+U)', 'Strikethrough (Ctrl+Shift+S)', 'Highlight text',
      'Bulleted list (Ctrl+Shift+8)', 'Numbered list (Ctrl+Shift+7)', 'Checklist (Ctrl+Shift+9)',
      'Insert table', 'Insert image', 'Link (Ctrl+K)', 'Quote (Ctrl+Shift+B)', 'Code block (Ctrl+Alt+C)',
      'Align left (Ctrl+Shift+L)', 'Align center (Ctrl+Shift+E)', 'Align right (Ctrl+Shift+R)', 'Justify (Ctrl+Shift+J)',
    ]);
    for (const label of ['Outline', 'Focus mode (Ctrl+Shift+F)', 'Resources', 'Export', 'More note actions']) {
      expect(byLabel(label), label).not.toBeNull();
      expect(row!.contains(byLabel(label))).toBe(false);
    }
    expect(container.querySelector('.notes-editor')).not.toBeNull();
    expect(container.textContent).not.toContain('Insert');
  });

  it('shows where the note lives: its tag folder, then its title as it\'s typed', () => {
    note.tags = [{ id: 3, name: 'Biology', color: '#7FB069' }];
    try {
      render(vi.fn<Update>().mockResolvedValue(true));
      typeTitle('Lecture 5');
      const firstRow = container.querySelector('.\\@container > div')!;
      expect(firstRow.textContent).toContain('Biology/Lecture 5');
    } finally {
      note.tags = [];
    }
  });

  it('turns the current line into a checklist', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    act(() => (byLabel('Checklist (Ctrl+Shift+9)') as HTMLButtonElement).click());
    expect(editorHtml()).toContain('data-type="taskList"');
  });

  it('turns lines into a quote and a code block, and marks the button pressed', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    act(() => byLabel('Quote (Ctrl+Shift+B)')!.click());
    expect(editorHtml()).toContain('<blockquote');
    expect(byLabel('Quote (Ctrl+Shift+B)')!.getAttribute('aria-pressed')).toBe('true');
    act(() => byLabel('Quote (Ctrl+Shift+B)')!.click());
    act(() => byLabel('Code block (Ctrl+Alt+C)')!.click());
    expect(editorHtml()).toContain('<pre');
  });

  it('inserts a table from the table button\'s size grid', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    act(() => byLabel('Insert table')!.click());
    const grid = container.querySelector<HTMLElement>('[role="dialog"][aria-label="Insert table"] [role="group"]')!;
    act(() => { grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    act(() => { grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(editorHtml()).toContain('<table');
  });

  it('exports a PDF from Export, and keeps Note details in More on the Notes page', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    expect(menuItems('Export')).toEqual(['Download PDF']);
    expect(menuItems('More note actions')).toEqual(['Note details']);
  });

  it('leaves Export, focus mode and Resources out of the home-panel overlay', () => {
    render(vi.fn<Update>().mockResolvedValue(true), false);
    expect(menuItems('More note actions')).toEqual(['Note details']);
    expect(byLabel('Export')).toBeNull();
    expect(byLabel('Focus mode (Ctrl+Shift+F)')).toBeNull();
    expect(byLabel('Resources')).toBeNull();
    expect(byLabel('Outline')).not.toBeNull();
  });

  it('moves Export, Outline and Focus mode into More when the note row is narrow', () => {
    atWidth(680);
    render(vi.fn<Update>().mockResolvedValue(true));
    expect(formattingRow()).not.toBeNull();
    expect(byLabel('Export')).toBeNull();
    expect(byLabel('Outline')).toBeNull();
    expect(menuItems('More note actions')).toEqual(['Download PDF', 'Note details', 'Outline', 'Focus modeCtrl+Shift+F']);
  });

  it('keeps the phone layout: a slim top bar and formatting in a bar under the note', () => {
    atWidth(390);
    render(vi.fn<Update>().mockResolvedValue(true));
    expect(formattingRow()).toBeNull();
    const bottom = container.querySelector('[role="toolbar"][aria-label="Formatting"]');
    expect(bottom).not.toBeNull();
    expect(byLabel('Insert')).not.toBeNull();
    expect(container.textContent).not.toContain('Lecture 4/');
    expect(menuItems('More note actions')).toEqual(['Download PDF', 'Note details', 'Outline', 'Focus modeCtrl+Shift+F']);
  });

  it('lists the note\'s headings in the outline', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    act(() => byLabel('Outline')!.click());
    expect(byLabel('Outline')!.getAttribute('aria-pressed')).toBe('true');
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

  it('presses the k key on the Focus button, then opens focus mode and leaves it with Escape', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    const focus = byLabel('Focus mode (Ctrl+Shift+F)')!;
    expect(focus.querySelector('svg .kanso-key-face')).not.toBeNull();
    act(() => focus.click());
    expect(focus.className).toContain('kanso-key-press kanso-key-press-now');
    expect(byLabel('More note actions')).not.toBeNull();
    // Focus mode opens once the key springs back (jsdom never runs the animation, so the fallback).
    act(() => { vi.advanceTimersByTime(600); });
    expect(byLabel('More note actions')).toBeNull();
    expect(container.textContent).toContain('Leave focus');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(byLabel('More note actions')).not.toBeNull();
  });

  it('keeps the formatting toolbar in focus mode and hides the Focus button there', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    act(() => byLabel('Focus mode (Ctrl+Shift+F)')!.click());
    act(() => { vi.advanceTimersByTime(600); });
    expect(byLabel('Bold (Ctrl+B)')).not.toBeNull();
    expect(byLabel('Outline')).toBeNull();
    expect(byLabel('Resources')).toBeNull();
    expect(byLabel('Focus mode (Ctrl+Shift+F)')).toBeNull();
  });

  it('leaves focus mode from the Leave focus button', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    act(() => byLabel('Focus mode (Ctrl+Shift+F)')!.click());
    act(() => { vi.advanceTimersByTime(600); });
    act(() => Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Leave focus')!.click());
    expect(byLabel('More note actions')).not.toBeNull();
  });

  it('leaves focus mode on Escape typed in the note, even once the editor has marked the key handled', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    act(() => byLabel('Focus mode (Ctrl+Shift+F)')!.click());
    act(() => { vi.advanceTimersByTime(600); });
    // In a real browser the editor calls preventDefault on Escape before it reaches the document.
    const body = container.querySelector('.notes-editor')!;
    body.addEventListener('keydown', e => e.preventDefault());
    act(() => { body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    expect(byLabel('More note actions')).not.toBeNull();
  });
});
