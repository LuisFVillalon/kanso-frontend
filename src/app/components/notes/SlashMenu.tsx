'use client';

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  Code, Heading1, Heading2, Heading3, Image as ImageIcon, List, ListChecks, ListOrdered, Minus, Pilcrow, Quote,
  Table as TableIcon,
} from 'lucide-react';
import type { SlashIcon, SlashMenuStore } from './extensions/SlashCommand';

const ICONS: Record<SlashIcon, React.ElementType> = {
  text: Pilcrow, h1: Heading1, h2: Heading2, h3: Heading3, checklist: ListChecks, bullet: List,
  ordered: ListOrdered, table: TableIcon, quote: Quote, code: Code, divider: Minus, image: ImageIcon,
};

const MENU_WIDTH = 260;
const MENU_MAX_HEIGHT = 320;
/** One option's height plus the list's padding, for deciding whether the menu fits below. */
const ITEM_HEIGHT = 46;

/**
 * The "/" menu. The SlashCommand extension owns the typing and the keys
 * (arrows, Enter, Escape); this draws its current state next to the slash.
 */
const SlashMenu: React.FC<{ store: SlashMenuStore }> = ({ store }) => {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [state.index, state.open]);

  if (!state.open || !state.rect) return null;

  const { rect } = state;
  const height = Math.min(MENU_MAX_HEIGHT, Math.max(1, state.items.length) * ITEM_HEIGHT + 10);
  const below = rect.bottom + height + 8 <= window.innerHeight;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
  const position: React.CSSProperties = below
    ? { top: rect.bottom + 6 }
    : { bottom: window.innerHeight - rect.top + 6 };

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Insert a block"
      className="fixed z-[60] overflow-y-auto rounded-lg p-1 scrollbar-custom"
      style={{
        ...position, left, width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT,
        backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)', boxShadow: 'var(--tm-shadow-md)',
      }}
    >
      {state.items.length === 0 ? (
        <p className="px-2.5 py-2 text-sm" style={{ color: 'var(--tm-text-muted)' }}>No matches. Keep typing, or press Esc.</p>
      ) : state.items.map((item, i) => {
        const Icon = ICONS[item.icon];
        const selected = i === state.index;
        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={selected}
            tabIndex={-1}
            onMouseDown={e => e.preventDefault()}
            onMouseEnter={() => store.highlight(i)}
            onClick={() => store.choose(item)}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left"
            style={{ backgroundColor: selected ? 'var(--tm-surface)' : undefined }}
          >
            <span
              className="flex items-center justify-center w-8 h-8 rounded-md shrink-0"
              style={{ border: '1px solid var(--tm-border)', backgroundColor: 'var(--tm-surface)', color: 'var(--tm-text-secondary)' }}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm" style={{ color: 'var(--tm-text-primary)' }}>{item.title}</span>
              <span className="block text-xs truncate" style={{ color: 'var(--tm-text-muted)' }}>{item.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default SlashMenu;
