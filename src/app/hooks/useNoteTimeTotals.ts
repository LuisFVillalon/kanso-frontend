'use client';

import { useEffect, useState } from 'react';
import { fetchNoteTimeSpentForRange } from '@/app/lib/backend-api';

/**
 * Fetches total time-spent (seconds) per note, keyed by note id, restricted
 * to closed sessions that ended within [startDate, endDate] (inclusive,
 * "YYYY-MM-DD") — refetches whenever the range changes.
 */
export function useNoteTimeTotalsForRange(startDate: string, endDate: string): Record<number, number> {
  const [totals, setTotals] = useState<Record<number, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetchNoteTimeSpentForRange(startDate, endDate)
      .then(result => { if (!cancelled) setTotals(result); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  return totals;
}

/**
 * Fetches total time-spent (seconds) per note, per day, for a set of dates —
 * one fetchNoteTimeSpentForRange(date, date) call per date, run in parallel,
 * keyed by date in the result. A single multi-day range call only returns
 * per-note totals summed across the whole range, which can't be attributed
 * back to individual days when a note was edited on more than one of them —
 * this is for charts (e.g. a week trend) that need that per-day breakdown.
 */
export function useNoteTimeTotalsByDay(dates: string[]): Record<string, Record<number, number>> {
  const [totalsByDay, setTotalsByDay] = useState<Record<string, Record<number, number>>>({});
  const key = dates.join(',');

  useEffect(() => {
    let cancelled = false;
    Promise.all(dates.map(d => fetchNoteTimeSpentForRange(d, d).then(totals => [d, totals] as const)))
      .then(results => { if (!cancelled) setTotalsByDay(Object.fromEntries(results)); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return totalsByDay;
}
