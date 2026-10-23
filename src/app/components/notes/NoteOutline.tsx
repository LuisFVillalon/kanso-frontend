'use client';

import React from 'react';
import { useEditorState, type Editor } from '@tiptap/react';

export interface OutlineHeading {
  level: number;
  text: string;
  /** Document position of the heading node. */
  pos: number;
}

/** The note's headings, in order. */
export function collectHeadings(editor: Editor): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({ level: Number(node.attrs.level) || 1, text: node.textContent.trim(), pos });
      return false;
    }
    return true;
  });
  return headings;
}

/**
 * The Outline panel's body: every heading in the note, indented by level.
 * Clicking one puts the cursor in it and scrolls it to the top.
 */
const NoteOutline: React.FC<{ editor: Editor | null }> = ({ editor }) => {
  const headings = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? collectHeadings(e) : []),
  }) ?? [];

  const jumpTo = (heading: OutlineHeading) => {
    if (!editor) return;
    editor.chain().focus().setTextSelection(heading.pos + 1).run();
    const dom = editor.view.nodeDOM(heading.pos);
    if (dom instanceof HTMLElement) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      dom.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    }
  };

  if (headings.length === 0) {
    return (
      <p className="px-4 py-6 text-sm" style={{ color: 'var(--tm-text-muted)' }}>
        Add a heading and it shows up here.
      </p>
    );
  }

  const topLevel = Math.min(...headings.map(h => h.level));
  return (
    <nav aria-label="Note outline" className="px-2 py-2 flex flex-col">
      {headings.map(heading => (
        <button
          key={heading.pos}
          type="button"
          onClick={() => jumpTo(heading)}
          className="w-full text-left text-sm rounded-md py-1.5 pr-2 truncate transition-colors hover:bg-[var(--tm-surface)]"
          style={{
            paddingLeft: `${0.625 + (heading.level - topLevel) * 0.875}rem`,
            color: heading.level === topLevel ? 'var(--tm-text-primary)' : 'var(--tm-text-secondary)',
            fontWeight: heading.level === topLevel ? 600 : 400,
          }}
        >
          {heading.text || 'Untitled heading'}
        </button>
      ))}
    </nav>
  );
};

export default NoteOutline;
