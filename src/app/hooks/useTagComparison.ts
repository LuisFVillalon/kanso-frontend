import { useEffect, useMemo, useState } from 'react';
import { fetchCalendarActivity } from '@/app/lib/backend-api';
import type { CalendarActivity } from '@/app/types/activity';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import type { ReportPeriod } from '@/app/utils/calendarReport';
import { comparisonRange, type ComparisonRange } from '@/app/utils/tagReport';

export interface TagComparison extends ComparisonRange {
  activity: CalendarActivity;
}

/**
 * The activity the "Where your time went" card compares a period against:
 * the period before it, cut to the same number of days while this one is
 * still running. A week's report already loads the 4 weeks to its end, which
 * covers the week before, so only a month or year loads it separately.
 * Null while it loads, if it fails (the card just leaves the change out) or
 * for a period that hasn't started.
 */
export function useTagComparison(period: ReportPeriod, activity: CalendarActivity): TagComparison | null {
  const periodKey = `${period.kind}:${toLocalDateStr(period.start)}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = useMemo(() => comparisonRange(period), [periodKey]);
  const needsFetch = period.kind !== 'week' && range !== null;
  const rangeKey = range ? `${toLocalDateStr(range.start)}:${toLocalDateStr(range.end)}` : null;
  const [fetched, setFetched] = useState<{ key: string; activity: CalendarActivity } | null>(null);

  useEffect(() => {
    if (!needsFetch || !range || !rangeKey) return;
    let cancelled = false;
    fetchCalendarActivity(toLocalDateStr(range.start), toLocalDateStr(range.end), { includeArchived: true })
      .then(prev => {
        if (!cancelled) setFetched({ key: rangeKey, activity: prev });
      })
      .catch(err => console.error('[useTagComparison] Failed to fetch the previous period:', err));
    return () => {
      cancelled = true;
    };
    // `rangeKey` identifies the range; its Date objects change identity with the period.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFetch, rangeKey]);

  if (!range) return null;
  if (!needsFetch) return { ...range, activity };
  return fetched?.key === rangeKey ? { ...range, activity: fetched.activity } : null;
}
