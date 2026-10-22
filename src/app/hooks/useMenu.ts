'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const ITEM_SELECTOR = '[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled), [role="menuitemradio"]:not(:disabled)';

const menuItems = (menu: HTMLElement | null) =>
  menu ? [...menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR)] : [];

/**
 * A button that opens a popup menu: the WAI-ARIA menu button pattern.
 * Opening moves focus to the first item; ↑/↓, Home and End move between
 * items; Escape closes and returns focus to the button; Tab or a click
 * outside closes. Spread `triggerProps` on the button and `menuProps` on the
 * element that holds the `role="menuitem…"` rows, rendered while `open`.
 */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Which item takes focus when the menu opens: the last when opened with ↑.
  const focusOnOpen = useRef<'first' | 'last'>('first');

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const items = menuItems(menuRef.current);
    (focusOnOpen.current === 'last' ? items[items.length - 1] : items[0])?.focus();
    focusOnOpen.current = 'first';

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = menuItems(menuRef.current);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      e.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    switch (e.key) {
      case 'ArrowDown': move(index + 1); break;
      case 'ArrowUp': move(index - 1); break;
      case 'Home': move(0); break;
      case 'End': move(items.length - 1); break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case 'Tab': setOpen(false); break;
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    focusOnOpen.current = e.key === 'ArrowUp' ? 'last' : 'first';
    setOpen(true);
  };

  return {
    open,
    close,
    triggerProps: {
      ref: triggerRef,
      type: 'button' as const,
      'aria-haspopup': 'menu' as const,
      'aria-expanded': open,
      onClick: () => setOpen(prev => !prev),
      onKeyDown: onTriggerKeyDown,
    },
    menuProps: {
      ref: menuRef,
      role: 'menu' as const,
      onKeyDown: onMenuKeyDown,
    },
  };
}
