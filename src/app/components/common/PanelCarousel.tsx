'use client';

import React, { forwardRef, useImperativeHandle, useState, useSyncExternalStore } from 'react';
import { Check, GraduationCap, NotebookText, SquareCheckBig, type LucideIcon } from 'lucide-react';
import DragHandle from '@/app/components/common/DragHandle';
import SegmentedTabs, { segmentedTabId } from '@/app/components/common/SegmentedTabs';

/**
 * The home page's panels: Tasks and Notes, plus Canvas when the user has it
 * connected. On a wide screen a chip per panel, above on the right, turns it
 * on or off: one panel on fills the width, two share the resizable split,
 * three sit in resizable columns, and the last one on stays on. A phone shows
 * one panel at a time, picked from tabs, and remembers its pick apart from
 * the wide screen's.
 *
 * Every panel stays mounted once it has been shown, hidden rather than
 * unmounted, so its state (an open note editor, the Canvas tab) survives a
 * switch.
 */

export type PanelKey = 'tasks' | 'notes' | 'canvas';
/**
 * The panels on, as profile.home_panels saves them: comma-separated, in
 * PANEL_ORDER ("tasks,canvas"). Older saves named an ordered pair
 * ("canvas,tasks"); those still read as the panels they name.
 */
export type HomePanels = string;

export const PANEL_ORDER: readonly PanelKey[] = ['tasks', 'notes', 'canvas'];
export const DEFAULT_HOME_PANELS: HomePanels = 'tasks,notes';

export const isPanelKey = (c: unknown): c is PanelKey => PANEL_ORDER.includes(c as PanelKey);

/** The panels `value` turns on, in PANEL_ORDER, or null when it isn't a saved set of panels. */
export function parseHomePanels(value: unknown): PanelKey[] | null {
  if (typeof value !== 'string') return null;
  const keys = value.split(',');
  if (!keys.every(isPanelKey) || new Set(keys).size !== keys.length) return null;
  return PANEL_ORDER.filter(k => keys.includes(k));
}

export const isHomePanels = (c: unknown): c is HomePanels => parseHomePanels(c) !== null;

export const toHomePanels = (keys: readonly PanelKey[]): HomePanels => PANEL_ORDER.filter(k => keys.includes(k)).join(',');

/** The panels on a wide screen: the saved ones that are available, or Tasks and Notes when none of them is. */
export function widePanels(value: HomePanels, available: readonly PanelKey[]): PanelKey[] {
  const on = (parseHomePanels(value) ?? []).filter(k => available.includes(k));
  return on.length > 0 ? on : (parseHomePanels(DEFAULT_HOME_PANELS) as PanelKey[]);
}

/** The panel a phone shows: its saved pick, or Tasks when that isn't available. */
export const phonePanel = (value: PanelKey, available: readonly PanelKey[]): PanelKey =>
  available.includes(value) ? value : 'tasks';

const PANEL_META: Record<PanelKey, { label: string; icon: LucideIcon }> = {
  tasks: { label: 'Tasks', icon: SquareCheckBig },
  notes: { label: 'Notes', icon: NotebookText },
  canvas: { label: 'Canvas', icon: GraduationCap },
};

const PHONE_QUERY = '(max-width: 767px)';

