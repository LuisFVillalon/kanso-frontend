import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCalendarActivity } from '@/app/lib/backend-api';
import { useHabitsContext } from '@/app/context/HabitsContext';
import type { CalendarActivity } from '@/app/types/activity';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { buildCalendarReport, reportCutoffs, shiftPeriod, type CalendarReport, type ReportPeriod } from '@/app/utils/calendarReport';

interface FetchedReport {
  key: string;
  current: CalendarActivity;
  previous: CalendarActivity;
}

const periodKey = (p: ReportPeriod) => `${p.kind}:${toLocalDateStr(p.start)}`;

const fetchPeriod = (p: ReportPeriod) => fetchCalendarActivity(toLocalDateStr(p.start), toLocalDateStr(p.end));

/**
 * Loads a report period's calendar activity and the period before it (one
 * call each — a year fits in one), and summarizes both. A period still in
 * progress is compared with the same number of days of the previous one
 * (`partial`). Habit streaks come from the shared habits list, since the
 * activity endpoint doesn't carry them.
 */
export function useCalendarReport(period: ReportPeriod) {
  const { habits } = useHabitsContext();
  const [fetched, setFetched] = useState<FetchedReport | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = periodKey(period);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPeriod(period), fetchPeriod(shiftPeriod(period, -1))])
      .then(([current, previous]) => {
        if (!cancelled) setFetched({ key, current, previous });
      })
      .catch(err => {
        console.error('[useCalendarReport] Failed to fetch calendar activity:', err);
        if (!cancelled) setError({ key, message: 'Couldn’t load this report.' });
      });
    return () => { cancelled = true; };
    // `key` identifies the period; the Date objects inside it change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const ready = fetched?.key === key ? fetched : null;
  const failed = !ready && error?.key === key ? error.message : null;

  const reports = useMemo((): { current: CalendarReport; previous: CalendarReport; partial: boolean } | null => {
    if (!ready) return null;
    const now = new Date();
    const cutoffs = reportCutoffs(period, now);
    return {
      current: buildCalendarReport(ready.current, period, habits, now, cutoffs.current),
      previous: buildCalendarReport(ready.previous, shiftPeriod(period, -1), habits, now, cutoffs.previous),
      partial: cutoffs.current !== undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, habits]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt(a => a + 1);
  }, []);

  return {
    report: reports?.current ?? null,
    previous: reports?.previous ?? null,
    partial: reports?.partial ?? false,
    loading: !ready && !failed,
    error: failed,
    retry,
  };
}
