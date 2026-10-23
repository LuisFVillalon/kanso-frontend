'use client';

import React, { useCallback, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { NodeSelection, PluginKey } from '@tiptap/pm/state';
import { Bold, ExternalLink, Highlighter, Italic, Link2, Pencil, SquareCheckBig, Strikethrough, Underline, Unlink } from 'lucide-react';
import { useTasksContext } from '@/app/context/TasksContext';
import { useToast } from '@/app/context/ToastContext';
import type { BaseTaskForm, Tag } from '@/app/types/task';
import { HIGHLIGHT_COLORS, RING_STYLE, ToolbarButton } from './EditorToolbar';

/** A task title, not a paragraph: longer selections keep the full text in the description. */
export const TASK_FROM_NOTE_TITLE_MAX = 120;

/** The task "Add task" creates from selected note text, tagged like the note. */
export function taskFromSelection(text: string, tags: Tag[]): BaseTaskForm {
  const clean = text.replace(/\s+/g, ' ').trim();
  const long = clean.length > TASK_FROM_NOTE_TITLE_MAX;
  const title = long ? `${clean.slice(0, TASK_FROM_NOTE_TITLE_MAX - 1).trimEnd()}…` : clean;
  return {
    id: 0,
    title,
    description: long ? clean : '',
    priority: null,
    due_date: null,
    due_time: null,
    tags,
    category: null,
    estimated_time: null,
    reminder_minutes: null,
    created_date: new Date(),
  };
}

const YELLOW = HIGHLIGHT_COLORS[0].color;

export const selectionMenuPluginKey = new PluginKey('noteSelectionMenu');

/** Re-places the selection menu after the page around the editor moves (focus mode, a side panel). */
export const repositionSelectionMenu = (editor: Editor) => {
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(selectionMenuPluginKey, 'updatePosition'));
};

interface NoteSelectionMenuProps {
  editor: Editor;
  noteTags: Tag[];
  onEditLink: () => void;
  /** True while the link editor is open; the menu stays out of its way. */
  linkEditorOpen: boolean;
}

/**
 * Appears over selected text: bold, italic, underline, strikethrough,
 * highlight, link, and "Add task", which turns the selection into a kanso
 * task (Undo on the toast). With the cursor inside a link and nothing
 * selected, it shows the link instead, with Open, Edit and Remove.
 */
const NoteSelectionMenu: React.FC<NoteSelectionMenuProps> = ({ editor, noteTags, onEditLink, linkEditorOpen }) => {
  const { addTask, discardTask } = useTasksContext();
  const showToast = useToast();
  const [adding, setAdding] = useState(false);

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

  const addSelectionAsTask = async () => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, ' ');
    if (!text.trim() || adding) return;
    setAdding(true);
    try {
      const created = await addTask(taskFromSelection(text, noteTags));
      if (!created) return;
      showToast(`Added "${created.title}" to your tasks.`, 'success', {
        label: 'Undo',
        onClick: () => { void discardTask(created); },
      });
    } finally {
      setAdding(false);
    }
  };

  const linkView = state.empty && state.link;

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={selectionMenuPluginKey}
      shouldShow={shouldShow}
      className="flex items-center gap-0.5 p-1 rounded-lg z-40"
      style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)', boxShadow: 'var(--tm-shadow-md)' }}
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
          <div role="separator" aria-orientation="vertical" className="w-px h-5 mx-1 shrink-0 bg-[var(--tm-border)]" />
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={addSelectionAsTask}
            disabled={adding}
            title="Add the selected text to your tasks"
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 hover:bg-[var(--tm-accent-subtle)] disabled:opacity-60 disabled:cursor-wait"
            style={{ ...RING_STYLE, color: 'var(--tm-accent)' }}
          >
            <SquareCheckBig className="w-4 h-4" aria-hidden="true" />
            Add task
          </button>
        </>
      )}
    </BubbleMenu>
  );
};

export default NoteSelectionMenu;
