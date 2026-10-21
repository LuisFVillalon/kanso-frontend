import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Siren, Loader2 } from 'lucide-react';
import { getPriorityBadgeStyle } from '@/app/utils/taskUtils';

interface PriorityPickerProps {
  priority: number | null;
  maxPriority: number;
  availablePriorities: number[];
  onSelect: (priority: number | null) => void | Promise<void>;
  size?: 'sm' | 'md';
}

const PriorityPicker: React.FC<PriorityPickerProps> = ({
  priority,
  maxPriority,
  availablePriorities,
  onSelect,
  size = 'md',
}) => {
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Viewport coords for the portaled menu. Task cards each form their own
  // stacking context (backdrop-filter) and sit in a scrolling panel, so an
  // in-card absolute menu ends up under the next card or clipped.
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const style = getPriorityBadgeStyle(priority, maxPriority);
  const isSmall = size === 'sm';

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    // Fixed coords go stale once anything scrolls; close like a native select.
    const handleScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const handleResize = () => setOpen(false);
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open]);

  // Place the menu below the badge, flipping above when it won't fit.
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = ref.current?.getBoundingClientRect();
    if (!anchor) return;
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const gap = 4;
    const right = window.innerWidth - anchor.right;
    const roomBelow = window.innerHeight - anchor.bottom - gap;
    if (menuHeight > roomBelow && anchor.top - gap > roomBelow) {
      setPos({ bottom: window.innerHeight - anchor.top + gap, right });
    } else {
      setPos({ top: anchor.bottom + gap, right });
    }
  }, [open]);

  useEffect(() => {
    if (!open || !pos) return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    (items.find(item => item.dataset.priority === String(priority)) ?? items[0])?.focus();
  }, [open, pos, priority]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      triggerRef.current?.focus();
      setOpen(false);
      return;
    }
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (e.key === 'ArrowDown') next = (current + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else return;
    e.preventDefault();
    items[next]?.focus();
  };

  const handleMenuBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (!next || menuRef.current?.contains(next) || ref.current?.contains(next)) return;
    setOpen(false);
  };

  const handleSelect = async (p: number | null) => {
    setOpen(false);
    setUpdating(true);
    try {
      await onSelect(p);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        onClick={() => setOpen(v => !v)}
        disabled={updating}
        className={`chip font-bold flex items-center gap-1 transition-opacity hover:opacity-75 ${
          priority == null ? 'opacity-40' : ''
        } ${updating ? 'cursor-wait' : ''}`}
        style={{
          backgroundColor: style.bg,
          color: style.text,
          padding: '0.1rem 0.45rem',
          borderRadius: '9999px',
          fontSize: isSmall ? '9px' : '11px',
        }}
        title={updating ? 'Saving priority…' : 'Change priority'}
        aria-label="Change priority"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {updating
          ? <Loader2 className={`animate-spin ${isSmall ? 'w-3 h-3' : 'w-4 h-4'}`} />
          : <Siren className={isSmall ? 'w-3 h-3' : 'w-4 h-4'} />}
        {priority ?? '—'}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          onBlur={handleMenuBlur}
          className="fixed z-50 card p-1.5 flex flex-col gap-1 min-w-[72px]"
          style={{
            boxShadow: 'var(--tm-shadow-lg)',
            top: pos?.top,
            bottom: pos?.bottom,
            right: pos?.right,
            // Hidden until measured so it never flashes at the wrong spot.
            visibility: pos ? undefined : 'hidden',
          }}
        >
          <div
            className={`flex flex-col gap-1 ${
              availablePriorities.length > 5
                ? 'max-h-40 overflow-y-auto scrollbar-custom pr-0.5'
                : ''
            }`}
          >
            {availablePriorities.map(p => {
              const s = getPriorityBadgeStyle(p, maxPriority);
              return (
                <button
                  key={p}
                  role="menuitem"
                  tabIndex={-1}
                  data-priority={p}
                  onClick={() => handleSelect(p)}
                  className="chip text-[10px] font-bold flex items-center gap-1 w-full justify-center hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: s.bg,
                    color: s.text,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                  }}
                >
                  <Siren className="w-3 h-3" />
                  {p}
                </button>
              );
            })}
          </div>

          {priority != null && (
            <button
              role="menuitem"
              tabIndex={-1}
              onClick={() => handleSelect(null)}
              className="text-[10px] font-medium text-text-muted hover:text-text-primary transition-colors text-center pt-0.5"
            >
              Clear
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default PriorityPicker;
