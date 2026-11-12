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
import { DEFAULT_HIGHLIGHT_COLOR, setHighlightColor } from './highlightColor';
import type { Editor } from '@tiptap/react';

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

const render = (onUpdate: Update, extended = true, showExport = extended) =>
  act(() => root.render(
    <ToastProvider>
      <NoteEditor note={note} allTags={[]} onUpdate={onUpdate} onToggleSidebar={vi.fn()} showExtendedActions={extended} showExport={showExport} />
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

const GREEN = '#bbf7d0';
const BLUE = '#bae6fd';

/** The Tiptap editor behind the rendered note. */
const tiptap = () => (container.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor;

/** Selects a word of the note's body, "Cells make ATP." */
const selectWord = (word: string) => act(() => {
  const editor = tiptap();
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    const at = node.isText ? node.text!.indexOf(word) : -1;
    if (from < 0 && at >= 0) from = pos + at;
  });
  editor.commands.setTextSelection({ from, to: from + word.length });
});

/** The highlight color on a word, or undefined when it isn't highlighted. */
const highlightOn = (word: string) => Array.from(container.querySelectorAll('.notes-editor mark'))
  .find(mark => mark.textContent === word)?.getAttribute('data-color') ?? undefined;

const pickHighlightColor = (label: string) => {
  act(() => byLabel('Highlight color')!.click());
  act(() => container.querySelector<HTMLElement>(`[role="menuitemradio"][aria-label="${label}"]`)!.click());
};

const checkedHighlightColor = () => {
  act(() => byLabel('Highlight color')!.click());
  const checked = container.querySelector('[role="menuitemradio"][aria-checked="true"]')?.getAttribute('aria-label');
  act(() => byLabel('Highlight color')!.click());
  return checked;
};

describe('NoteEditor highlighter', () => {
  afterEach(() => setHighlightColor(DEFAULT_HIGHLIGHT_COLOR));

  it('keeps the last color picked for the next highlight, until another color is picked', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    selectWord('Cells');
    pickHighlightColor('Green');
    expect(highlightOn('Cells')).toBe(GREEN);

    selectWord('make');
    act(() => byLabel('Highlight text')!.click());
    expect(highlightOn('make')).toBe(GREEN);
    selectWord('ATP');
    act(() => byLabel('Highlight text')!.click());
    expect(highlightOn('ATP')).toBe(GREEN);
    expect(checkedHighlightColor()).toBe('Green');
    expect(container.querySelector<HTMLElement>('[data-highlight-swatch]')!.style.backgroundColor).toBe('rgb(187, 247, 208)');

    selectWord('Overview');
    pickHighlightColor('Blue');
    expect(highlightOn('Overview')).toBe(BLUE);
    selectWord('ATP');
    act(() => byLabel('Highlight text')!.click());
    expect(highlightOn('ATP')).toBe(BLUE);
    expect(highlightOn('make')).toBe(GREEN);
    expect(checkedHighlightColor()).toBe('Blue');
  });

  it('starts on yellow and keeps the picked color for the next note opened', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    expect(checkedHighlightColor()).toBe('Yellow');
    pickHighlightColor('Green');

    act(() => root.unmount());
    root = createRoot(container);
    render(vi.fn<Update>().mockResolvedValue(true));
    expect(checkedHighlightColor()).toBe('Green');
    selectWord('Cells');
    act(() => byLabel('Highlight text')!.click());
    expect(highlightOn('Cells')).toBe(GREEN);
  });

  it('takes the highlight off with the highlighter, or with Remove highlight, and keeps the color', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    selectWord('Cells');
    pickHighlightColor('Green');
    act(() => byLabel('Highlight text')!.click());
    expect(highlightOn('Cells')).toBeUndefined();

    act(() => byLabel('Highlight text')!.click());
    expect(highlightOn('Cells')).toBe(GREEN);
    act(() => byLabel('Highlight color')!.click());
    act(() => byLabel('Remove highlight')!.click());
    expect(highlightOn('Cells')).toBeUndefined();
    expect(checkedHighlightColor()).toBe('Green');
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
    expect(byLabel('More formatting')).toBeNull();
    const labels = Array.from(row!.querySelectorAll('button')).map(b => b.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Undo (Ctrl+Z)', 'Redo (Ctrl+Shift+Z)',
      'Text style, paragraph',
      'Bold (Ctrl+B)', 'Italic (Ctrl+I)', 'Underline (Ctrl+U)', 'Strikethrough (Ctrl+Shift+S)', 'Highlight text', 'Highlight color',
      'Bulleted list (Ctrl+Shift+8)', 'Numbered list (Ctrl+Shift+7)', 'Checklist (Ctrl+Shift+9)',
      'Insert table', 'Insert image', 'Link (Ctrl+K)', 'Quote (Ctrl+Shift+B)', 'Code block (Ctrl+Alt+C)', 'Divider',
      'Align left (Ctrl+Shift+L)', 'Align center (Ctrl+Shift+E)', 'Align right (Ctrl+Shift+R)', 'Justify (Ctrl+Shift+J)',
      'Keyboard shortcuts',
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

  it('inserts the same divider as the "/" menu\'s Divider from the toolbar', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    expect(editorHtml()).not.toContain('<hr');
    act(() => byLabel('Divider')!.click());
    expect(editorHtml()).toContain('<hr');
  });

  describe('keyboard shortcuts', () => {
    const panel = () => container.querySelector<HTMLElement>('[role="dialog"][aria-label="Keyboard shortcuts"]');
    const rows = () => Array.from(panel()!.querySelectorAll('li')).map(li => [
      li.firstChild?.textContent, li.querySelector('kbd')?.textContent,
    ]);
    const trigger = () => byLabel('Keyboard shortcuts') as HTMLButtonElement;

    it('lists the toolbar\'s shortcuts with Ctrl, and closes on a second click, Escape or an outside click', () => {
      render(vi.fn<Update>().mockResolvedValue(true));
      expect(panel()).toBeNull();
      act(() => trigger().click());
      expect(trigger().getAttribute('aria-expanded')).toBe('true');
      expect(rows()).toEqual(expect.arrayContaining([
        ['Bold', 'Ctrl+B'], ['Italic', 'Ctrl+I'], ['Underline', 'Ctrl+U'],
        ['Strikethrough', 'Ctrl+Shift+S'], ['Highlight', 'Ctrl+Shift+H'],
        ['Heading 1–5', 'Ctrl+Alt+1–5'], ['Link', 'Ctrl+K'], ['Code block', 'Ctrl+Alt+C'],
        ['Align center', 'Ctrl+Shift+E'], ['Redo', 'Ctrl+Shift+Z'],
      ]));
      // The divider has no key binding, so it isn't listed.
      expect(rows().some(([label]) => label === 'Divider')).toBe(false);

      act(() => trigger().click());
      expect(panel()).toBeNull();

      act(() => trigger().click());
      act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(panel()).toBeNull();

      act(() => trigger().click());
      act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
      expect(panel()).toBeNull();
    });

    it('shows Cmd and Option on a Mac', () => {
      Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
      try {
        render(vi.fn<Update>().mockResolvedValue(true));
        act(() => trigger().click());
        expect(rows()).toEqual(expect.arrayContaining([
          ['Bold', 'Cmd+B'], ['Italic', 'Cmd+I'], ['Underline', 'Cmd+U'],
          ['Strikethrough', 'Cmd+Shift+S'], ['Highlight', 'Cmd+Shift+H'], ['Code block', 'Cmd+Option+C'],
        ]));
      } finally {
        delete (navigator as unknown as Record<string, unknown>).platform;
      }
    });

    it('opens on hover until the pointer leaves, and on keyboard focus until focus moves on', () => {
      render(vi.fn<Update>().mockResolvedValue(true));
      const wrapper = trigger().parentElement!;
      act(() => { wrapper.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })); });
      expect(panel()).not.toBeNull();
      act(() => { wrapper.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })); });
      expect(panel()).not.toBeNull();
      act(() => vi.advanceTimersByTime(200));
      expect(panel()).toBeNull();

      act(() => trigger().focus());
      expect(panel()).not.toBeNull();
      act(() => trigger().blur());
      expect(panel()).toBeNull();
    });
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

  it('keeps Export but leaves focus mode and Resources out of the home-panel note', () => {
    render(vi.fn<Update>().mockResolvedValue(true), false, true);
    expect(menuItems('More note actions')).toEqual(['Note details']);
    expect(menuItems('Export')).toEqual(['Download PDF']);
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

  it('folds the formatting groups that don\'t fit into More formatting, last first, instead of clipping them', () => {
    // Each group lays out 100px wide in a 300px row: room for two groups and the ⋯ button.
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-tool-group') ? 100 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.querySelector(':scope > [data-tool-group]') ? 300 : 0;
    });
    render(vi.fn<Update>().mockResolvedValue(true));
    const row = formattingRow()!;
    expect(row.querySelectorAll('[data-tool-group]')).toHaveLength(2);
    expect(row.contains(byLabel('Undo (Ctrl+Z)'))).toBe(true);
    expect(byLabel('Bold (Ctrl+B)')).toBeNull();

    act(() => byLabel('More formatting')!.click());
    const folded = container.querySelector('[role="group"][aria-label="More formatting"]')!;
    for (const label of ['Bold (Ctrl+B)', 'Checklist (Ctrl+Shift+9)', 'Insert image', 'Justify (Ctrl+Shift+J)']) {
      expect(folded.contains(byLabel(label)), label).toBe(true);
    }
    act(() => (byLabel('Bold (Ctrl+B)') as HTMLButtonElement).click());
    expect(byLabel('Bold (Ctrl+B)')!.getAttribute('aria-pressed')).toBe('true');
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
    // The logo's k, in the button's ink: no key red.
    expect(focus.querySelector('svg path')!.getAttribute('fill')).toBe('currentColor');
    expect(focus.innerHTML).not.toContain('--kanso-key');
    act(() => focus.click());
    expect(focus.className).toContain('key-press-play');
    expect(byLabel('More note actions')).not.toBeNull();
    // Focus mode opens once the key springs back (jsdom never runs the animation, so the fallback).
    act(() => { vi.advanceTimersByTime(600); });
    expect(byLabel('More note actions')).toBeNull();
    expect(byLabel('Leave focus')).not.toBeNull();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(byLabel('More note actions')).not.toBeNull();
  });

  it('keeps the formatting toolbar and note tools in focus mode and hides the Focus button there', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    act(() => byLabel('Focus mode (Ctrl+Shift+F)')!.click());
    act(() => { vi.advanceTimersByTime(600); });
    expect(byLabel('Bold (Ctrl+B)')).not.toBeNull();
    expect(byLabel('Outline')).not.toBeNull();
    expect(byLabel('Resources')).not.toBeNull();
    expect(byLabel('Export')).not.toBeNull();
    expect(container.querySelector('[title="Words, reading time and time spent"]')).not.toBeNull();
    expect(byLabel('More note actions')).toBeNull();
    expect(byLabel('Focus mode (Ctrl+Shift+F)')).toBeNull();
  });

  it('keeps the note tools in focus mode on a narrow window, where there is no More menu', () => {
    atWidth(680);
    render(vi.fn<Update>().mockResolvedValue(true));
    clickMenuItem('More note actions', 'Focus mode');
    act(() => { vi.advanceTimersByTime(600); });
    expect(byLabel('Outline')).not.toBeNull();
    expect(byLabel('Export')).not.toBeNull();
  });

  it.each([390, 320])('folds the note tools into More in focus mode at %ipx, keeping Resources and Leave', width => {
    atWidth(width);
    render(vi.fn<Update>().mockResolvedValue(true));
    clickMenuItem('More note actions', 'Focus mode');
    act(() => { vi.advanceTimersByTime(600); });
    expect(byLabel('Outline')).toBeNull();
    expect(byLabel('Export')).toBeNull();
    expect(container.querySelector('[title="Words, reading time and time spent"]')).toBeNull();
    expect(byLabel('Resources')).not.toBeNull();
    expect(byLabel('Leave focus')).not.toBeNull();
    expect(menuItems('More note actions')).toEqual(['Download PDF', 'Note details', 'Outline']);
  });

  const pressEscape = () => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });

  it('closes the note details on Escape before leaving focus mode', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    act(() => byLabel('Focus mode (Ctrl+Shift+F)')!.click());
    act(() => { vi.advanceTimersByTime(600); });
    act(() => container.querySelector<HTMLElement>('[title="Words, reading time and time spent"]')!.click());
    expect(byLabel('Note details')).not.toBeNull();
    pressEscape();
    expect(byLabel('Note details')).toBeNull();
    expect(byLabel('Leave focus')).not.toBeNull();
    pressEscape();
    expect(byLabel('Leave focus')).toBeNull();
  });

  it('closes the note details opened from More on a phone before leaving focus mode', () => {
    atWidth(390);
    render(vi.fn<Update>().mockResolvedValue(true));
    clickMenuItem('More note actions', 'Focus mode');
    act(() => { vi.advanceTimersByTime(600); });
    clickMenuItem('More note actions', 'Note details');
    expect(byLabel('Note details')).not.toBeNull();
    pressEscape();
    expect(byLabel('Note details')).toBeNull();
    expect(byLabel('Leave focus')).not.toBeNull();
  });

  it('closes the Export menu on Escape before leaving focus mode', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    act(() => byLabel('Focus mode (Ctrl+Shift+F)')!.click());
    act(() => { vi.advanceTimersByTime(600); });
    act(() => byLabel('Export')!.click());
    expect(byLabel('Export')!.getAttribute('aria-expanded')).toBe('true');
    pressEscape();
    expect(byLabel('Export')!.getAttribute('aria-expanded')).toBe('false');
    expect(byLabel('Leave focus')).not.toBeNull();
  });

  it('opens the Outline panel and the note details in focus mode', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    act(() => byLabel('Focus mode (Ctrl+Shift+F)')!.click());
    act(() => { vi.advanceTimersByTime(600); });
    act(() => byLabel('Outline')!.click());
    expect(byLabel('Close outline')!.closest<HTMLElement>('.shrink-0.border-l')!.style.width).toBe('260px');
    act(() => container.querySelector<HTMLElement>('[title="Words, reading time and time spent"]')!.click());
    expect(container.querySelector('[title="Words, reading time and time spent"]')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('leaves focus mode from the X and k button, which has no text', () => {
    render(vi.fn<Update>().mockResolvedValue(true));
    act(() => byLabel('Focus mode (Ctrl+Shift+F)')!.click());
    act(() => { vi.advanceTimersByTime(600); });
    const leave = byLabel('Leave focus')!;
    expect(leave.textContent).toBe('');
    const [x, k] = leave.querySelectorAll('svg');
    expect(x.classList.contains('lucide-x')).toBe(true);
    expect(k.querySelector('path')!.getAttribute('fill')).toBe('currentColor');
    expect(container.textContent).not.toContain('Leave focus');
    act(() => leave.click());
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
