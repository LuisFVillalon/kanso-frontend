'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useToast } from '@/app/context/ToastContext';
import { IMAGE_TOO_LARGE_MESSAGE, MAX_IMAGE_BYTES } from './imageLimits';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight,
  Bold, ChevronDown, Highlighter, Image as ImageIcon, Italic, List, ListOrdered,
  PanelLeftClose, PanelLeftOpen, Table as TableIcon, Underline, X,
} from 'lucide-react';

// ─── Heading levels ──────────────────────────────────────────────────────────

const HEADING_LEVELS = [1, 2, 3, 4, 5] as const;
type HeadingLevel = (typeof HEADING_LEVELS)[number];

// ─── Table picker grid ────────────────────────────────────────────────────────

const TABLE_MAX = 20;
const TABLE_MIN_GRID = 8;

// ─── Constants ────────────────────────────────────────────────────────────────

const HIGHLIGHT_COLORS = [
  { color: '#fef08a', label: 'Yellow' },
  { color: '#bbf7d0', label: 'Green' },
  { color: '#bae6fd', label: 'Blue' },
  { color: '#fbcfe8', label: 'Pink' },
  { color: '#fed7aa', label: 'Orange' },
] as const;

/** Focus ring tokens, scoped to controls sitting on the raised toolbar/popover surface. */
const RING_STYLE = {
  '--tw-ring-color': 'var(--tm-accent)',
  '--tw-ring-offset-color': 'var(--tm-surface-raised)',
} as React.CSSProperties;

/** Black outline that frames an active/toggled control so selection reads clearly against the accent tint. */
const ACTIVE_OUTLINE_STYLE: React.CSSProperties = {
  outline: '2px solid #000000',
  outlineOffset: '-2px',
};

interface ToolbarAction {
  key: string;
  icon: React.ReactNode;
  title: string;
  onClick: (editor: Editor) => void;
  isActive: (editor: Editor) => boolean;
}

const TOOLBAR_GROUPS: ToolbarAction[][] = [
  [
    {
      key: 'bold',
      icon: <Bold className="w-4 h-4" />,
      title: 'Bold (Ctrl+B)',
      onClick: e => e.chain().focus().toggleBold().run(),
      isActive: e => e.isActive('bold'),
    },
    {
      key: 'italic',
      icon: <Italic className="w-4 h-4" />,
      title: 'Italic (Ctrl+I)',
      onClick: e => e.chain().focus().toggleItalic().run(),
      isActive: e => e.isActive('italic'),
    },
    {
      key: 'underline',
      icon: <Underline className="w-4 h-4" />,
      title: 'Underline (Ctrl+U)',
      onClick: e => e.chain().focus().toggleUnderline().run(),
      isActive: e => e.isActive('underline'),
    },
  ],
  [
    {
      key: 'bullet',
      icon: <List className="w-4 h-4" />,
      title: 'Bullet list',
      onClick: e => e.chain().focus().toggleBulletList().run(),
      isActive: e => e.isActive('bulletList'),
    },
    {
      key: 'ordered',
      icon: <ListOrdered className="w-4 h-4" />,
      title: 'Ordered list',
      onClick: e => e.chain().focus().toggleOrderedList().run(),
      isActive: e => e.isActive('orderedList'),
    },
  ],
  [
    {
      key: 'align-left',
      icon: <AlignLeft className="w-4 h-4" />,
      title: 'Align left',
      onClick: e => e.chain().focus().setTextAlign('left').run(),
      isActive: e => e.isActive({ textAlign: 'left' }),
    },
    {
      key: 'align-center',
      icon: <AlignCenter className="w-4 h-4" />,
      title: 'Align center',
      onClick: e => e.chain().focus().setTextAlign('center').run(),
      isActive: e => e.isActive({ textAlign: 'center' }),
    },
    {
      key: 'align-right',
      icon: <AlignRight className="w-4 h-4" />,
      title: 'Align right',
      onClick: e => e.chain().focus().setTextAlign('right').run(),
      isActive: e => e.isActive({ textAlign: 'right' }),
    },
    {
      key: 'align-justify',
      icon: <AlignJustify className="w-4 h-4" />,
      title: 'Justify',
      onClick: e => e.chain().focus().setTextAlign('justify').run(),
      isActive: e => e.isActive({ textAlign: 'justify' }),
    },
  ],
];

// ─── Divider ────────────────────────────────────────────────────────────────

const Divider: React.FC = () => (
  <div role="separator" aria-orientation="vertical" className="w-px h-5 mx-1 shrink-0 bg-[var(--tm-border)]" />
);

// ─── ToolbarButton ────────────────────────────────────────────────────────────

