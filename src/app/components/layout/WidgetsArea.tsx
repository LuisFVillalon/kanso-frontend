'use client';

import React, { useLayoutEffect, useRef } from 'react';
import { CalendarDays, Shapes } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { usePersistedPref } from '@/app/hooks/usePersistedPref';
import SegmentedTabs, { segmentedTabId, type SegmentedTab } from '@/app/components/common/SegmentedTabs';
import WeekView from '@/app/components/calendar/WeekView';

export type WidgetsView = 'widgets' | 'week';
export const isWidgetsView = (c: unknown): c is WidgetsView => c === 'widgets' || c === 'week';
/** A dragged week calendar height in px, or null to fit the widgets' box. */
const isWeekHeight = (c: unknown): c is number | null => c === null || (typeof c === 'number' && Number.isFinite(c) && c > 0);

const TABS: readonly SegmentedTab<WidgetsView>[] = [
  { value: 'widgets', label: 'Widgets', icon: Shapes },
  { value: 'week', label: 'Week', icon: CalendarDays },
];

const TABS_ID = 'home-widgets';
const TABPANEL_ID = 'home-widgets-tabpanel';
/** How long the area takes to grow or shrink to the other view's height. */
const SWITCH_MS = 220;

/**
 * The home page's widgets section: the widget grid, or the week calendar in
 * its place, switched by the tabs at its top right (the selected one named,
 * the other an icon). The choice is remembered on
 * this device, per user, and so is the height the week calendar was dragged
 * to, which it opens at every time. Switching views eases the area to the
 * other view's height rather than jumping.
 */
const WidgetsArea: React.FC<{ widgets: React.ReactNode }> = ({ widgets }) => {
  const { dataUserId } = useAuth();
  const [view, setView] = usePersistedPref<WidgetsView>(`tm-home-widgets-view:${dataUserId ?? 'guest'}`, 'widgets', isWidgetsView);
  const [weekHeightPx, setWeekHeightPx] = usePersistedPref<number | null>(`tm-home-week-height:${dataUserId ?? 'guest'}`, null, isWeekHeight);
  const areaRef = useRef<HTMLDivElement>(null);
  // The area's height just before a switch, which the new view eases from.
  const switchFromPx = useRef<number | null>(null);

  const changeView = (next: WidgetsView) => {
    if (next !== view) switchFromPx.current = areaRef.current?.offsetHeight ?? null;
    setView(next);
  };

  useLayoutEffect(() => {
    const area = areaRef.current;
    const from = switchFromPx.current;
    switchFromPx.current = null;
    if (!area || from === null || typeof area.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const to = area.offsetHeight;
    if (to === from) return;
    // Clipped while it eases, so the taller view doesn't spill out before the area reaches it.
    area.animate(
      [{ height: `${from}px`, overflow: 'hidden' }, { height: `${to}px`, overflow: 'hidden' }],
      { duration: SWITCH_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    );
  }, [view]);

  return (
    <section aria-label="Widgets" className="space-y-2">
      <div className="flex justify-end">
        <SegmentedTabs
          label="Widgets or week"
          tabs={TABS}
          value={view}
          onChange={changeView}
          idBase={TABS_ID}
          panelId={TABPANEL_ID}
          labels="selected"
          press
        />
      </div>
      <div id={TABPANEL_ID} role="tabpanel" aria-labelledby={segmentedTabId(TABS_ID, view)}>
        {/* Both views share one grid cell. The widgets set its height and the week calendar
            fills that same box, so switching doesn't shift the page or leave blank space.
            The minimum keeps the week calendar usable when there are only a few widgets.
            A dragged height grows the box past the widgets'. */}
        <div ref={areaRef} className="grid grid-cols-1 min-h-[20rem]">
          <div className={`[grid-area:1/1] ${view === 'week' ? 'invisible' : ''}`} inert={view === 'week'} aria-hidden={view === 'week' || undefined}>
            {widgets}
          </div>
          {view === 'week' && (
            <div className="[grid-area:1/1] relative mb-4 sm:mb-6" style={weekHeightPx === null ? undefined : { minHeight: weekHeightPx }}>
              <div className="absolute inset-0"><WeekView fill heightPx={weekHeightPx} onResize={setWeekHeightPx} /></div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default WidgetsArea;
