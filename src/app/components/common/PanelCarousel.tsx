'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react';
import { GraduationCap, Maximize2, Minimize2, NotebookText, Plus, SquareCheckBig, X, type LucideIcon } from 'lucide-react';
import DragHandle from '@/app/components/common/DragHandle';
import { longPressTip } from '@/app/components/common/longPressTip';
import { useKeyPress } from '@/app/hooks/useKeyPress';

/**
 * The home page's panels: Tasks and Notes, plus Canvas when the user has it
 * connected. On a wide screen the panels are their own controls: one panel on
 * fills the width, two share the resizable split, three sit in resizable
 * columns. A hidden panel waits as a slim rail at the right edge: tap it to
 * show that panel alone, or its + to add it beside the others. Each panel's
 * header can show it alone (maximize) or hide it, and a panel shown alone can
 * go back to the last split; the last panel on stays on. A phone shows one
 * panel at a time, swiped between or picked from icon tabs, and remembers its
 * pick apart from the wide screen's.
 *
 * Every panel stays mounted once it has been shown, hidden rather than
 * unmounted, so its state (an open note editor, the Canvas tab) survives a
 * switch. A phone mounts them all, side by side, so the next one is there to
 * swipe to.
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

/** The panels a single shown panel goes back to: the remembered split, when it's still more than one panel. */
export function restorePanels(split: HomePanels, available: readonly PanelKey[]): PanelKey[] | null {
  const keys = (parseHomePanels(split) ?? []).filter(k => available.includes(k));
  return keys.length > 1 ? keys : null;
}

/** The panel a phone shows: its saved pick, or Tasks when that isn't available. */
export const phonePanel = (value: PanelKey, available: readonly PanelKey[]): PanelKey =>
  available.includes(value) ? value : 'tasks';

const PANEL_META: Record<PanelKey, { label: string; icon: LucideIcon }> = {
  tasks: { label: 'Tasks', icon: SquareCheckBig },
  notes: { label: 'Notes', icon: NotebookText },
  canvas: { label: 'Canvas', icon: GraduationCap },
};

/** "Tasks + Notes": a set of panels, named. */
const panelsName = (keys: readonly PanelKey[]) => keys.map(k => PANEL_META[k].label).join(' + ');

const PHONE_QUERY = '(max-width: 767px)';

