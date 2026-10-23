'use client';

import React, { useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { longPressTip } from '@/app/components/common/longPressTip';
import { useKeyPress } from '@/app/hooks/useKeyPress';

export interface SegmentedTab<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedTabsProps<T extends string> {
  /** Names the tablist for screen readers, e.g. "Widgets or week calendar". */
  label: string;
  tabs: readonly SegmentedTab<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Prefix for the tabs' ids, so a tabpanel can point back with aria-labelledby. */
  idBase: string;
  /** The id of the tabpanel the tabs control. */
  panelId?: string;
  /**
   * Names every tab ('all'), or only the selected one ('selected'): the
   * others show just their icon, named by a tooltip.
   */
  labels?: 'all' | 'selected';
  /** A clicked tab presses like a key. */
  press?: boolean;
  className?: string;
}

/** The id of the tab for `value`, for the controlled tabpanel's aria-labelledby. */
export const segmentedTabId = (idBase: string, value: string) => `${idBase}-tab-${value}`;

/**
 * A labelled segmented control that switches what an area shows. It's a
 * tablist: one tab is selected, Tab lands on it, and the arrow keys, Home and
 * End move the selection.
 */
function SegmentedTabs<T extends string>({ label, tabs, value, onChange, idBase, panelId, labels = 'all', press: pressOnClick = false, className = '' }: SegmentedTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const { press, pressing } = useKeyPress<T>();

  const select = (index: number) => {
    const i = (index + tabs.length) % tabs.length;
    onChange(tabs[i].value);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[i]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const current = tabs.findIndex(t => t.value === value);
    if (e.key === 'ArrowRight') select(current + 1);
    else if (e.key === 'ArrowLeft') select(current - 1);
    else if (e.key === 'Home') select(0);
    else if (e.key === 'End') select(tabs.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`inline-flex items-center gap-1 p-1 rounded-lg bg-surface border border-border ${className}`}
    >
      {tabs.map(({ value: tabValue, label: tabLabel, icon: Icon }, i) => {
        const selected = tabValue === value;
        const iconOnly = !!Icon && labels === 'selected' && !selected;
        return (
          <button
            key={tabValue}
            type="button"
            role="tab"
            id={segmentedTabId(idBase, tabValue)}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            aria-label={iconOnly ? tabLabel : undefined}
            data-tip={iconOnly ? tabLabel : undefined}
            data-tip-align={iconOnly && i === tabs.length - 1 ? 'end' : undefined}
            {...(iconOnly ? longPressTip : {})}
            onClick={() => { if (pressOnClick) press(tabValue); onChange(tabValue); }}
            className={`flex items-center gap-1.5 ${iconOnly ? 'px-2' : 'px-2.5 sm:px-3'} py-1.5 rounded-md text-xs sm:text-sm whitespace-nowrap transition-colors ${
              selected
                ? 'bg-accent-subtle text-accent font-semibold'
                : 'font-medium text-text-secondary hover:text-text-primary hover:bg-surface-raised'
            } ${pressing(tabValue) ? 'key-press-play' : ''}`}
          >
            {Icon && <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />}
            {!iconOnly && tabLabel}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedTabs;
