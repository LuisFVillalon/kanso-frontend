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
        {/* The widgets stay in the flow either way, so the area keeps their height and
            switching doesn't shift the page; the week calendar overlays them and scrolls inside. */}
        <div className="relative min-h-80">
          <div className={view === 'week' ? 'invisible' : undefined} inert={view === 'week'} aria-hidden={view === 'week' || undefined}>
            {widgets}
          </div>
          {view === 'week' && (
            <div className="absolute inset-0 mb-4 sm:mb-6 overflow-y-auto"><WeekView /></div>
          )}
        </div>
      </div>
    </section>
  );
};

export default WidgetsArea;