const subscribePhone = (onChange: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const isPhoneNow = () => typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;
const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The width of each divider between panels, in px (DragHandle's w-2). */
const DIVIDER_PX = 8;
/** The gap between a phone's panels as they're swiped, in px (the track's gap-3). */
const TRACK_GAP_PX = 12;
/** How long a phone's swipe has to rest before it counts as landing on a panel. */
const SWIPE_SETTLE_MS = 100;

export interface PanelCarouselHandle {
  /** Brings `panel` on screen if it isn't showing. */
  show: (panel: PanelKey) => void;
}

interface PanelCarouselProps {
  /** The panels on, on a wide screen. */
  value: HomePanels;
  onChange: (next: HomePanels) => void;
  /** The last split (more than one panel) on a wide screen, which a panel shown alone goes back to. */
  splitValue: HomePanels;
  onSplitChange: (next: HomePanels) => void;
  /** The panel a phone shows. */
  phoneValue: PanelKey;
  onPhoneChange: (next: PanelKey) => void;
  /** The panels the user can see; Canvas only while it's connected. */
  available: readonly PanelKey[];
  /** Each panel's share of the split, in %, for `count` panels side by side. */
  panelWidths: (count: number) => number[];
  /** Whether the dividers between `count` panels side by side can be dragged; they're hidden when not. */
  dividersMovable: (count: number) => boolean;
  splitRef: React.RefObject<HTMLDivElement | null>;
  /** Starts dragging divider `index` (0 is the leftmost) between `count` panels. */
  onDividerPointerDown: (count: number, index: number, e: React.PointerEvent) => void;
  /** Renders a panel; `widthPct` is the share of the split it currently fills. */
  renderPanel: (key: PanelKey, slot: { widthPct: number }) => React.ReactNode;
}

const TABS_ID = 'home-panels';
export const panelTabId = (key: PanelKey) => `${TABS_ID}-tab-${key}`;
export const panelTabpanelId = (key: PanelKey) => `${TABS_ID}-tabpanel-${key}`;

/** A small icon button on a panel's header or rail, named by its tooltip. */
function PanelControl({ label, icon: Icon, pressed, onClick, tipSide }: {
  label: string;
  icon: LucideIcon;
  pressed: boolean;
  onClick: () => void;
  tipSide?: 'left';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={label}
      data-tip-align={tipSide ? undefined : 'end'}
      data-tip-side={tipSide}
      {...longPressTip}
      onClick={onClick}
      className={`flex items-center justify-center w-7 h-7 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors ${pressed ? 'key-press-play' : ''}`}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </button>
  );
}

const PanelCarousel = forwardRef<PanelCarouselHandle, PanelCarouselProps>(function PanelCarousel(
  { value, onChange, splitValue, onSplitChange, phoneValue, onPhoneChange, available, panelWidths, dividersMovable, splitRef, onDividerPointerDown, renderPanel },
  ref,
) {
  const phone = useSyncExternalStore(subscribePhone, isPhoneNow, () => false);
  const on = widePanels(value, available);
  const phoneShown = phonePanel(phoneValue, available);
  const shown = phone ? [phoneShown] : on;
  const widths = panelWidths(on.length);
  const dividerCount = dividersMovable(on.length) ? on.length - 1 : 0;
  const restoreTo = restorePanels(splitValue, available);
  const hidden = available.filter(k => !on.includes(k));
  const { press, pressing } = useKeyPress<string>();

  // Panels mount the first time they're shown and then stay mounted; a phone shows them all to swipe between.
  const [mounted, setMounted] = useState<PanelKey[]>(() => shown);
  const unmounted = (phone ? available : shown).filter(k => !mounted.includes(k));
  if (unmounted.length > 0) setMounted([...mounted, ...unmounted]);

  /** Shows `next` on a wide screen, remembering the latest split for going back to. */
  const setPanels = (next: readonly PanelKey[]) => {
    if (next.length === 0) return;
    if (next.length > 1) onSplitChange(toHomePanels(next));
    else if (on.length > 1) onSplitChange(toHomePanels(on));
    onChange(toHomePanels(next));
  };
  const act = (pressKey: string, run: () => void) => { press(pressKey); run(); };

  const show = (panel: PanelKey) => {
    if (shown.includes(panel) || !available.includes(panel)) return;
    if (phone) onPhoneChange(panel);
    else setPanels([...on, panel]);
  };

  useImperativeHandle(ref, () => ({ show }));

  // ── Phone: the swipe track and its tabs ───────────────────────────────
  const barRef = useRef<HTMLSpanElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrolledOnce = useRef(false);
  const phoneIndex = available.indexOf(phoneShown);
  const trackPosition = (track: HTMLElement) => track.scrollLeft / (track.clientWidth + TRACK_GAP_PX);

  // The track follows the tabs: a tab picked (or show()) scrolls to its panel.
  useEffect(() => {
    const track = splitRef.current;
    if (!phone || !track) return;
    const left = phoneIndex * (track.clientWidth + TRACK_GAP_PX);
    if (Math.abs(track.scrollLeft - left) > 1 && typeof track.scrollTo === 'function') {
      track.scrollTo({ left, behavior: scrolledOnce.current && !prefersReducedMotion() ? 'smooth' : 'instant' });
    }
    scrolledOnce.current = true;
  }, [phone, phoneIndex, splitRef]);

  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);
  useEffect(() => { if (!phone) scrolledOnce.current = false; }, [phone]);

  // The tabs follow the track: the underline tracks a swipe, and the panel it rests on is picked.
  const onTrackScroll = () => {
    const track = splitRef.current;
    if (!track) return;
    if (barRef.current) barRef.current.style.transform = `translateX(${trackPosition(track) * 100}%)`;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      const landed = available[Math.round(trackPosition(track))];
      if (landed && landed !== phoneShown) onPhoneChange(landed);
    }, SWIPE_SETTLE_MS);
  };

  const pickTab = (index: number, focus: boolean) => {
    const key = available[(index + available.length) % available.length];
    press(`tab-${key}`);
    if (key !== phoneShown) onPhoneChange(key);
    if (focus) document.getElementById(panelTabId(key))?.focus();
  };
  const onTabsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') pickTab(phoneIndex + 1, true);
    else if (e.key === 'ArrowLeft') pickTab(phoneIndex - 1, true);
    else if (e.key === 'Home') pickTab(0, true);
    else if (e.key === 'End') pickTab(available.length - 1, true);
    else return;
    e.preventDefault();
  };

  const phoneTabs = (
    <div role="tablist" aria-label="Home panel" onKeyDown={onTabsKeyDown} className="relative flex border-b border-border">
      {available.map((key, i) => {
        const { label, icon: Icon } = PANEL_META[key];
        const selected = key === phoneShown;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            id={panelTabId(key)}
            aria-selected={selected}
            aria-controls={panelTabpanelId(key)}
            aria-label={label}
            tabIndex={selected ? 0 : -1}
            data-tip={label}
            data-tip-align={i === available.length - 1 ? 'end' : undefined}
            {...longPressTip}
            onClick={() => pickTab(i, false)}
            className={`flex-1 flex items-center justify-center h-10 transition-colors ${
              selected ? 'text-accent' : 'text-text-muted hover:text-text-primary'
            } ${pressing(`tab-${key}`) ? 'key-press-play' : ''}`}
          >
            <Icon className="w-[18px] h-[18px]" aria-hidden />
          </button>
        );
      })}
      <span
        ref={barRef}
        aria-hidden
        className="absolute -bottom-px left-0 h-0.5 rounded-full bg-accent transition-transform duration-150 ease-out"
        style={{ width: `${100 / available.length}%`, transform: `translateX(${phoneIndex * 100}%)` }}
      />
    </div>
  );

  const panelHead = (key: PanelKey) => {
    const { label, icon: Icon } = PANEL_META[key];
    return (
      <div className="flex items-center gap-1.5 h-8 mb-1.5 pl-1 text-text-muted">
        <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide truncate">{label}</span>
        <div role="group" aria-label={`${label} panel`} className="ml-auto flex items-center gap-0.5">
          {on.length > 1 ? (
            <>
              <PanelControl label={`Show only ${label}`} icon={Maximize2} pressed={pressing(`max-${key}`)} onClick={() => act(`max-${key}`, () => setPanels([key]))} />
              <PanelControl label={`Hide ${label}`} icon={X} pressed={pressing(`hide-${key}`)} onClick={() => act(`hide-${key}`, () => setPanels(on.filter(k => k !== key)))} />
            </>
          ) : restoreTo && toHomePanels(restoreTo) !== toHomePanels(on) && (
            <PanelControl label={`Back to ${panelsName(restoreTo)}`} icon={Minimize2} pressed={pressing('restore')} onClick={() => act('restore', () => setPanels(restoreTo))} />
          )}
        </div>
      </div>
    );
  };

  const rails = hidden.length > 0 && (
    <div role="group" aria-label="Hidden panels" className="flex flex-col gap-2 w-10 flex-shrink-0 pt-[2.375rem]">
      {hidden.map(key => {
        const { label, icon: Icon } = PANEL_META[key];
        return (
          <div
            key={key}
            data-rail={key}
            className="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl border border-dashed border-border-strong bg-surface text-text-muted hover:text-text-primary hover:border-accent transition-colors"
          >
            <button
              type="button"
              aria-label={`Show only ${label}`}
              data-tip={`Show only ${label}`}
              data-tip-side="left"
              {...longPressTip}
              onClick={() => act(`rail-${key}`, () => setPanels([key]))}
              className={`flex-1 flex flex-col items-center gap-2.5 w-8 py-2 rounded-lg hover:bg-surface-raised transition-colors ${pressing(`rail-${key}`) ? 'key-press-play' : ''}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
              <span aria-hidden className="text-xs font-semibold [writing-mode:vertical-rl]">{label}</span>
            </button>
            <PanelControl label={`Add ${label} beside the others`} icon={Plus} tipSide="left" pressed={pressing(`add-${key}`)} onClick={() => act(`add-${key}`, () => setPanels([...on, key]))} />
          </div>
        );
      })}
    </div>
  );

  // One tree for both layouts, every panel at the same place in it whether
  // it's shown, hidden or swiped to, so switching never remounts one.
  const dividers = DIVIDER_PX * dividerCount;
  return (
    <div className={phone ? 'space-y-2' : undefined}>
      {phone && phoneTabs}
      <div className={phone ? undefined : 'flex gap-2'}>
        <div
          ref={splitRef}
          onScroll={phone ? onTrackScroll : undefined}
          className={phone ? 'flex gap-3 overflow-x-auto snap-x snap-mandatory overscroll-x-contain scrollbar-none' : 'flex flex-1 min-w-0'}
        >
          {PANEL_ORDER.filter(key => mounted.includes(key) && available.includes(key)).map(key => {
            const i = on.indexOf(key);
            if (phone) {
              return (
                <div
                  key={key}
                  id={panelTabpanelId(key)}
                  role="tabpanel"
                  aria-labelledby={panelTabId(key)}
                  data-panel={key}
                  className="split-slot snap-start snap-always"
                  inert={key !== phoneShown}
                >
                  {null}
                  {renderPanel(key, { widthPct: 100 })}
                </div>
              );
            }
            if (i < 0) return <div key={key} data-panel={key} className="hidden">{null}{renderPanel(key, { widthPct: 0 })}</div>;
            // The dividers' width comes out of the panels evenly, so the shares add up to the split.
            return (
              <div
                key={key}
                role="region"
                aria-label={PANEL_META[key].label}
                data-panel={key}
                className="split-slot"
                style={{ order: i * 2, ['--slot-w' as string]: `calc(${widths[i]}% - ${dividers / on.length}px)` }}
              >
                {panelHead(key)}
                {renderPanel(key, { widthPct: widths[i] })}
              </div>
            );
          })}
          {!phone && on.slice(1, dividerCount + 1).map((_, i) => (
            <div key={`divider-${i}`} data-divider={i} className="hidden md:flex shrink-0" style={{ order: i * 2 + 1 }}>
              <DragHandle onPointerDown={e => onDividerPointerDown(on.length, i, e)} />
            </div>
          ))}
        </div>
        {!phone && rails}
      </div>
    </div>
  );
});

export default PanelCarousel;