export interface ToolbarButtonProps {
  onClick: () => void;
  /** Visually highlighted (also drives aria-pressed when `toggle` is true). */
  active?: boolean;
  /** Whether this is a two-state toggle (bold, alignment, ...) vs. a one-shot action (insert image). */
  toggle?: boolean;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}

export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  onClick,
  active = false,
  toggle = true,
  title,
  disabled = false,
  children,
}) => (
  <button
    type="button"
    // Keep editor selection focused on mouse interaction; onClick (not onMouseDown) carries
    // the action so the button stays fully operable from the keyboard (Tab + Enter/Space).
    onMouseDown={e => e.preventDefault()}
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    aria-pressed={toggle ? active : undefined}
    className={`flex items-center justify-center w-8 h-8 rounded-md outline-none transition-colors duration-200
      focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed
      ${active
        ? 'bg-[var(--tm-accent-subtle)] text-[var(--tm-accent)]'
        : 'text-[var(--tm-text-secondary)] hover:bg-[var(--tm-surface)] hover:text-[var(--tm-text-primary)]'}`}
    style={active ? { ...RING_STYLE, ...ACTIVE_OUTLINE_STYLE } : RING_STYLE}
  >
    {children}
  </button>
);

// ─── usePopover ───────────────────────────────────────────────────────────────

/** Shared open/close behavior for toolbar dropdowns: outside-click and Escape-to-close-and-refocus. */
function usePopover<TTrigger extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<TTrigger>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return { open, setOpen, containerRef, triggerRef };
}

/** Moves focus among a menu's items with ArrowUp/ArrowDown, wrapping at the ends. */
const handleMenuArrowKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]'));
  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
  const nextIndex = e.key === 'ArrowDown'
    ? (currentIndex + 1) % items.length
    : (currentIndex - 1 + items.length) % items.length;
  items[nextIndex]?.focus();
};

const menuPanelClass = 'absolute top-full left-0 mt-1.5 rounded-lg z-50';
const menuPanelStyle: React.CSSProperties = {
  backgroundColor: 'var(--tm-surface-raised)',
  border: '1px solid var(--tm-border)',
  boxShadow: 'var(--tm-shadow-md)',
};

// ─── HighlightPicker ──────────────────────────────────────────────────────────

const HighlightPicker: React.FC<{ editor: Editor | null }> = ({ editor }) => {
  const { open, setOpen, containerRef, triggerRef } = usePopover<HTMLButtonElement>();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const isHighlighted = editor?.isActive('highlight') ?? false;

  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]');
    const activeItem = Array.from(items ?? []).find(item => item.getAttribute('aria-checked') === 'true');
    (activeItem ?? items?.[0])?.focus();
  }, [open]);

  const applyColor = (color: string, alreadyActive: boolean) => {
    if (alreadyActive) {
      editor?.chain().focus().unsetHighlight().run();
    } else {
      editor?.chain().focus().setHighlight({ color }).run();
    }
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(v => !v)}
        title="Highlight text"
        aria-label="Highlight text"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-pressed={isHighlighted}
        className={`flex items-center justify-center w-8 h-8 rounded-md outline-none transition-colors duration-200
          focus-visible:ring-2 focus-visible:ring-offset-1
          ${isHighlighted
            ? 'bg-[var(--tm-accent-subtle)] text-[var(--tm-accent)]'
            : 'text-[var(--tm-text-secondary)] hover:bg-[var(--tm-surface)] hover:text-[var(--tm-text-primary)]'}`}
        style={isHighlighted ? { ...RING_STYLE, ...ACTIVE_OUTLINE_STYLE } : RING_STYLE}
      >
        <Highlighter className="w-4 h-4" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Highlight color"
          onKeyDown={handleMenuArrowKeys}
          className={`${menuPanelClass} p-2 flex items-center gap-1.5`}
          style={menuPanelStyle}
        >
          {HIGHLIGHT_COLORS.map(({ color, label }) => {
            const isActive = editor?.isActive('highlight', { color }) ?? false;
            return (
              <button
                key={color}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                aria-label={label}
                title={label}
                onMouseDown={e => e.preventDefault()}
                onClick={() => applyColor(color, isActive)}
                className="w-7 h-7 rounded-full outline-none transition-transform duration-200 hover:scale-110 active:scale-95 focus-visible:ring-2 focus-visible:ring-offset-1"
                style={{
                  ...RING_STYLE,
                  backgroundColor: color,
                  outline: isActive ? '2px solid var(--tm-accent)' : '2px solid transparent',
                  outlineOffset: '1px',
                }}
              />
            );
          })}

          <div className="w-px h-4 mx-0.5 shrink-0" style={{ backgroundColor: 'var(--tm-border)' }} />

          <button
            type="button"
            role="menuitem"
            title="Remove highlight"
            aria-label="Remove highlight"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              editor?.chain().focus().unsetHighlight().run();
              setOpen(false);
              triggerRef.current?.focus();
            }}
            className="flex items-center justify-center w-7 h-7 rounded-full outline-none transition-colors duration-200 text-[var(--tm-text-muted)] border border-[var(--tm-border)] hover:bg-[var(--tm-surface)] focus-visible:ring-2 focus-visible:ring-offset-1"
            style={RING_STYLE}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

