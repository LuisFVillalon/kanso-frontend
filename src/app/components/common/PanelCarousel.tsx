'use client';

import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, GraduationCap, NotebookText, SquareCheckBig, type LucideIcon } from 'lucide-react';
import DragHandle from '@/app/components/common/DragHandle';

/**
 * The home page's panels: Tasks and Notes, plus Canvas when the user has it
 * connected. A wide screen shows a pair side by side in the resizable split,
 * a phone shows one. The switcher above, on the right, has an icon per choice
 * (the icon of its left panel, named "Tasks & Notes", or "Tasks" on a phone)
 * between previous and next arrows that cycle through them; it's hidden when
 * there's nothing to switch to.
 *
 * Every panel stays mounted once it has been shown, hidden rather than
 * unmounted, so its state (an open note editor, the Canvas tab) survives a
 * switch.
 */

export type PanelKey = 'tasks' | 'notes' | 'canvas';
export type HomePanels = 'tasks,notes' | 'notes,canvas' | 'canvas,tasks';

export const PANEL_ORDER: readonly PanelKey[] = ['tasks', 'notes', 'canvas'];
export const DEFAULT_HOME_PANELS: HomePanels = 'tasks,notes';

// The values profile.home_panels takes. Each pair has its own left panel,
// which is the one a phone shows.
const HOME_PANELS: readonly HomePanels[] = ['tasks,notes', 'notes,canvas', 'canvas,tasks'];

export const isHomePanels = (c: unknown): c is HomePanels => HOME_PANELS.includes(c as HomePanels);

/** The panels on screen: both of the pair, or only the left one on a phone. */
export function shownPanels(value: HomePanels, phone: boolean): PanelKey[] {
  const [left, right] = value.split(',') as PanelKey[];
  return phone ? [left] : [left, right];
}

/** `value`, unless it would show a panel that isn't available (Canvas, disconnected): then Tasks first. */
export function resolvePanels(value: HomePanels, available: readonly PanelKey[], phone: boolean): HomePanels {
  return shownPanels(value, phone).every(k => available.includes(k)) ? value : DEFAULT_HOME_PANELS;
}

/** What the tabs offer: each available pair on a wide screen, each available panel on a phone. */
export function panelChoices(available: readonly PanelKey[], phone: boolean): HomePanels[] {
  return HOME_PANELS.filter(v => resolvePanels(v, available, phone) === v);
}

const PANEL_META: Record<PanelKey, { label: string; icon: LucideIcon }> = {
  tasks: { label: 'Tasks', icon: SquareCheckBig },
  notes: { label: 'Notes', icon: NotebookText },
  canvas: { label: 'Canvas', icon: GraduationCap },
};

/** What a choice shows, by name: "Tasks & Notes", or "Tasks" on a phone. */
const choiceLabel = (value: HomePanels, phone: boolean) =>
  shownPanels(value, phone).map(k => PANEL_META[k].label).join(' & ');

const PHONE_QUERY = '(max-width: 767px)';

