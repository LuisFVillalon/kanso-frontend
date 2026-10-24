import { useCallback, useEffect, useState } from 'react';
import { fetchEventReport } from '@/app/lib/backend-api';
import type { EventReport } from '@/app/types/event';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import type { ReportPeriod } from '@/app/utils/calendarReport';
import { useEventsVersion } from './useEventsVersion';

interface FetchedEventReport {
  key: string;
  report: EventReport;
}

const periodKey = (p: ReportPeriod) => `${p.kind}:${toLocalDateStr(p.start)}`;

/**
 * Loads Reports → Events for a period: GET /get-event-report over the whole
 * period (past archived occurrences count, upcoming archived ones don't).
 * Reloads when events change.
 */
export function useEventReport(period: ReportPeriod) {
  const [fetched, setFetched] = useState<FetchedEventReport | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const eventsVersion = useEventsVersion();
  const key = periodKey(period);

  useEffect(() => {
    let cancelled = false;
    fetchEventReport(toLocalDateStr(period.start), toLocalDateStr(period.end))
      .then(report => {
        if (!cancelled) setFetched({ key, report });
      })
      .catch(err => {
        console.error('[useEventReport] Failed to fetch the event report:', err);
        if (!cancelled) setError({ key, message: 'Couldn’t load your events for this period.' });
      });
    return () => {
      cancelled = true;
      setError(null);
    };
    // `key` identifies the period; the Date objects inside it change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, eventsVersion]);

  const ready = fetched?.key === key ? fetched.report : null;
  const failed = !ready && error?.key === key ? error.message : null;
  const retry = useCallback(() => setAttempt(a => a + 1), []);

  return { report: ready, loading: !ready && !failed, error: failed, retry };
}
