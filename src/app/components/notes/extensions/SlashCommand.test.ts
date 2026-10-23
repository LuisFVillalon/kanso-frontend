// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { SLASH_ITEMS, createSlashMenuStore, filterSlashItems, type SlashItem } from './SlashCommand';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const ids = (items: SlashItem[]) => items.map(i => i.id);
const item = (id: string) => SLASH_ITEMS.find(i => i.id === id)!;

describe('filterSlashItems', () => {
  it('lists every block for an empty query', () => {
    expect(filterSlashItems('')).toHaveLength(SLASH_ITEMS.length);
  });

  it('matches titles and keywords by their start, ignoring case', () => {
    expect(ids(filterSlashItems('che'))).toEqual(['checklist']);
    expect(ids(filterSlashItems('TODO'))).toEqual(['checklist']);
    expect(ids(filterSlashItems('head'))).toEqual(['h1', 'h2', 'h3']);
    expect(ids(filterSlashItems('list'))).toEqual(['bullet', 'ordered']);
    expect(filterSlashItems('zzz')).toEqual([]);
  });
});

describe('slash commands', () => {
  const run = (id: string, html: string, pickImage = vi.fn()) => {
    editor = new Editor({ extensions: [StarterKit, TaskList, TaskItem, TableKit], content: html });
    // The "/che" typed at the start of the only paragraph.
    item(id).run(editor, { from: 1, to: 5 }, { pickImage });
    return editor;
  };

  it('replaces the typed "/query" with a checklist', () => {
    const e = run('checklist', '<p>/che</p>');
    expect((e.getJSON() as JSONContent).content?.[0].type).toBe('taskList');
    expect(e.getText()).not.toContain('/che');
  });

  it('inserts a 3 × 3 table with a header row', () => {
    const e = run('table', '<p>/tab</p>');
    const table = (e.getJSON() as JSONContent).content?.find(n => n.type === 'table');
    expect(table?.content).toHaveLength(3);
    expect(table?.content?.[0].content?.[0].type).toBe('tableHeader');
  });

  it('turns the line into a heading', () => {
    const e = run('h2', '<p>/hea</p>');
    expect((e.getJSON() as JSONContent).content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
  });

  it('asks the page for an image file', () => {
    const pickImage = vi.fn();
    run('image', '<p>/ima</p>', pickImage);
    expect(pickImage).toHaveBeenCalledTimes(1);
  });
});

describe('slash menu store', () => {
  const props = (items: SlashItem[], command = vi.fn()) =>
    ({ items, command, clientRect: () => new DOMRect(10, 20, 0, 16) }) as unknown as SuggestionProps<SlashItem, SlashItem>;
  const key = (k: string) => ({ event: new KeyboardEvent('keydown', { key: k }) }) as SuggestionKeyDownProps;

  it('moves the highlight with the arrow keys, wrapping around', () => {
    const store = createSlashMenuStore();
    store.show(props(SLASH_ITEMS.slice(0, 3)));
    expect(store.getSnapshot().index).toBe(0);
    expect(store.onKeyDown(key('ArrowUp'))).toBe(true);
    expect(store.getSnapshot().index).toBe(2);
    store.onKeyDown(key('ArrowDown'));
    expect(store.getSnapshot().index).toBe(0);
  });

  it('picks the highlighted block with Enter or Tab', () => {
    const store = createSlashMenuStore();
    const command = vi.fn();
    store.show(props(SLASH_ITEMS.slice(0, 3), command));
    store.onKeyDown(key('ArrowDown'));
    expect(store.onKeyDown(key('Enter'))).toBe(true);
    expect(command).toHaveBeenCalledWith(SLASH_ITEMS[1]);
    expect(store.onKeyDown(key('Tab'))).toBe(true);
    expect(command).toHaveBeenCalledTimes(2);
  });

  it('closes on Escape and ignores keys while closed', () => {
    const store = createSlashMenuStore();
    store.show(props(SLASH_ITEMS));
    expect(store.onKeyDown(key('Escape'))).toBe(true);
    expect(store.getSnapshot().open).toBe(false);
    expect(store.onKeyDown(key('Enter'))).toBe(false);
  });

  it('keeps the highlight in range as the list narrows', () => {
    const store = createSlashMenuStore();
    store.show(props(SLASH_ITEMS));
    store.highlight(8);
    store.show(props(SLASH_ITEMS.slice(0, 2)));
    expect(store.getSnapshot().index).toBe(1);
  });
});
