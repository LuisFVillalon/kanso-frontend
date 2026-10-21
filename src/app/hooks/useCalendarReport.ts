import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCalendarActivity } from '@/app/lib/backend-api';
import { useHabitsContext } from '@/app/context/HabitsContext';
import type { CalendarActivity } from '@/app/types/activity';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { buildCalendarReport, type ReportPeriod } from '@/app/utils/calendarReport';
import { moodSummaryScope } from '@/app/utils/moodReport';

interface FetchedReport {
  key: string;
  activity: CalendarActivity;
}

const periodKey = (p: ReportPeriod) => `${p.kind}:${toLocalDateStr(p.start)}`;

/**
 * Loads a report period's calendar activity (one call — a year fits in one)
 * and summarizes it. Archived tasks, notes and habits count too — the report
 * covers everything the user did, not just what's still active. Habit streaks
 * come from the shared habits list, since the activity endpoint doesn't carry them.
 * A week loads the 4 weeks to its end, which its mood summary compares
 * against; the report itself still covers only the week.
 */
export function useCalendarReport(period: ReportPeriod) {
  const { habits } = useHabitsContext();
  const [fetched, setFetched] = useState<FetchedReport | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = periodKey(period);

  useEffect(() => {
    let cancelled = false;
    const start = period.kind === 'week' ? moodSummaryScope(period).start : period.start;
    fetchCalendarActivity(toLocalDateStr(start), toLocalDateStr(period.end), { includeArchived: true })
      .then(activity => {
        if (!cancelled) setFetched({ key, activity });
      })
      .catch(err => {
        console.error('[useCalendarReport] Failed to fetch calendar activity:', err);
        if (!cancelled) setError({ key, message: 'Couldn’t load this report.' });
      });
    return () => {
      cancelled = true;
      setError(null);
    };
    // `key` identifies the period; the Date objects inside it change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const ready = fetched?.key === key ? fetched : null;
  const failed = !ready && error?.key === key ? error.message : null;

  const report = useMemo(
    () => (ready ? buildCalendarReport(ready.activity, period, habits) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, habits],
  );

  const retry = useCallback(() => setAttempt(a => a + 1), []);

  return {
    report,
    activity: ready?.activity ?? null,
    loading: !ready && !failed,
    error: failed,
    retry,
  };
}
