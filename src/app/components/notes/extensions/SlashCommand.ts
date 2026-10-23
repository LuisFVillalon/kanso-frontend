import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';

// ─── Commands ─────────────────────────────────────────────────────────────────

export type SlashIcon =
  | 'text' | 'h1' | 'h2' | 'h3' | 'checklist' | 'bullet' | 'ordered'
  | 'table' | 'quote' | 'code' | 'divider' | 'image';

export interface SlashItem {
  id: string;
  title: string;
  description: string;
  icon: SlashIcon;
  /** Extra words the filter matches, e.g. "todo" for Checklist. */
  keywords: string[];
  run: (editor: Editor, range: Range, actions: SlashActions) => void;
}

/** What a slash command needs from outside the editor. */
export interface SlashActions {
  pickImage: () => void;
}

const block = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

export const SLASH_ITEMS: SlashItem[] = [
  { id: 'text', title: 'Text', description: 'Plain paragraph', icon: 'text', keywords: ['paragraph', 'p'],
    run: (e, r) => block(e, r).setParagraph().run() },
  { id: 'h1', title: 'Heading 1', description: 'Big section title', icon: 'h1', keywords: ['title', 'h1'],
    run: (e, r) => block(e, r).setHeading({ level: 1 }).run() },
  { id: 'h2', title: 'Heading 2', description: 'Medium section title', icon: 'h2', keywords: ['subtitle', 'h2'],
    run: (e, r) => block(e, r).setHeading({ level: 2 }).run() },
  { id: 'h3', title: 'Heading 3', description: 'Small section title', icon: 'h3', keywords: ['h3'],
    run: (e, r) => block(e, r).setHeading({ level: 3 }).run() },
  { id: 'checklist', title: 'Checklist', description: 'Tick things off', icon: 'checklist', keywords: ['todo', 'task', 'checkbox'],
    run: (e, r) => block(e, r).toggleTaskList().run() },
  { id: 'bullet', title: 'Bulleted list', description: 'A simple list', icon: 'bullet', keywords: ['ul', 'unordered'],
    run: (e, r) => block(e, r).toggleBulletList().run() },
  { id: 'ordered', title: 'Numbered list', description: 'Steps in order', icon: 'ordered', keywords: ['ol', 'ordered'],
    run: (e, r) => block(e, r).toggleOrderedList().run() },
  { id: 'table', title: 'Table', description: '3 × 3 grid', icon: 'table', keywords: ['grid'],
    run: (e, r) => block(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: 'quote', title: 'Quote', description: 'Set a passage apart', icon: 'quote', keywords: ['blockquote', 'citation'],
    run: (e, r) => block(e, r).setBlockquote().run() },
  { id: 'code', title: 'Code block', description: 'Monospace, keeps spacing', icon: 'code', keywords: ['pre', 'snippet'],
    run: (e, r) => block(e, r).setCodeBlock().run() },
  { id: 'divider', title: 'Divider', description: 'A ruled line', icon: 'divider', keywords: ['hr', 'line', 'rule'],
    run: (e, r) => block(e, r).setHorizontalRule().run() },
  { id: 'image', title: 'Image', description: 'Upload from your device', icon: 'image', keywords: ['picture', 'photo'],
    run: (e, r, actions) => { block(e, r).run(); actions.pickImage(); } },
];

/** The commands whose title or keywords start with a word of `query` (case-insensitive). */
export function filterSlashItems(query: string, items: SlashItem[] = SLASH_ITEMS): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(item =>
    [item.title, ...item.keywords].some(word =>
      word.toLowerCase().split(/\s+/).some(part => part.startsWith(q)) || word.toLowerCase().startsWith(q),
    ),
  );
}

// ─── Menu state (read by SlashMenu through useSyncExternalStore) ───────────────

export interface SlashMenuState {
  open: boolean;
  items: SlashItem[];
  index: number;
  /** Where the typed "/" sits on screen, for placing the menu. */
  rect: DOMRect | null;
}

const CLOSED: SlashMenuState = { open: false, items: [], index: 0, rect: null };

/** A tiny store between the ProseMirror suggestion plugin and the React menu. */
export function createSlashMenuStore() {
  let state = CLOSED;
  let choose: ((item: SlashItem) => void) | null = null;
  let actions: SlashActions = { pickImage: () => {} };
  const listeners = new Set<() => void>();
  const set = (next: SlashMenuState) => {
    state = next;
    listeners.forEach(l => l());
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: () => state,
    /** What commands like Image need from the page; set by the editor's owner. */
    get actions() { return actions; },
    setActions(next: SlashActions) {
      actions = next;
    },
    show(props: SuggestionProps<SlashItem, SlashItem>) {
      choose = item => props.command(item);
      const index = state.open ? Math.min(state.index, Math.max(props.items.length - 1, 0)) : 0;
      set({ open: true, items: props.items, index, rect: props.clientRect?.() ?? null });
    },
    hide() {
      choose = null;
      set(CLOSED);
    },
    highlight(index: number) {
      if (state.open) set({ ...state, index });
    },
    choose(item: SlashItem) {
      choose?.(item);
    },
    /** Arrow keys move the highlight, Enter or Tab picks it, Escape closes. */
    onKeyDown({ event }: SuggestionKeyDownProps): boolean {
      if (!state.open) return false;
      const count = state.items.length;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (count === 0) return true;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        set({ ...state, index: (state.index + step + count) % count });
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = state.items[state.index];
        if (!item) return false;
        choose?.(item);
        return true;
      }
      if (event.key === 'Escape') {
        this.hide();
        return true;
      }
      return false;
    },
  };
}

export type SlashMenuStore = ReturnType<typeof createSlashMenuStore>;

// ─── Extension ────────────────────────────────────────────────────────────────

interface SlashCommandOptions {
  store: SlashMenuStore | null;
}

export const slashCommandPluginKey = new PluginKey('slashCommand');

/**
 * Type "/" at the start of a line (or after a space) to insert a block:
 * headings, lists, a checklist, table, quote, code, divider or image.
 * Typing after the slash filters the list. Not offered inside code blocks.
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return { store: null };
  },

  addProseMirrorPlugins() {
    const { store } = this.options;
    if (!store) return [];
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: slashCommandPluginKey,
        char: '/',
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => props.run(editor, range, store.actions),
        render: () => ({
          onStart: props => store.show(props),
          onUpdate: props => store.show(props),
          onExit: () => store.hide(),
          onKeyDown: props => store.onKeyDown(props),
        }),
      }),
    ];
  },
});