// ─── HeadingPicker ────────────────────────────────────────────────────────────

const HeadingPicker: React.FC<{ editor: Editor | null }> = ({ editor }) => {
  const { open, setOpen, containerRef, triggerRef } = usePopover<HTMLButtonElement>();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const activeLevel = HEADING_LEVELS.find(level => editor?.isActive('heading', { level }) ?? false);
  const label = activeLevel ? `H${activeLevel}` : 'Text';

  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]');
    const activeItem = Array.from(items ?? []).find(item => item.getAttribute('aria-checked') === 'true');
    (activeItem ?? items?.[0])?.focus();
  }, [open]);

  const selectLevel = (level: HeadingLevel | null) => {
    if (!editor) return;
    if (level === null) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level }).run();
    }
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(v => !v)}
        title="Text style"
        aria-label={`Text style, ${activeLevel ? `heading ${activeLevel}` : 'paragraph'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={`flex items-center gap-0.5 h-8 pl-2 pr-1.5 rounded-md text-sm font-medium outline-none transition-colors duration-200
          focus-visible:ring-2 focus-visible:ring-offset-1
          ${activeLevel
            ? 'bg-[var(--tm-accent-subtle)] text-[var(--tm-accent)]'
            : 'text-[var(--tm-text-secondary)] hover:bg-[var(--tm-surface)] hover:text-[var(--tm-text-primary)]'}`}
        style={activeLevel ? { ...RING_STYLE, ...ACTIVE_OUTLINE_STYLE } : RING_STYLE}
      >
        <span aria-hidden="true" className="w-6 text-center leading-none">{label}</span>
        <ChevronDown className="w-3 h-3" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Text style"
          onKeyDown={handleMenuArrowKeys}
          className={`${menuPanelClass} py-1 min-w-[8rem]`}
          style={menuPanelStyle}
        >
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!activeLevel}
            onMouseDown={e => e.preventDefault()}
            onClick={() => selectLevel(null)}
            className="w-full text-left px-3 py-1.5 text-sm outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-inset hover:bg-[var(--tm-surface)]"
            style={{ ...RING_STYLE, color: !activeLevel ? 'var(--tm-accent)' : 'var(--tm-text-primary)' }}
          >
            Text
          </button>
          {HEADING_LEVELS.map(level => (
            <button
              key={level}
              type="button"
              role="menuitemradio"
              aria-checked={activeLevel === level}
              onMouseDown={e => e.preventDefault()}
              onClick={() => selectLevel(level)}
              className="w-full text-left px-3 py-1.5 text-sm font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-inset hover:bg-[var(--tm-surface)]"
              style={{ ...RING_STYLE, color: activeLevel === level ? 'var(--tm-accent)' : 'var(--tm-text-primary)' }}
            >
              Heading {level}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── ImageButton ──────────────────────────────────────────────────────────────

const ImageButton: React.FC<{ editor: Editor | null }> = ({ editor }) => {
  const showToast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    if (file.size > MAX_IMAGE_BYTES) {
      showToast(IMAGE_TOO_LARGE_MESSAGE);
      return;
    }

    const reader = new FileReader();
    reader.onload = readerEvent => {
      const src = readerEvent.target?.result as string;
      if (!src) return;
      editor.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <ToolbarButton
        toggle={false}
        onClick={() => inputRef.current?.click()}
        title="Upload image"
      >
        <ImageIcon className="w-4 h-4" />
      </ToolbarButton>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileChange}
      />
    </>
  );
};

// ─── TablePicker ──────────────────────────────────────────────────────────────

const TablePicker: React.FC<{ editor: Editor | null }> = ({ editor }) => {
  const { open, setOpen, containerRef, triggerRef } = usePopover<HTMLButtonElement>();
  const gridRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // 0-indexed size; { row: 2, col: 3 } means a 3×4 table. Reset to 1×1 each time the panel opens.
  const [selection, setSelection] = useState({ row: 0, col: 0 });

  useEffect(() => {
    if (open) gridRef.current?.focus();
  }, [open]);

  const toggleOpen = () => {
    setOpen(prev => {
      const next = !prev;
      if (next) setSelection({ row: 0, col: 0 });
      return next;
    });
  };

  // Grid grows as the pointer/selection nears its edge, capped at TABLE_MAX (20×20).
  const gridRows = Math.min(TABLE_MAX, Math.max(TABLE_MIN_GRID, selection.row + 2));
  const gridCols = Math.min(TABLE_MAX, Math.max(TABLE_MIN_GRID, selection.col + 2));

  const insertTable = (rows: number, cols: number) => {
    editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        setSelection(s => ({ ...s, col: Math.min(TABLE_MAX - 1, s.col + 1) }));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setSelection(s => ({ ...s, col: Math.max(0, s.col - 1) }));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelection(s => ({ ...s, row: Math.min(TABLE_MAX - 1, s.row + 1) }));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelection(s => ({ ...s, row: Math.max(0, s.row - 1) }));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        insertTable(selection.row + 1, selection.col + 1);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={toggleOpen}
        title="Insert table"
        aria-label="Insert table"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex items-center justify-center w-8 h-8 rounded-md outline-none transition-colors duration-200
          focus-visible:ring-2 focus-visible:ring-offset-1
          ${editor?.isActive('table')
            ? 'bg-[var(--tm-accent-subtle)] text-[var(--tm-accent)]'
            : 'text-[var(--tm-text-secondary)] hover:bg-[var(--tm-surface)] hover:text-[var(--tm-text-primary)]'}`}
        style={editor?.isActive('table') ? { ...RING_STYLE, ...ACTIVE_OUTLINE_STYLE } : RING_STYLE}
      >
        <TableIcon className="w-4 h-4" />
      </button>

      {open && (
        <div id={panelId} className={`${menuPanelClass} p-2.5`} style={menuPanelStyle}>
          <div className="text-xs font-medium mb-1.5 text-center" style={{ color: 'var(--tm-text-muted)' }} aria-live="polite">
            {`${selection.row + 1} × ${selection.col + 1}`}
          </div>
          <div
            ref={gridRef}
            role="group"
            aria-label={`Table size, ${selection.row + 1} by ${selection.col + 1}. Use arrow keys to resize, Enter to insert.`}
            tabIndex={0}
            onKeyDown={handleGridKeyDown}
            className="grid gap-[3px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            style={{ ...RING_STYLE, gridTemplateColumns: `repeat(${gridCols}, 14px)` }}
          >
            {Array.from({ length: gridRows * gridCols }).map((_, i) => {
              const row = Math.floor(i / gridCols);
              const col = i % gridCols;
              const active = row <= selection.row && col <= selection.col;
              return (
                <div
                  key={i}
                  aria-hidden="true"
                  onMouseEnter={() => setSelection({ row, col })}
                  onMouseDown={e => {
                    e.preventDefault();
                    insertTable(row + 1, col + 1);
                  }}
                  className="w-[14px] h-[14px] rounded-sm cursor-pointer transition-colors duration-150"
                  style={{
                    backgroundColor: active ? 'var(--tm-accent)' : 'var(--tm-surface)',
                    border: `1px solid ${active ? 'var(--tm-accent)' : 'var(--tm-border)'}`,
                  }}
                />
              );
            })}
          </div>
          <p className="sr-only">Use arrow keys to choose a table size, then press Enter to insert. Press Escape to cancel.</p>
        </div>
      )}
    </div>
  );
};

