'use client';

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight,
  Bold, ChevronDown, Code, Highlighter, Image as ImageIcon, Italic, Link2, List, ListChecks, ListOrdered,
  Minus, PanelLeftClose, PanelLeftOpen, Plus, Quote, Redo2, Table as TableIcon, Underline, Undo2, X,
} from 'lucide-react';

// ─── Heading levels ──────────────────────────────────────────────────────────

const HEADING_LEVELS = [1, 2, 3, 4, 5] as const;
type HeadingLevel = (typeof HEADING_LEVELS)[number];

// ─── Table picker grid ────────────────────────────────────────────────────────

const TABLE_MAX = 20;
const TABLE_MIN_GRID = 8;

// ─── Constants ────────────────────────────────────────────────────────────────

export const HIGHLIGHT_COLORS = [
  { color: '#fef08a', label: 'Yellow' },
  { color: '#bbf7d0', label: 'Green' },
  { color: '#bae6fd', label: 'Blue' },
  { color: '#fbcfe8', label: 'Pink' },
  { color: '#fed7aa', label: 'Orange' },
] as const;

type Alignment = 'left' | 'center' | 'right' | 'justify';

const ALIGNMENTS: { value: Alignment; label: string; shortcut: string; Icon: React.ElementType }[] = [
  { value: 'left',    label: 'Align left',   shortcut: 'Ctrl+Shift+L', Icon: AlignLeft },
  { value: 'center',  label: 'Align center', shortcut: 'Ctrl+Shift+E', Icon: AlignCenter },
  { value: 'right',   label: 'Align right',  shortcut: 'Ctrl+Shift+R', Icon: AlignRight },
  { value: 'justify', label: 'Justify',      shortcut: 'Ctrl+Shift+J', Icon: AlignJustify },
];

/** Focus ring tokens, scoped to controls sitting on the raised toolbar/popover surface. */
export const RING_STYLE = {
  '--tw-ring-color': 'var(--tm-accent)',
  '--tw-ring-offset-color': 'var(--tm-surface-raised)',
} as React.CSSProperties;

/** Ink outline that frames an active/toggled control so selection reads clearly against the accent tint. */
const ACTIVE_OUTLINE_STYLE: React.CSSProperties = {
  outline: '2px solid var(--tm-text-primary)',
  outlineOffset: '-2px',
};

/** Where a toolbar's menus open: below a top bar, or above the phone's bottom bar. */
export type MenuPlacement = 'below' | 'above';

/** Button sizes: 32px in the top bar, 40px touch targets in the phone's bottom bar. */
const sizeClass = (placement: MenuPlacement) => (placement === 'above' ? 'min-w-10 h-10' : 'min-w-8 h-8');

const triggerClass = (active: boolean, placement: MenuPlacement) =>
  `flex items-center justify-center ${sizeClass(placement)} rounded-md outline-none transition-colors duration-200
   focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed
   ${active
     ? 'bg-[var(--tm-accent-subtle)] text-[var(--tm-accent)]'
     : 'text-[var(--tm-text-secondary)] hover:bg-[var(--tm-surface)] hover:text-[var(--tm-text-primary)]'}`;

const triggerStyle = (active: boolean) => (active ? { ...RING_STYLE, ...ACTIVE_OUTLINE_STYLE } : RING_STYLE);

// ─── Divider ────────────────────────────────────────────────────────────────

export const Divider: React.FC = () => (
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
  placement?: MenuPlacement;
  className?: string;
  children: React.ReactNode;
}

export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  onClick,
  active = false,
  toggle = true,
  title,
  disabled = false,
  placement = 'below',
  className = '',
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
    className={`${triggerClass(active, placement)} shrink-0 ${className}`}
    style={triggerStyle(active)}
  >
    {children}
  </button>
);

// ─── usePopover ───────────────────────────────────────────────────────────────