const subscribePhone = (onChange: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const isPhoneNow = () => typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;

export interface PanelCarouselHandle {
  /** Brings `panel` on screen if it isn't showing. */
  show: (panel: PanelKey) => void;
}

interface PanelCarouselProps {
  value: HomePanels;
  onChange: (next: HomePanels) => void;
  /** The panels the user can see; Canvas only while it's connected. */
  available: readonly PanelKey[];
  /** The left panel's share of the split, in %. */
  leftWidthPct: number;
  splitRef: React.RefObject<HTMLDivElement | null>;
  onSplitterPointerDown: (e: React.PointerEvent) => void;
  /** Renders a panel; `widthPct` is the share of the split it currently fills. */
  renderPanel: (key: PanelKey, slot: { widthPct: number }) => React.ReactNode;
}

const TABS_ID = 'home-panels';
const TABPANEL_ID = 'home-panels-tabpanel';

const tabId = (value: HomePanels) => `${TABS_ID}-tab-${value}`;

interface PanelSwitcherProps {
  choices: readonly HomePanels[];
  value: HomePanels;
  phone: boolean;
  onChange: (next: HomePanels) => void;
}

/**
 * The icon tablist with its arrows. The arrows and the arrow keys wrap
 * around, so each always has somewhere to go; Home and End jump to the ends.
 */
function PanelSwitcher({ choices, value, phone, onChange }: PanelSwitcherProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const index = choices.indexOf(value);
  const at = (i: number) => choices[(i + choices.length) % choices.length];

  const focusTab = (next: HomePanels) => {
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[choices.indexOf(next)]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    let next: HomePanels;
    if (e.key === 'ArrowRight') next = at(index + 1);
    else if (e.key === 'ArrowLeft') next = at(index - 1);
    else if (e.key === 'Home') next = choices[0];
    else if (e.key === 'End') next = choices[choices.length - 1];
    else return;
    e.preventDefault();
    onChange(next);
    focusTab(next);
  };

  const arrow = (step: 1 | -1) => {
    const target = at(index + step);
    const Icon = step < 0 ? ChevronLeft : ChevronRight;
    const name = step < 0 ? 'Previous' : 'Next';
    return (
      <button
        type="button"
        aria-label={`${name}: ${choiceLabel(target, phone)}`}
        title={`${name}: ${choiceLabel(target, phone)}`}
        onClick={() => onChange(target)}
        className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
      >
        <Icon className="w-4 h-4" aria-hidden />
      </button>
    );
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {arrow(-1)}
      <div
        ref={listRef}
        role="tablist"
        aria-label="Home panels"
        onKeyDown={onKeyDown}
        className="inline-flex items-center gap-1 p-1 rounded-lg bg-surface border border-border"
      >
        {choices.map(choice => {
          const selected = choice === value;
          const label = choiceLabel(choice, phone);
          const Icon = PANEL_META[shownPanels(choice, phone)[0]].icon;
          return (
            <button
              key={choice}
              type="button"
              role="tab"
              id={tabId(choice)}
              aria-label={label}
              title={label}
              aria-selected={selected}
              aria-controls={TABPANEL_ID}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(choice)}
              className={`p-1.5 rounded-md transition-colors ${
                selected
                  ? 'bg-accent-subtle text-accent ring-1 ring-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden />
            </button>
          );
        })}
      </div>
      {arrow(1)}
    </div>
  );
}

const PanelCarousel = forwardRef<PanelCarouselHandle, PanelCarouselProps>(function PanelCarousel(
  { value, onChange, available, leftWidthPct, splitRef, onSplitterPointerDown, renderPanel },
  ref,
) {
  const phone = useSyncExternalStore(subscribePhone, isPhoneNow, () => false);
  const current = resolvePanels(value, available, phone);
  const choices = panelChoices(available, phone);
  const [left, right] = current.split(',') as PanelKey[];
  const shown = shownPanels(current, phone);

  // Panels mount the first time they're shown and then stay mounted.
  const [mounted, setMounted] = useState<PanelKey[]>(() => [left, right]);
  const unmounted = shown.filter(k => !mounted.includes(k));
  if (unmounted.length > 0) setMounted([...mounted, ...unmounted]);

  const choose = useCallback((next: HomePanels) => {
    if (next !== current) onChange(next);
  }, [current, onChange]);

  const show = useCallback((panel: PanelKey) => {
    if (shown.includes(panel)) return;
    const next = choices.find(v => shownPanels(v, phone)[0] === panel) ?? choices.find(v => shownPanels(v, phone).includes(panel));
    if (next) choose(next);
  }, [shown, choices, phone, choose]);

  useImperativeHandle(ref, () => ({ show }), [show]);

  const hasTabs = choices.length > 1;

  const slotProps = (key: PanelKey): { className: string; style?: React.CSSProperties; widthPct: number } => {
    if (key === left) return { className: 'split-slot split-left', style: { order: 0 }, widthPct: phone ? 100 : leftWidthPct };
    if (key === right) return { className: 'split-slot split-right hidden md:block', style: { order: 2 }, widthPct: 100 - leftWidthPct };
    return { className: 'hidden', widthPct: 0 };
  };

  return (
    <div className="space-y-2">
      {hasTabs && (
        <PanelSwitcher choices={choices} value={current} phone={phone} onChange={choose} />
      )}

      <div
        ref={splitRef}
        id={TABPANEL_ID}
        role={hasTabs ? 'tabpanel' : undefined}
        aria-labelledby={hasTabs ? tabId(current) : undefined}
        className="flex"
        style={{ ['--tasks-w' as string]: `${leftWidthPct}%` }}
      >
        {PANEL_ORDER.filter(key => mounted.includes(key) && available.includes(key)).map(key => {
          const { className, style, widthPct } = slotProps(key);
          return (
            <div key={key} data-panel={key} className={className} style={style}>
              {renderPanel(key, { widthPct })}
            </div>
          );
        })}
        <div className="hidden md:flex shrink-0" style={{ order: 1 }}>
          <DragHandle onPointerDown={onSplitterPointerDown} />
        </div>
      </div>
    </div>
  );
});

export default PanelCarousel;
