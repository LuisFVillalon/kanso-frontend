'use client';

import React from 'react';
import { CalendarDays, LayoutGrid } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { usePersistedPref } from '@/app/hooks/usePersistedPref';
import SegmentedTabs, { segmentedTabId, type SegmentedTab } from '@/app/components/common/SegmentedTabs';
import WeekView from '@/app/components/calendar/WeekView';

export type WidgetsView = 'widgets' | 'week';
export const isWidgetsView = (c: unknown): c is WidgetsView => c === 'widgets' || c === 'week';

const TABS: readonly SegmentedTab<WidgetsView>[] = [
  { value: 'widgets', label: 'Widgets', icon: LayoutGrid },
  { value: 'week', label: 'Week calendar', icon: CalendarDays },
];

const TABS_ID = 'home-widgets';
const TABPANEL_ID = 'home-widgets-tabpanel';

/**
 * The home page's widgets section: the widget grid, or the week calendar in
 * its place, switched by the tabs at its top right. The choice is remembered on
 * this device, per user.
 */
const WidgetsArea: React.FC<{ widgets: React.ReactNode }> = ({ widgets }) => {
  const { dataUserId } = useAuth();
  const [view, setView] = usePersistedPref<WidgetsView>(`tm-home-widgets-view:${dataUserId ?? 'guest'}`, 'widgets', isWidgetsView);

  return (
    <section aria-label="Widgets" className="space-y-2">
      <div className="flex justify-end">
        <SegmentedTabs
          label="Widgets or week calendar"
          tabs={TABS}
          value={view}
          onChange={setView}
          idBase={TABS_ID}
          panelId={TABPANEL_ID}
        />
      </div>
      <div id={TABPANEL_ID} role="tabpanel" aria-labelledby={segmentedTabId(TABS_ID, view)}>
        {/* Both views share one grid cell. The widgets set its height and the week calendar
            fills that same box, so switching doesn't shift the page or leave blank space.
            The minimum keeps the week calendar usable when there are only a few widgets. */}
        <div className="grid grid-cols-1 min-h-[20rem]">
          <div className={`[grid-area:1/1] ${view === 'week' ? 'invisible' : ''}`} inert={view === 'week'} aria-hidden={view === 'week' || undefined}>
            {widgets}
          </div>
          {view === 'week' && (
            <div className="[grid-area:1/1] relative mb-4 sm:mb-6">
              <div className="absolute inset-0"><WeekView fill /></div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default WidgetsArea;