/** Shared open/close behavior for toolbar dropdowns: outside-click and Escape-to-close-and-refocus. */
export function usePopover<TTrigger extends HTMLElement>() {
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
export const handleMenuArrowKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]'));
  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
  const nextIndex = e.key === 'ArrowDown'
    ? (currentIndex + 1) % items.length
    : (currentIndex - 1 + items.length) % items.length;
  items[nextIndex]?.focus();
};

/** Focuses a menu's checked item (or its first) when it opens. */
export function useFocusOnOpen(open: boolean, menuRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]');
    const activeItem = Array.from(items ?? []).find(item => item.getAttribute('aria-checked') === 'true');
    (activeItem ?? items?.[0])?.focus();
  }, [open, menuRef]);
}

const menuPanelStyle: React.CSSProperties = {
  backgroundColor: 'var(--tm-surface-raised)',
  border: '1px solid var(--tm-border)',
  boxShadow: 'var(--tm-shadow-md)',
};

export const menuItemClass = 'w-full flex items-center gap-2.5 text-left px-3 py-1.5 text-sm outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-inset hover:bg-[var(--tm-surface)]';

interface MenuPanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'style'> {
  placement: MenuPlacement;
  anchorRef: React.RefObject<HTMLElement | null>;
  panelRef?: React.RefObject<HTMLDivElement | null>;
  /** Which edge of the trigger a top-bar panel lines up with. */
  align?: 'start' | 'end';
}

/**
 * A dropdown's panel. Below a top bar it hangs under its trigger; above the
 * phone's bottom bar (which scrolls sideways and would clip it) it is placed
 * on screen with fixed positioning, kept inside the viewport.
 */
export const MenuPanel: React.FC<MenuPanelProps> = ({ placement, anchorRef, panelRef, align = 'start', className = '', children, ...rest }) => {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = panelRef ?? ownRef;
  const [fixedPos, setFixedPos] = useState<React.CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (placement !== 'above') return;
    const anchor = anchorRef.current?.getBoundingClientRect();
    const width = ref.current?.offsetWidth ?? 0;
    if (!anchor) return;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
    setFixedPos({ position: 'fixed', left, bottom: window.innerHeight - anchor.top + 6 });
  }, [placement, anchorRef, ref]);

  // Above the bottom bar the panel sizes to its content, so it can be measured and kept on screen.
  const placeClass = placement === 'above' ? 'w-max max-w-[calc(100vw-1rem)]' : `absolute top-full mt-1.5 ${align === 'end' ? 'right-0' : 'left-0'}`;
  return (
    <div
      ref={ref}
      {...rest}
      className={`${placeClass} rounded-lg z-50 ${className}`}
      style={{ ...menuPanelStyle, ...(placement === 'above' ? fixedPos ?? { position: 'fixed', visibility: 'hidden' } : {}) }}
    >
      {children}
    </div>
  );
};

// ─── Editor state for the controls ────────────────────────────────────────────

const EMPTY_STATE = {
  bold: false, italic: false, underline: false, highlight: false,
  bulletList: false, orderedList: false, taskList: false, table: false,
  headingLevel: undefined as HeadingLevel | undefined,
  alignment: 'left' as Alignment,
  highlightColor: undefined as string | undefined,
  canUndo: false, canRedo: false,
};

type ControlsState = typeof EMPTY_STATE;

