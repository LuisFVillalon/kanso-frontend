'use client';

import React, { useCallback } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { NodeSelection, PluginKey } from '@tiptap/pm/state';
import { Bold, ExternalLink, Highlighter, Italic, Link2, Pencil, Strikethrough, Underline, Unlink } from 'lucide-react';
import { HIGHLIGHT_COLORS, RING_STYLE, ToolbarButton } from './EditorToolbar';

const YELLOW = HIGHLIGHT_COLORS[0].color;

/**
 * A solid raised surface with a hairline border and a soft shadow, so text
 * under the menu never shows through; isolate keeps the editor's own
 * positioned content (images, tables) from painting over it.
 */
const SELECTION_MENU_CLASS = 'isolate z-40 flex items-center gap-0.5 p-1 rounded-lg bg-surface-raised border border-border shadow-[var(--tm-shadow-lg)]';

export const selectionMenuPluginKey = new PluginKey('noteSelectionMenu');

/** Re-places the selection menu after the page around the editor moves (focus mode, a side panel). */
export const repositionSelectionMenu = (editor: Editor) => {
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(selectionMenuPluginKey, 'updatePosition'));
};

interface NoteSelectionMenuProps {
  editor: Editor;
  onEditLink: () => void;
  /** True while the link editor is open; the menu stays out of its way. */
  linkEditorOpen: boolean;
}

/**
 * Appears over selected text: bold, italic, underline, strikethrough,
 * highlight and link. With the cursor inside a link and nothing selected,
 * it shows the link instead, with Open, Edit and Remove.
 */
const NoteSelectionMenu: React.FC<NoteSelectionMenuProps> = ({ editor, onEditLink, linkEditorOpen }) => {

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      empty: e.state.selection.empty,
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      link: e.isActive('link'),
      href: (e.getAttributes('link').href as string | undefined) ?? '',
    }),
  });

  const shouldShow = useCallback(({ editor: e, state: s, from, to }: { editor: Editor; state: Editor['state']; from: number; to: number }) => {
    if (!e.isEditable || linkEditorOpen || !e.view.hasFocus()) return false;
    if (s.selection instanceof NodeSelection) return false;
    if (s.selection.empty) return e.isActive('link');
    return s.doc.textBetween(from, to, ' ').trim().length > 0;
  }, [linkEditorOpen]);

  const linkView = state.empty && state.link;

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={selectionMenuPluginKey}
      shouldShow={shouldShow}
      className={SELECTION_MENU_CLASS}
      role="toolbar"
      aria-label={linkView ? 'Link' : 'Selected text'}
    >
      {linkView ? (
        <>
          <a
            href={state.href}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${state.href} in a new tab`}
            className="flex items-center gap-1.5 h-8 px-2 rounded-md text-sm max-w-[16rem] outline-none focus-visible:ring-2 hover:bg-[var(--tm-surface)]"
            style={{ ...RING_STYLE, color: 'var(--tm-accent)' }}
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{state.href.replace(/^(https?:\/\/|mailto:)/i, '')}</span>
          </a>
          <ToolbarButton toggle={false} title="Edit link (Ctrl+K)" onClick={onEditLink}>
            <Pencil className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            toggle={false}
            title="Remove link"
            onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
          >
            <Unlink className="w-4 h-4" />
          </ToolbarButton>
        </>
      ) : (
        <>
          <ToolbarButton title="Bold" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Italic" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Underline" active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <Underline className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Strikethrough (Ctrl+Shift+S)" active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            title={state.highlight ? 'Remove highlight' : 'Highlight'}
            active={state.highlight}
            onClick={() => (state.highlight
              ? editor.chain().focus().unsetHighlight().run()
              : editor.chain().focus().setHighlight({ color: YELLOW }).run())}
          >
            <Highlighter className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton title="Link (Ctrl+K)" active={state.link} onClick={onEditLink}>
            <Link2 className="w-4 h-4" />
          </ToolbarButton>
        </>
      )}
    </BubbleMenu>
  );
};

export default NoteSelectionMenu;
