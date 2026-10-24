import { useCallback, useEffect, useState } from 'react';
import { fetchCalendarActivity } from '@/app/lib/backend-api';
import { useTasksContext } from '@/app/context/TasksContext';
import { useEventsVersion } from '@/app/hooks/useEventsVersion';
import type { CalendarActivity } from '@/app/types/activity';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { addDays } from '@/app/utils/weekLayout';

interface ActivityResult {
  /** The request this result answers — see `requestKey` below. */
  key: string;
  activity: CalendarActivity | null;
  error: boolean;
}

/**
 * Loads GET /get-calendar-activity for the seven days starting `weekStart`.
 * Refetches when the week changes and whenever the server confirms a task
 * completion toggle or archive (TasksContext's completionSyncToken) or an
 * event changes (useEventsVersion), so
 * completions made elsewhere on the page show up without a reload. Call
 * `refetch` after any other change that alters activity (e.g. a habit date
 * toggled). While a refetch is in flight the last result stays on screen.
 */
export function useWeekActivity(weekStart: Date) {
  const { completionSyncToken } = useTasksContext();
  const eventsVersion = useEventsVersion();
  const [result, setResult] = useState<ActivityResult | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const startStr = toLocalDateStr(weekStart);
  const endStr = toLocalDateStr(addDays(weekStart, 6));
  const requestKey = `${startStr}|${completionSyncToken}|${eventsVersion}|${reloadToken}`;

  useEffect(() => {
    let cancelled = false;
    fetchCalendarActivity(startStr, endStr)
      .then(activity => {
        if (!cancelled) setResult({ key: requestKey, activity, error: false });
      })
      .catch(err => {
        console.error('[useWeekActivity] Failed to fetch calendar activity:', err);
        if (!cancelled) setResult(prev => ({ key: requestKey, activity: prev?.activity ?? null, error: true }));
      });
    return () => { cancelled = true; };
  }, [requestKey, startStr, endStr]);

  const refetch = useCallback(() => setReloadToken(t => t + 1), []);

  // Only hand back activity for the week being asked about, so last week's
  // sessions never paint onto this week's grid while it loads.
  const activity = result?.activity?.start_date === startStr ? result.activity : null;

  return {
    activity,
    loading: result?.key !== requestKey,
    error: result?.key === requestKey && result.error,
    refetch,
  };
}
