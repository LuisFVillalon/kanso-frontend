'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Unlink } from 'lucide-react';
import { RING_STYLE } from './EditorToolbar';

/**
 * Turns what the user typed into a link target: web addresses get https://,
 * an email address gets mailto:. Only http(s), mailto and tel links are made;
 * anything else with a scheme (javascript:, data:, …) returns null.
 */
export function normalizeLinkHref(raw: string): string | null {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  // A scheme ("javascript:") but not a host and port ("localhost:3000").
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value)) return null;
  if (/^[^@/]+@[^@/]+\.[^@/]+$/.test(value)) return `mailto:${value}`;
  return `https://${value.replace(/^\/\//, '')}`;
}

interface LinkEditorProps {
  editor: Editor;
  onClose: () => void;
}

/**
 * Add, change or remove a link (Ctrl+K, Insert → Link, or the selection
 * menu). Opens under the cursor. With text selected it links that text;
 * with nothing selected it inserts the address itself as the link.
 */
const LinkEditor: React.FC<LinkEditorProps> = ({ editor, onClose }) => {
  const existing = (editor.getAttributes('link').href as string | undefined) ?? '';
  const [value, setValue] = useState(existing);
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [position] = useState(() => {
    const coords = editor.view.coordsAtPos(editor.state.selection.from);
    const width = 320;
    return { left: Math.max(8, Math.min(coords.left, window.innerWidth - width - 8)), top: coords.bottom + 8, width };
  });

  const close = () => {
    onClose();
    editor.commands.focus();
  };

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const handlePointerDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [onClose]);

  const apply = () => {
    if (!value.trim()) {
      if (existing) editor.chain().focus().extendMarkRange('link').unsetLink().run();
      close();
      return;
    }
    const href = normalizeLinkHref(value);
    if (!href) {
      setError('Use a web address like example.com, or an email address.');
      return;
    }
    const { empty } = editor.state.selection;
    if (empty && !editor.isActive('link')) {
      editor.chain().focus()
        .insertContent({ type: 'text', text: value.trim(), marks: [{ type: 'link', attrs: { href } }] })
        .unsetMark('link')
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    onClose();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    onClose();
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={existing ? 'Edit link' : 'Add link'}
      className="fixed z-[60] rounded-lg p-2"
      style={{
        left: position.left, top: position.top, width: position.width,
        backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)', boxShadow: 'var(--tm-shadow-md)',
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      }}
    >
      <form
        className="flex items-center gap-1.5"
        onSubmit={e => {
          e.preventDefault();
          apply();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          value={value}
          onChange={e => {
            setValue(e.target.value);
            setError('');
          }}
          placeholder="Paste or type a link"
          aria-label="Link address"
          aria-invalid={!!error}
          aria-describedby={error ? 'note-link-error' : undefined}
          className="input-field flex-1 min-w-0 h-8 py-0 px-2.5 text-sm"
        />
        <button
          type="submit"
          className="btn btn-primary h-8 py-0 px-3 shrink-0"
        >
          {existing ? 'Save' : 'Add'}
        </button>
        {existing && (
          <button
            type="button"
            onClick={remove}
            title="Remove link"
            aria-label="Remove link"
            className="flex items-center justify-center w-8 h-8 rounded-md shrink-0 outline-none focus-visible:ring-2 text-[var(--tm-text-secondary)] hover:bg-[var(--tm-surface)]"
            style={RING_STYLE}
          >
            <Unlink className="w-4 h-4" />
          </button>
        )}
      </form>
      {error && (
        <p id="note-link-error" className="text-xs mt-1.5 px-0.5" style={{ color: 'var(--tm-danger)' }}>{error}</p>
      )}
    </div>
  );
};

export default LinkEditor;