/** Active marks and blocks at the cursor; re-read on every transaction (selection moves too). */
function useControlsState(editor: Editor | null): ControlsState {
  return useEditorState({
    editor,
    selector: ({ editor: e }): ControlsState => {
      if (!e) return EMPTY_STATE;
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        highlight: e.isActive('highlight'),
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        taskList: e.isActive('taskList'),
        table: e.isActive('table'),
        headingLevel: HEADING_LEVELS.find(level => e.isActive('heading', { level })),
        alignment: ALIGNMENTS.find(a => e.isActive({ textAlign: a.value }))?.value ?? 'left',
        highlightColor: HIGHLIGHT_COLORS.find(({ color }) => e.isActive('highlight', { color }))?.color,
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  }) ?? EMPTY_STATE;
}

// ─── HighlightPicker ──────────────────────────────────────────────────────────

const HighlightPicker: React.FC<{ editor: Editor | null; state: ControlsState; placement: MenuPlacement }> = ({ editor, state, placement }) => {
  const { open, setOpen, containerRef, triggerRef } = usePopover<HTMLButtonElement>();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useFocusOnOpen(open, menuRef);

  const applyColor = (color: string, alreadyActive: boolean) => {
    if (alreadyActive) {
      editor?.chain().focus().unsetHighlight().run();
    } else {
      editor?.chain().focus().setHighlight({ color }).run();
    }
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(v => !v)}
        title="Highlight text (Ctrl+Shift+H)"
        aria-label="Highlight text"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-pressed={state.highlight}
        className={triggerClass(state.highlight, placement)}
        style={triggerStyle(state.highlight)}
      >
        <Highlighter className="w-4 h-4" />
      </button>

      {open && (
        <MenuPanel
          panelRef={menuRef}
          anchorRef={triggerRef}
          placement={placement}
          id={menuId}
          role="menu"
          aria-label="Highlight color"
          onKeyDown={handleMenuArrowKeys}
          className="p-2 flex items-center gap-1.5"
        >
          {HIGHLIGHT_COLORS.map(({ color, label }) => {
            const isActive = state.highlightColor === color;
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
            }}
            className="flex items-center justify-center w-7 h-7 rounded-full outline-none transition-colors duration-200 text-[var(--tm-text-muted)] border border-[var(--tm-border)] hover:bg-[var(--tm-surface)] focus-visible:ring-2 focus-visible:ring-offset-1"
            style={RING_STYLE}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </MenuPanel>
      )}
    </div>
  );
};

// ─── HeadingPicker ────────────────────────────────────────────────────────────

const HeadingPicker: React.FC<{ editor: Editor | null; state: ControlsState; placement: MenuPlacement }> = ({ editor, state, placement }) => {
  const { open, setOpen, containerRef, triggerRef } = usePopover<HTMLButtonElement>();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useFocusOnOpen(open, menuRef);

  const activeLevel = state.headingLevel;
  const label = activeLevel ? `H${activeLevel}` : 'Text';

  const selectLevel = (level: HeadingLevel | null) => {
    if (!editor) return;
    if (level === null) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level }).run();
    }
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
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
        className={`${triggerClass(!!activeLevel, placement)} gap-0.5 pl-2 pr-1.5 text-sm font-medium`}
        style={triggerStyle(!!activeLevel)}
      >
        <span aria-hidden="true" className="min-w-6 text-center leading-none">{label}</span>
        <ChevronDown className="w-3 h-3" aria-hidden="true" />
      </button>

      {open && (
        <MenuPanel
          panelRef={menuRef}
          anchorRef={triggerRef}
          placement={placement}
          id={menuId}
          role="menu"
          aria-label="Text style"
          onKeyDown={handleMenuArrowKeys}
          className="py-1 min-w-[10rem]"
        >
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!activeLevel}
            onMouseDown={e => e.preventDefault()}
            onClick={() => selectLevel(null)}
            className={menuItemClass}
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
              className={`${menuItemClass} font-semibold`}
              style={{ ...RING_STYLE, color: activeLevel === level ? 'var(--tm-accent)' : 'var(--tm-text-primary)' }}
            >
              Heading {level}
              <span className="ml-auto pl-4 text-xs font-normal" style={{ color: 'var(--tm-text-muted)' }}>Ctrl+Alt+{level}</span>
            </button>
          ))}
        </MenuPanel>
      )}
    </div>
  );
};

// ─── TableGrid ────────────────────────────────────────────────────────────────