const subscribePhone = (onChange: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const isPhoneNow = () => typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;

/** The width of each divider between panels, in px (DragHandle's w-2). */
const DIVIDER_PX = 8;

export interface PanelCarouselHandle {
  /** Brings `panel` on screen if it isn't showing. */
  show: (panel: PanelKey) => void;
}

interface PanelCarouselProps {
  /** The panels on, on a wide screen. */
  value: HomePanels;
  onChange: (next: HomePanels) => void;
  /** The panel a phone shows. */
  phoneValue: PanelKey;
  onPhoneChange: (next: PanelKey) => void;
  /** The panels the user can see; Canvas only while it's connected. */
  available: readonly PanelKey[];
  /** Each panel's share of the split, in %, for `count` panels side by side. */
  panelWidths: (count: number) => number[];
  splitRef: React.RefObject<HTMLDivElement | null>;
  /** Starts dragging divider `index` (0 is the leftmost) between `count` panels. */
  onDividerPointerDown: (count: number, index: number, e: React.PointerEvent) => void;
  /** Renders a panel; `widthPct` is the share of the split it currently fills. */
  renderPanel: (key: PanelKey, slot: { widthPct: number }) => React.ReactNode;
}

const TABS_ID = 'home-panels';
const TABPANEL_ID = 'home-panels-tabpanel';

interface PanelTogglesProps {
  available: readonly PanelKey[];
  on: readonly PanelKey[];
  onToggle: (panel: PanelKey) => void;
}

/** A chip per panel that turns it on or off; the last one on can't be turned off. */
function PanelToggles({ available, on, onToggle }: PanelTogglesProps) {
  return (
    <div role="group" aria-label="Home panels" className="flex items-center justify-end gap-1.5">
      {available.map(key => {
        const { label, icon: Icon } = PANEL_META[key];
        const isOn = on.includes(key);
        const locked = isOn && on.length === 1;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isOn}
            aria-disabled={locked || undefined}
            title={locked ? 'At least one panel stays on' : `${isOn ? 'Hide' : 'Show'} ${label}`}
            onClick={() => { if (!locked) onToggle(key); }}
            className={`flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full border text-xs sm:text-sm whitespace-nowrap transition-colors ${
              isOn
                ? 'bg-accent-subtle border-accent text-accent font-semibold'
                : 'bg-surface border-border font-medium text-text-secondary hover:text-text-primary hover:border-border-strong'
            } ${locked ? 'cursor-not-allowed' : ''}`}
          >
            <span
              className={`w-3.5 h-3.5 rounded flex items-center justify-center border-[1.5px] ${
                isOn ? 'bg-accent border-accent' : 'border-border-strong'
              }`}
              style={isOn ? { color: 'var(--tm-accent-text)' } : undefined}
              aria-hidden
            >
              {isOn && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
            </span>
            <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}

const PanelCarousel = forwardRef<PanelCarouselHandle, PanelCarouselProps>(function PanelCarousel(
  { value, onChange, phoneValue, onPhoneChange, available, panelWidths, splitRef, onDividerPointerDown, renderPanel },
  ref,
) {
  const phone = useSyncExternalStore(subscribePhone, isPhoneNow, () => false);
  const on = widePanels(value, available);
  const phoneShown = phonePanel(phoneValue, available);
  const shown = phone ? [phoneShown] : on;
  const widths = panelWidths(shown.length);

  // Panels mount the first time they're shown and then stay mounted.
  const [mounted, setMounted] = useState<PanelKey[]>(() => shown);
  const unmounted = shown.filter(k => !mounted.includes(k));
  if (unmounted.length > 0) setMounted([...mounted, ...unmounted]);

  const toggle = (panel: PanelKey) => {
    const next = on.includes(panel) ? on.filter(k => k !== panel) : [...on, panel];
    if (next.length > 0) onChange(toHomePanels(next));
  };

  const show = (panel: PanelKey) => {
    if (shown.includes(panel) || !available.includes(panel)) return;
    if (phone) onPhoneChange(panel);
    else toggle(panel);
  };

  useImperativeHandle(ref, () => ({ show }));

  return (
    <div className="space-y-2">
      {phone ? (
        <div className="flex justify-end">
          <SegmentedTabs
            label="Home panel"
            tabs={available.map(key => ({ value: key, label: PANEL_META[key].label, icon: PANEL_META[key].icon }))}
            value={phoneShown}
            onChange={next => { if (next !== phoneShown) onPhoneChange(next); }}
            idBase={TABS_ID}
            panelId={TABPANEL_ID}
          />
        </div>
      ) : (
        <PanelToggles available={available} on={on} onToggle={toggle} />
      )}

      <div
        ref={splitRef}
        id={TABPANEL_ID}
        role={phone ? 'tabpanel' : undefined}
        aria-labelledby={phone ? segmentedTabId(TABS_ID, phoneShown) : undefined}
        className="flex"
      >
        {PANEL_ORDER.filter(key => mounted.includes(key) && available.includes(key)).map(key => {
          const i = shown.indexOf(key);
          if (i < 0) return <div key={key} data-panel={key} className="hidden">{renderPanel(key, { widthPct: 0 })}</div>;
          // The dividers' width comes out of the panels evenly, so the shares add up to the split.
          const dividers = DIVIDER_PX * (shown.length - 1);
          return (
            <div
              key={key}
              data-panel={key}
              className="split-slot"
              style={{ order: i * 2, ['--slot-w' as string]: `calc(${widths[i]}% - ${dividers / shown.length}px)` }}
            >
              {renderPanel(key, { widthPct: widths[i] })}
            </div>
          );
        })}
        {shown.slice(1).map((_, i) => (
          <div key={`divider-${i}`} data-divider={i} className="hidden md:flex shrink-0" style={{ order: i * 2 + 1 }}>
            <DragHandle onPointerDown={e => onDividerPointerDown(shown.length, i, e)} />
          </div>
        ))}
      </div>
    </div>
  );
});

export default PanelCarousel;