// ─── EditorToolbar ────────────────────────────────────────────────────────────

interface EditorToolbarProps {
  editor: Editor | null;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  /** Right-side action buttons (Resources, PDF, Save). */
  children?: React.ReactNode;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  editor,
  sidebarOpen = true,
  onToggleSidebar,
  children,
}) => (
  <div
    className="flex items-center gap-0.5 px-4 py-2 border-b border-border-subtle flex-wrap"
    style={{ backgroundColor: 'var(--tm-surface-raised)' }}
  >
    {onToggleSidebar && (
      <>
        <ToolbarButton
          toggle={false}
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </ToolbarButton>
        <Divider />
      </>
    )}

    <div role="toolbar" aria-label="Text formatting" className="flex items-center gap-0.5 flex-wrap">
      <HeadingPicker editor={editor} />
      <Divider />

      {TOOLBAR_GROUPS.map((group, gi) => (
        <React.Fragment key={gi}>
          {group.map(action => (
            <ToolbarButton
              key={action.key}
              onClick={() => editor && action.onClick(editor)}
              active={editor ? action.isActive(editor) : false}
              title={action.title}
            >
              {action.icon}
            </ToolbarButton>
          ))}
          {gi === 0 && <HighlightPicker editor={editor} />}
          {gi === 1 && <TablePicker editor={editor} />}
          {gi < TOOLBAR_GROUPS.length - 1 && <Divider />}
        </React.Fragment>
      ))}

      <Divider />
      <ImageButton editor={editor} />
    </div>

    <div className="ml-auto flex items-center gap-2">
      {children}
    </div>
  </div>
);