/** Pick a table size by pointer or arrow keys; Enter inserts. Starts at 1×1. */
const TableGrid: React.FC<{ onInsert: (rows: number, cols: number) => void }> = ({ onInsert }) => {
  const gridRef = useRef<HTMLDivElement>(null);
  // 0-indexed size; { row: 2, col: 3 } means a 3×4 table.
  const [selection, setSelection] = useState({ row: 0, col: 0 });

  useEffect(() => {
    gridRef.current?.focus();
  }, []);

  // Grid grows as the pointer/selection nears its edge, capped at TABLE_MAX (20×20).
  const gridRows = Math.min(TABLE_MAX, Math.max(TABLE_MIN_GRID, selection.row + 2));
  const gridCols = Math.min(TABLE_MAX, Math.max(TABLE_MIN_GRID, selection.col + 2));

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
        onInsert(selection.row + 1, selection.col + 1);
        break;
    }
  };

  return (
    <div className="p-2.5">
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
                onInsert(row + 1, col + 1);
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
  );
};

// ─── InsertMenu ───────────────────────────────────────────────────────────────

interface InsertMenuProps {
  editor: Editor | null;
  state: ControlsState;
  placement: MenuPlacement;
  onPickImage: () => void;
  onEditLink: () => void;
}

/** "+ Insert": table (with a size grid), image, link, quote, code block and divider. */
const InsertMenu: React.FC<InsertMenuProps> = ({ editor, state, placement, onPickImage, onEditLink }) => {
  const { open, setOpen, containerRef, triggerRef } = usePopover<HTMLButtonElement>();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [view, setView] = useState<'menu' | 'table'>('menu');
  useFocusOnOpen(open && view === 'menu', menuRef);

  const close = () => setOpen(false);
  const toggle = () => {
    setView('menu');
    setOpen(v => !v);
  };

  const items: { key: string; label: string; hint?: string; Icon: React.ElementType; run: () => void }[] = [
    { key: 'table', label: 'Table', Icon: TableIcon, run: () => setView('table') },
    { key: 'image', label: 'Image', Icon: ImageIcon, run: () => { close(); onPickImage(); } },
    { key: 'link', label: 'Link', hint: 'Ctrl+K', Icon: Link2, run: () => { close(); onEditLink(); } },
    { key: 'quote', label: 'Quote', hint: 'Ctrl+Shift+B', Icon: Quote, run: () => { close(); editor?.chain().focus().toggleBlockquote().run(); } },
    { key: 'code', label: 'Code block', hint: 'Ctrl+Alt+C', Icon: Code, run: () => { close(); editor?.chain().focus().toggleCodeBlock().run(); } },
    { key: 'divider', label: 'Divider', Icon: Minus, run: () => { close(); editor?.chain().focus().setHorizontalRule().run(); } },
  ];

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={toggle}
        title="Insert a table, image, link, quote, code block or divider"
        aria-label="Insert"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={`${triggerClass(state.table, placement)} gap-1 px-1.5 text-sm font-medium`}
        style={triggerStyle(state.table)}
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        {placement === 'below' && <span className="hidden @3xl:inline">Insert</span>}
        <ChevronDown className="w-3 h-3" aria-hidden="true" />
      </button>

      {open && (
        <MenuPanel
          panelRef={menuRef}
          anchorRef={triggerRef}
          placement={placement}
          id={menuId}
          role={view === 'menu' ? 'menu' : 'dialog'}
          aria-label={view === 'menu' ? 'Insert' : 'Insert table'}
          onKeyDown={view === 'menu' ? handleMenuArrowKeys : undefined}
          className={view === 'menu' ? 'py-1 min-w-[12rem]' : ''}
        >
          {view === 'menu' ? items.map(({ key, label, hint, Icon, run }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onMouseDown={e => e.preventDefault()}
              onClick={run}
              className={menuItemClass}
              style={{ ...RING_STYLE, color: 'var(--tm-text-primary)' }}
            >
              <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--tm-text-muted)' }} aria-hidden="true" />
              {label}
              {hint && <span className="ml-auto pl-4 text-xs" style={{ color: 'var(--tm-text-muted)' }}>{hint}</span>}
            </button>
          )) : (
            <TableGrid
              onInsert={(rows, cols) => {
                editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
                close();
              }}
            />
          )}
        </MenuPanel>
      )}
    </div>
  );
};

