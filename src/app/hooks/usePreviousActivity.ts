import { useEffect, useRef, useState } from 'react';
import { fetchCalendarActivity } from '@/app/lib/backend-api';
import { useEventsVersion } from '@/app/hooks/useEventsVersion';
import type { CalendarActivity } from '@/app/types/activity';
import { shiftPeriod, type ReportPeriod } from '@/app/utils/calendarReport';
import { toLocalDateStr } from '@/app/utils/dateUtils';

export interface PreviousActivity {
  /** The period before the one shown. */
  period: ReportPeriod;
  /** Null while it loads or when it failed. */
  activity: CalendarActivity | null;
  loading: boolean;
  /** Whether it failed to load; only the Pace card says so. */
  error: boolean;
}

const periodKey = (p: ReportPeriod) => `${p.kind}:${toLocalDateStr(p.start)}`;

/**
 * Loads the calendar activity of the period before `period`, which the
 * Overview's Pace card compares with. It keeps its own error, so a failure
 * costs only that card. Only loads while `enabled` (the Overview is open),
 * and keeps what it loaded, so going back to Overview doesn't load it again.
 * Reloads when events change, like useCalendarReport.
 */
export function usePreviousActivity(period: ReportPeriod, enabled: boolean): PreviousActivity {
  const previous = shiftPeriod(period, -1);
  const key = periodKey(previous);
  const eventsVersion = useEventsVersion();
  const [fetched, setFetched] = useState<{ key: string; activity: CalendarActivity } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  // What was last loaded, as "key@eventsVersion".
  const loaded = useRef<string | null>(null);

  useEffect(() => {
    const version = `${key}@${eventsVersion}`;
    if (!enabled || loaded.current === version) return;
    let cancelled = false;
    fetchCalendarActivity(toLocalDateStr(previous.start), toLocalDateStr(previous.end), { includeArchived: true })
      .then(activity => {
        if (cancelled) return;
        loaded.current = version;
        setFetched({ key, activity });
      })
      .catch(err => {
        console.error('[usePreviousActivity] Failed to fetch calendar activity:', err);
        if (!cancelled) setFailedKey(key);
      });
    return () => {
      cancelled = true;
      setFailedKey(null);
    };
    // `key` identifies the period; the Date objects inside it change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, eventsVersion]);

  const activity = fetched?.key === key ? fetched.activity : null;
  const error = !activity && failedKey === key;
  return { period: previous, activity, loading: !activity && !error, error };
}
