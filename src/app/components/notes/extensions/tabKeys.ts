import type { EditorView } from '@tiptap/pm/view';

/** Nodes whose own keymaps own Tab: lists nest and lift items, tables move between cells. */
const TAB_OWNERS = new Set(['listItem', 'taskItem', 'tableCell', 'tableHeader']);

/**
 * Tab in the note body indents with four spaces, without trapping keyboard
 * users in the editor (WCAG 2.1.2):
 * - Shift+Tab is never taken, so it always moves focus back out.
 * - Escape, then Tab, moves focus on to the next control instead of indenting.
 * - Inside a list, checklist or table, Tab is left to that node's keymap.
 * - While `defer(view)` is true (e.g. the slash menu is open), Tab is left alone.
 *
 * Returns a ProseMirror `handleKeyDown` prop; each editor needs its own,
 * since it remembers whether Escape was just pressed.
 */
export function createTabKeyHandler(defer: (view: EditorView) => boolean = () => false) {
  let escaped = false;

  return (view: EditorView, event: KeyboardEvent): boolean => {
    if (event.key === 'Escape') {
      escaped = true;
      return false;
    }
    if (event.key !== 'Tab') {
      escaped = false;
      return false;
    }
    const leaving = escaped || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;
    escaped = false;
    if (leaving || defer(view)) return false;

    const { $from } = view.state.selection;
    for (let d = $from.depth; d > 0; d--) {
      if (TAB_OWNERS.has($from.node(d).type.name)) return false;
    }

    event.preventDefault();
    view.dispatch(view.state.tr.insertText('    '));
    return true;
  };
}