// ─── AlignMenu ────────────────────────────────────────────────────────────────

const AlignMenu: React.FC<{ editor: Editor | null; state: ControlsState; placement: MenuPlacement }> = ({ editor, state, placement }) => {
  const { open, setOpen, containerRef, triggerRef } = usePopover<HTMLButtonElement>();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useFocusOnOpen(open, menuRef);
  const current = ALIGNMENTS.find(a => a.value === state.alignment) ?? ALIGNMENTS[0];
  const CurrentIcon = current.Icon;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(v => !v)}
        title={`Alignment: ${current.label.replace('Align ', '').toLowerCase()}`}
        aria-label="Alignment"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={`${triggerClass(false, placement)} gap-0.5 px-1.5`}
        style={RING_STYLE}
      >
        <CurrentIcon className="w-4 h-4" aria-hidden="true" />
        <ChevronDown className="w-3 h-3" aria-hidden="true" />
      </button>

      {open && (
        <MenuPanel
          panelRef={menuRef}
          anchorRef={triggerRef}
          placement={placement}
          id={menuId}
          role="menu"
          aria-label="Alignment"
          onKeyDown={handleMenuArrowKeys}
          className="py-1 min-w-[13rem]"
        >
          {ALIGNMENTS.map(({ value, label, shortcut, Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={state.alignment === value}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                editor?.chain().focus().setTextAlign(value).run();
                setOpen(false);
              }}
              className={menuItemClass}
              style={{ ...RING_STYLE, color: state.alignment === value ? 'var(--tm-accent)' : 'var(--tm-text-primary)' }}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              {label}
              <span className="ml-auto pl-4 text-xs" style={{ color: 'var(--tm-text-muted)' }}>{shortcut}</span>
            </button>
          ))}
        </MenuPanel>
      )}
    </div>
  );
};

// ─── FormattingControls ───────────────────────────────────────────────────────

interface FormattingControlsProps {
  editor: Editor | null;
  placement: MenuPlacement;
  onPickImage: () => void;
  onEditLink: () => void;
}

/**
 * The formatting tools, shared by the top bar and the phone's bottom bar:
 * text style | bold, italic, underline, highlight | lists, checklist |
 * Insert, alignment — plus undo/redo on the bottom bar, where there's no
 * keyboard to undo with.
 */
export const FormattingControls: React.FC<FormattingControlsProps> = ({ editor, placement, onPickImage, onEditLink }) => {
  const state = useControlsState(editor);
  const iconSize = placement === 'above' ? 'w-[18px] h-[18px]' : 'w-4 h-4';
  const toggles: { key: string; title: string; Icon: React.ElementType; active: boolean; run: (e: Editor) => void }[][] = [
    [
      { key: 'bold',      title: 'Bold (Ctrl+B)',      Icon: Bold,      active: state.bold,      run: e => e.chain().focus().toggleBold().run() },
      { key: 'italic',    title: 'Italic (Ctrl+I)',    Icon: Italic,    active: state.italic,    run: e => e.chain().focus().toggleItalic().run() },
      { key: 'underline', title: 'Underline (Ctrl+U)', Icon: Underline, active: state.underline, run: e => e.chain().focus().toggleUnderline().run() },
    ],
    [
      { key: 'bullet',    title: 'Bulleted list (Ctrl+Shift+8)', Icon: List,        active: state.bulletList,  run: e => e.chain().focus().toggleBulletList().run() },
      { key: 'ordered',   title: 'Numbered list (Ctrl+Shift+7)', Icon: ListOrdered, active: state.orderedList, run: e => e.chain().focus().toggleOrderedList().run() },
      { key: 'checklist', title: 'Checklist (Ctrl+Shift+9)',     Icon: ListChecks,  active: state.taskList,    run: e => e.chain().focus().toggleTaskList().run() },
    ],
  ];

  const button = ({ key, title, Icon, active, run }: (typeof toggles)[number][number]) => (
    <ToolbarButton key={key} placement={placement} onClick={() => editor && run(editor)} active={active} title={title}>
      <Icon className={iconSize} />
    </ToolbarButton>
  );

  return (
    <>
      <HeadingPicker editor={editor} state={state} placement={placement} />
      <Divider />
      {toggles[0].map(button)}
      <HighlightPicker editor={editor} state={state} placement={placement} />
      <Divider />
      {toggles[1].map(button)}
      <Divider />
      <InsertMenu editor={editor} state={state} placement={placement} onPickImage={onPickImage} onEditLink={onEditLink} />
      <AlignMenu editor={editor} state={state} placement={placement} />
      {placement === 'above' && (
        <>
          <Divider />
          <ToolbarButton placement={placement} toggle={false} title="Undo" disabled={!state.canUndo} onClick={() => editor?.chain().focus().undo().run()}>
            <Undo2 className={iconSize} />
          </ToolbarButton>
          <ToolbarButton placement={placement} toggle={false} title="Redo" disabled={!state.canRedo} onClick={() => editor?.chain().focus().redo().run()}>
            <Redo2 className={iconSize} />
          </ToolbarButton>
        </>
      )}
    </>
  );
};

// ─── EditorToolbar ────────────────────────────────────────────────────────────

interface EditorToolbarProps {
  editor: Editor | null;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  /** False when formatting lives in the bottom bar instead (narrow editors, phones). */
  showFormatting?: boolean;
  onPickImage: () => void;
  onEditLink: () => void;
  /** Right-side items: save status, word count, Resources, the More menu. */
  children?: React.ReactNode;
}

/**
 * The note editor's top bar: one row that never wraps. Items that don't fit
 * a narrower editor tuck away via container queries (the bar is the
 * container), and below a minimum width NoteEditor moves the formatting
 * tools to a bottom bar.
 */
export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  editor,
  sidebarOpen = true,
  onToggleSidebar,
  showFormatting = true,
  onPickImage,
  onEditLink,
  children,
}) => (
  <div
    className="@container shrink-0 border-b border-border-subtle"
    style={{ backgroundColor: 'var(--tm-surface-raised)' }}
  >
    <div className="flex flex-nowrap items-center gap-0.5 px-3 sm:px-4 py-2 min-h-12">
      {onToggleSidebar && (
        // The sidebar is already hidden while a phone shows the editor, so the toggle would do nothing there.
        <div className="hidden sm:flex items-center shrink-0">
          <ToolbarButton
            toggle={false}
            onClick={onToggleSidebar}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </ToolbarButton>
          {showFormatting && <Divider />}
        </div>
      )}

      {showFormatting && (
        <div role="toolbar" aria-label="Text formatting" className="flex items-center gap-0.5">
          <FormattingControls editor={editor} placement="below" onPickImage={onPickImage} onEditLink={onEditLink} />
        </div>
      )}

      <div className="ml-auto flex items-center gap-1 @3xl:gap-1.5 shrink-0 relative">
        {children}
      </div>
    </div>
  </div>
);

/** The phone's formatting bar, docked under the note and scrolling sideways when it doesn't fit. */
export const BottomFormattingBar: React.FC<Omit<FormattingControlsProps, 'placement'>> = props => (
  <div
    role="toolbar"
    aria-label="Formatting"
    className="shrink-0 flex items-center gap-0.5 px-2 py-1.5 border-t border-border-subtle overflow-x-auto scrollbar-none"
    style={{ backgroundColor: 'var(--tm-surface-raised)', paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
  >
    <FormattingControls {...props} placement="above" />
  </div>
);
